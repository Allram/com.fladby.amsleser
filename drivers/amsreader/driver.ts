import Homey from 'homey';
import { AmsClient } from '../../lib/AmsClient';

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
    // Readers found with SSDP, for the list on the pairing page. The host name comes from the
    // reader itself, since the SSDP headers differ between the ESP8266 and ESP32 builds.
    session.setHandler('discover', async () => {
      const results = Object.values(this.getDiscoveryStrategy().getDiscoveryResults()) as Homey.DiscoveryResultSSDP[];
      return Promise.all(results.map(async (result) => {
        const sysinfo = await new AmsClient(result.address).getSysinfo().catch(() => undefined);
        return { address: result.address, ssdpId: result.id, name: sysinfo?.hostname || result.address };
      }));
    });

    // Tests the connection and returns the device for Homey.createDevice() on the pairing page.
    session.setHandler('connect', async ({
      address, username = '', password = '', ssdpId,
    }: ConnectRequest) => {
      const host = address.trim();
      const client = new AmsClient(host, username, password);
      const [sysinfo] = await Promise.all([client.getSysinfo(), client.getData()]);
      return {
        name: this.homey.__('pair.default_name'),
        data: { id: sysinfo.chipId || sysinfo.mac || host },
        store: { ssdpId },
        settings: { address: host, username, password },
      };
    });
  }
}

module.exports = AmsReaderDriver;
