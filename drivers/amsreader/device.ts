import Homey from 'homey';
import { AmsClient, AmsData } from '../../lib/AmsClient';

// The device is marked unavailable after this many polls in a row fail.
const MAX_FAILURES = 3;

class AmsReaderDevice extends Homey.Device {
  private client!: AmsClient;
  private timer?: NodeJS.Timeout;
  private failures = 0;

  async onInit() {
    this.setupClient(this.getSettings());
    this.startPolling(this.getSetting('poll_interval'));
  }

  async onSettings({ newSettings }: { newSettings: { [key: string]: any } }) {
    this.setupClient(newSettings);
    this.startPolling(newSettings.poll_interval);
  }

  async onUninit() {
    this.stopPolling();
  }

  async onDeleted() {
    this.stopPolling();
  }

  private setupClient(settings: { [key: string]: any }) {
    this.client = new AmsClient(settings.address, settings.username, settings.password);
  }

  private startPolling(intervalSeconds: number) {
    this.stopPolling();
    this.timer = this.homey.setInterval(() => this.poll(), intervalSeconds * 1000);
    this.poll().catch(this.error);
  }

  private stopPolling() {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = undefined;
  }

  private async poll() {
    try {
      const data = await this.client.getData();
      await this.update(data);
      this.failures = 0;
      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      this.failures++;
      this.error(`Poll failed (${this.failures}):`, (err as Error).message);
      if (this.failures >= MAX_FAILURES && this.getAvailable()) {
        await this.setUnavailable((err as Error).message).catch(this.error);
      }
    }
  }

  private async update(d: AmsData) {
    const values: [string, number][] = [
      ['measure_power', d.w],
      ['measure_voltage.l1', d.l1.u],
      ['measure_voltage.l2', d.l2.u],
      ['measure_voltage.l3', d.l3.u],
      ['measure_current.l1', d.l1.i],
      ['measure_current.l2', d.l2.i],
      ['measure_current.l3', d.l3.i],
    ];
    // Meters such as Aidon only send the counters once an hour, and the firmware reports 0
    // until the first one arrives. Writing that 0 would make Homey Energy see a reset.
    if (d.ic > 0) values.push(['meter_power.imported', d.ic]);
    if (d.ec > 0 || d.ic > 0) values.push(['meter_power.exported', d.ec]);

    // The firmware reports -127 when no temperature sensor is connected.
    if (d.t > -50 && d.t < 125) {
      if (!this.hasCapability('measure_temperature')) await this.addCapability('measure_temperature');
      values.push(['measure_temperature', d.t]);
    }

    await Promise.all(values
      .filter(([cap, value]) => this.getCapabilityValue(cap) !== value)
      .map(([cap, value]) => this.setCapabilityValue(cap, value)));
  }
}

module.exports = AmsReaderDevice;
