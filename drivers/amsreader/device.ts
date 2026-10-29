import Homey from 'homey';
import { AmsClient, AmsData } from '../../lib/AmsClient';
import { AmsError } from '../../lib/AmsError';
import { capabilityValues, meterOk, OPTIONAL_CAPABILITIES } from '../../lib/values';

// The device is marked unavailable after this many polls in a row fail.
const MAX_FAILURES = 3;

class AmsReaderDevice extends Homey.Device {
  private client!: AmsClient;
  private timer?: NodeJS.Timeout;
  private polling = false;
  private failures = 0;
  private meterWasOk?: boolean;
  private lastHourUsage?: number;
  private lastThreshold?: number;

  async onInit() {
    // Devices paired with an earlier version get the capabilities added since. The optional ones
    // follow the readings in update().
    for (const cap of this.driver.manifest.capabilities as string[]) {
      if (!OPTIONAL_CAPABILITIES.includes(cap) && !this.hasCapability(cap)) await this.addCapability(cap);
    }
    this.restart(this.getSettings());
  }

  async onSettings({ newSettings }: { newSettings: { [key: string]: any } }) {
    this.restart(newSettings);
  }

  async onUninit() {
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
    this.restart(this.getSettings());
  }

  // Builds the client from the settings and polls now and then every poll_interval seconds.
  private restart(settings: { [key: string]: any }) {
    this.client = new AmsClient(settings.address, settings.username, settings.password);
    this.stopPolling();
    this.timer = this.homey.setInterval(() => this.poll(), settings.poll_interval * 1000);
    this.poll().catch(this.error);
  }

  private stopPolling() {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = undefined;
  }

  private async poll() {
    // The reader serves one client at a time, so a slow answer must not get a second request.
    if (this.polling) return;
    this.polling = true;
    try {
      await this.update(await this.client.getData());
      this.failures = 0;
      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      this.failures++;
      this.error(`Poll failed (${this.failures}):`, (err as Error).message);
      if (this.failures >= MAX_FAILURES && this.getAvailable()) {
        const message = err instanceof AmsError ? err.localize(this.homey) : (err as Error).message;
        await this.setUnavailable(message).catch(this.error);
      }
    } finally {
      this.polling = false;
    }
  }

  private async update(d: AmsData) {
    const estimateL2 = d.l2.e === true && this.getSetting('estimate_l2') !== false;
    const values = capabilityValues(d, { estimateL2 });
    await this.syncCapabilities(new Set(values.map(([cap]) => cap)), estimateL2);
    await Promise.all(values
      .filter(([cap, value]) => this.getCapabilityValue(cap) !== value)
      .map(([cap, value]) => this.setCapabilityValue(cap, value)));
    await this.fireTriggers(d);
  }

  // Adds the optional capabilities this reading has a value for. Only L2 current is removed
  // again, since it goes for good (no estimate on an IT network); the others can be missing
  // from a single reading, and removing a capability deletes its Insights history.
  private async syncCapabilities(present: Set<string>, estimateL2: boolean) {
    for (const cap of OPTIONAL_CAPABILITIES) {
      if (present.has(cap) && !this.hasCapability(cap)) await this.addCapability(cap);
    }
    if (!present.has('measure_current.l2') && this.hasCapability('measure_current.l2')) {
      await this.removeCapability('measure_current.l2');
    }
    if (estimateL2) {
      const title = this.homey.__('capabilities.l2_estimated');
      if (this.getCapabilityOptions('measure_current.l2').title !== title) {
        await this.setCapabilityOptions('measure_current.l2', { title });
      }
    }
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
