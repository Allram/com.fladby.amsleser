import Homey from 'homey';
import { AmsClient } from '../../lib/AmsClient';

interface ConnectRequest {
  address: string;
  username?: string;
  password?: string;
}

class AmsReaderDriver extends Homey.Driver {
  async onPair(session: Homey.Driver.PairSession) {
    // Tests the connection and returns the device for Homey.createDevice() on the pairing page.
    session.setHandler('connect', async ({ address, username = '', password = '' }: ConnectRequest) => {
      const host = address.trim();
      const client = new AmsClient(host, username, password);
      const [sysinfo] = await Promise.all([client.getSysinfo(), client.getData()]);
      return {
        name: this.homey.__('pair.default_name'),
        data: { id: sysinfo.chipId || sysinfo.mac || host },
        settings: { address: host, username, password },
      };
    });
  }
}

module.exports = AmsReaderDriver;
