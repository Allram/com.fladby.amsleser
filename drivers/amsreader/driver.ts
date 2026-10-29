import Homey from 'homey';
import { AmsClient } from '../../lib/AmsClient';
import { AmsError } from '../../lib/AmsError';

interface ConnectRequest {
  address: string;
  username?: string;
  password?: string;
  ssdpId?: string;
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
    session.setHandler('discover', async () => {
      const found = new Map<string, string | undefined>();
      for (const result of this.discoveryResults('amsreader-mdns')) found.set(result.address, undefined);
      for (const result of this.discoveryResults('amsreader')) found.set(result.address, result.id);
      const readers = await Promise.all([...found].map(async ([address, ssdpId]) => {
        const sysinfo = await new AmsClient(address).getSysinfo().catch(() => undefined);
        return sysinfo?.chipId ? { address, ssdpId, name: sysinfo.hostname || address } : undefined;
      }));
      return readers.filter((reader) => reader !== undefined);
    });

    // Tests the connection and returns the device for Homey.createDevice() on the pairing page.
    session.setHandler('connect', async ({
      address, username = '', password = '', ssdpId,
    }: ConnectRequest) => {
      const host = address.trim();
      const client = new AmsClient(host, username, password);
      // One request at a time: the reader serves a single client.
      let sysinfo;
      try {
        sysinfo = await client.getSysinfo();
        await client.getData();
      } catch (err) {
        throw err instanceof AmsError ? new Error(err.localize(this.homey)) : err;
      }
      return {
        name: this.homey.__('pair.default_name'),
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
