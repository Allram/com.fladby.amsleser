import Homey from 'homey';
import { AmsClient } from '../../lib/AmsClient';
import { AmsError } from '../../lib/AmsError';

interface ConnectRequest {
  address: string;
  username?: string;
  password?: string;
  ssdpId?: string;
  // Picked from the discovery list rather than typed in, with the name shown there.
  discovered?: boolean;
  name?: string;
}

interface Reader {
  address: string;
  ssdpId?: string;
  name: string;
}

// The key under "errors" for a failed connect while pairing. A reader picked from the list was
// typed by no one, so it gets no advice to check its address or password.
function pairErrorCode(err: AmsError, discovered: boolean, hasLogin: boolean): string {
  if (err.code === 'auth' && !hasLogin) return 'auth_required';
  if (discovered && (err.code === 'timeout' || err.code === 'unreachable')) return 'found_unreachable';
  return err.code;
}

class AmsReaderDriver extends Homey.Driver {
  async onInit() {
    // Fires when this hour's usage went from below the card's limit to at or above it.
    this.homey.flow.getDeviceTriggerCard('hour_usage_exceeded')
      .registerRunListener(async (args, state) => state.previous < args.kwh && state.usage >= args.kwh);

    this.homey.flow.getConditionCard('meter_ok')
      .registerRunListener(async (args) => args.device.isMeterOk());

    this.homey.flow.getConditionCard('hour_usage_above')
      .registerRunListener(async (args) => args.device.getCapabilityValue('ams_hour_usage') > args.kwh);
  }

  async onPair(session: Homey.Driver.PairSession) {
    // Readers found with SSDP (the driver's strategy, which also follows a reader to a new IP)
    // and mDNS, for the list on the pairing page. Only addresses that answer /sysinfo.json are
    // kept, since the mDNS search for http services also finds other devices named ams-*.
    // A reader found at several addresses is listed once, by IPv4 when it has one. IPv6
    // link-local addresses are left out, as they need a zone to be reached.
    session.setHandler('discover', async () => {
      const found = new Map<string, string | undefined>();
      for (const result of this.discoveryResults('amsreader-mdns')) found.set(result.address, undefined);
      for (const result of this.discoveryResults('amsreader')) found.set(result.address, result.id);
      const readers = new Map<string, Reader>();
      await Promise.all([...found]
        .filter(([address]) => !address.toLowerCase().startsWith('fe80:'))
        .map(async ([address, ssdpId]) => {
          const sysinfo = await new AmsClient(address).getSysinfo().catch(() => undefined);
          if (!sysinfo?.chipId) return;
          const known = readers.get(sysinfo.chipId);
          if (!known || (known.address.includes(':') && !address.includes(':'))) {
            readers.set(sysinfo.chipId, { address, ssdpId: ssdpId ?? known?.ssdpId, name: sysinfo.hostname || address });
          } else if (!known.ssdpId) {
            known.ssdpId = ssdpId;
          }
        }));
      return [...readers.values()];
    });

    // Tests the connection and returns the device for Homey.createDevice() on the pairing page,
    // or the error as { error: { code, message } } so the page can lead on from it.
    session.setHandler('connect', async ({
      address, username = '', password = '', ssdpId, discovered = false, name,
    }: ConnectRequest) => {
      const host = address.trim();
      const client = new AmsClient(host, username, password);
      // One request at a time: the reader serves a single client.
      let sysinfo;
      try {
        sysinfo = await client.getSysinfo();
        await client.getData();
      } catch (err) {
        if (!(err instanceof AmsError)) throw err;
        const code = pairErrorCode(err, discovered, username !== '');
        return { error: { code, message: this.homey.__(`errors.${code}`, { host: name || err.host }) } };
      }
      return {
        // A reader picked from the list keeps the name it was listed with, so two readers differ.
        name: (discovered && sysinfo.hostname) || this.homey.__('pair.default_name'),
        data: { id: sysinfo.chipId || sysinfo.mac || host },
        store: { ssdpId },
        settings: { address: host, username, password },
      };
    });
  }

  private discoveryResults(strategyId: string): { address: string; id: string }[] {
    try {
      return Object.values(this.homey.discovery.getStrategy(strategyId).getDiscoveryResults());
    } catch (err) {
      this.error(`Discovery ${strategyId}:`, (err as Error).message);
      return [];
    }
  }
}

module.exports = AmsReaderDriver;
