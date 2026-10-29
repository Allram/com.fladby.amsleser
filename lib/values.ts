import { AmsData, AmsPhase } from './AmsClient';

function hasPower(phase: AmsPhase): boolean {
  return phase.p !== 0 || phase.q !== 0;
}

// Meters disagree on the sign of the phase current (Aidon sends one that does not follow the
// direction of power), so the sign is taken from the phase's power: negative while it exports.
// Meters without power per phase get the sign of the total power.
export function phaseCurrent(phase: AmsPhase, totalPower: number): number {
  const current = Math.abs(phase.i);
  const power = hasPower(phase) ? phase.p - phase.q : totalPower;
  return power < 0 ? -current : current;
}

// HAN status from /data.json: 1 data within 15 s, 2 within 30 s or waiting for the first frame
// after boot, 3 no data or error. Firmware before 2.6 used 0 for the wait after boot.
export function meterOk(d: AmsData): boolean | undefined {
  return d.hm === 0 ? undefined : d.hm <= 2;
}

// Capabilities that depend on the meter and the reader: on a device only while a reading has
// a value for them. The rest of the driver's capabilities are always there.
export const OPTIONAL_CAPABILITIES = [
  'measure_current.l2', 'measure_power.l1', 'measure_power.l2', 'measure_power.l3', 'measure_temperature',
];

// Meters on IT networks measure L1 and L3 only. With three wires the currents add up to zero,
// so with the load evenly spread (L1 and L3 120° apart) |I2| = sqrt(I1² + I3² − I1·I3).
export function estimateL2Current(d: AmsData): number {
  const i1 = Math.abs(d.l1.i);
  const i3 = Math.abs(d.l3.i);
  const current = Math.round(Math.sqrt(Math.max(0, i1 * i1 + i3 * i3 - i1 * i3)) * 100) / 100;
  return d.w < 0 ? -current : current;
}

// The capability values one /data.json reading gives, as [capability, value] pairs.
export function capabilityValues(d: AmsData, options: { estimateL2?: boolean } = {}): [string, number][] {
  // Power is import minus export, so it goes negative while solar panels export.
  const values: [string, number][] = [
    ['measure_power', d.w],
    ['measure_voltage.l1', d.l1.u],
    ['measure_voltage.l2', d.l2.u],
    ['measure_voltage.l3', d.l3.u],
    ['measure_current.l1', phaseCurrent(d.l1, d.w)],
    ['measure_current.l3', phaseCurrent(d.l3, d.w)],
  ];
  if (!d.l2.e) values.push(['measure_current.l2', phaseCurrent(d.l2, d.w)]);
  else if (options.estimateL2) values.push(['measure_current.l2', estimateL2Current(d)]);
  // Not all meters send power per phase (Aidon does not); the firmware then reports 0.
  const phases = [d.l1, d.l2, d.l3];
  if (phases.some(hasPower)) {
    phases.forEach((phase, n) => values.push([`measure_power.l${n + 1}`, phase.p - phase.q]));
  }
  // Meters such as Aidon only send the counters once an hour, and the firmware reports 0
  // until the first one arrives. Writing that 0 would make Homey Energy see a reset.
  if (d.ic > 0) {
    values.push(['meter_power.imported', d.ic]);
    values.push(['meter_power.exported', d.ec]);
  }
  if (d.ea) {
    values.push(['ams_hour_usage', d.ea.h.u]);
    values.push(['ams_day_import', d.ea.d.u]);
    values.push(['ams_day_export', d.ea.d.p]);
    values.push(['ams_month_max', d.ea.x]);
    values.push(['ams_threshold', d.ea.t]);
  }
  // The firmware reports -127 when no temperature sensor is connected.
  if (d.t > -50 && d.t < 125) values.push(['measure_temperature', d.t]);
  return values;
}
