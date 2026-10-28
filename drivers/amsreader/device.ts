import Homey from 'homey';
import { AmsClient, AmsData } from '../../lib/AmsClient';
import { capabilityValues, meterOk } from '../../lib/values';

// The device is marked unavailable after this many polls in a row fail.
const MAX_FAILURES = 3;

// Capabilities that depend on the meter and the reader: added when /data.json has a value.
const OPTIONAL = ['measure_temperature', 'measure_power.l1', 'measure_power.l2', 'measure_power.l3'];

class AmsReaderDevice extends Homey.Device {
  private client!: AmsClient;
  private timer?: NodeJS.Timeout;
  private failures = 0;
  private meterWasOk?: boolean;
  private lastHourUsage?: number;
  private lastThreshold?: number;

  async onInit() {
    // Devices paired with an earlier version get the capabilities added since.
    // measure_current.l2 is left out here, as update() removes it again on IT networks.
    for (const cap of this.driver.manifest.capabilities as string[]) {
      if (!this.hasCapability(cap) && cap !== 'measure_current.l2') await this.addCapability(cap);
    }
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

  // Discovery: follow the reader to a new IP address. Only devices paired from the
  // discovery list have the SSDP id; manually added ones keep their address.
  onDiscoveryResult(result: Homey.DiscoveryResultSSDP) {
    return result.id === this.getStoreValue('ssdpId');
  }

  async onDiscoveryAvailable(result: Homey.DiscoveryResultSSDP) {
    await this.updateAddress(result.address);
  }

  async onDiscoveryAddressChanged(result: Homey.DiscoveryResultSSDP) {
    await this.updateAddress(result.address);
  }

  isMeterOk(): boolean {
    return this.meterWasOk !== false;
  }

  private async updateAddress(address: string) {
    if (!address || address === this.getSetting('address')) return;
    this.log('Reader moved to', address);
    await this.setSettings({ address });
    this.setupClient(this.getSettings());
    this.poll().catch(this.error);
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
    const values = capabilityValues(d);
    for (const [cap] of values) {
      if (OPTIONAL.includes(cap) && !this.hasCapability(cap)) await this.addCapability(cap);
    }
    // A meter that sends no power per phase while power flows never will (0.2.0 added these
    // capabilities to every device).
    if (d.w !== 0 && !values.some(([cap]) => cap === 'measure_power.l1')) {
      for (const cap of ['measure_power.l1', 'measure_power.l2', 'measure_power.l3']) {
        if (this.hasCapability(cap)) await this.removeCapability(cap);
      }
    }
    // Meters in IT networks do not measure the L2 current.
    if (d.l2.e && this.hasCapability('measure_current.l2')) await this.removeCapability('measure_current.l2');
    await Promise.all(values
      .filter(([cap, value]) => this.hasCapability(cap) && this.getCapabilityValue(cap) !== value)
      .map(([cap, value]) => this.setCapabilityValue(cap, value)));
    await this.fireTriggers(d);
  }

  private async fireTriggers(d: AmsData) {
    const ok = meterOk(d);
    if (ok !== undefined) {
      if (this.meterWasOk === true && !ok) await this.trigger('meter_lost', {});
      if (this.meterWasOk === false && ok) await this.trigger('meter_restored', {});
      this.meterWasOk = ok;
    }
    if (!d.ea) return;

    const usage = d.ea.h.u;
    // A lower value than last time means a new hour has started.
    const previous = this.lastHourUsage !== undefined && usage >= this.lastHourUsage ? this.lastHourUsage : 0;
    if (usage > previous) await this.trigger('hour_usage_exceeded', { usage }, { usage, previous });
    this.lastHourUsage = usage;

    if (this.lastThreshold !== undefined && d.ea.t !== this.lastThreshold) {
      await this.trigger('threshold_changed', { threshold: d.ea.t });
    }
    this.lastThreshold = d.ea.t;
  }

  private async trigger(id: string, tokens: object, state: object = {}) {
    await this.homey.flow.getDeviceTriggerCard(id).trigger(this, tokens, state).catch(this.error);
  }
}

module.exports = AmsReaderDevice;
