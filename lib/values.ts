import { AmsData, AmsPhase } from './AmsClient';

// Meters disagree on the sign of the phase current (Aidon sends one that does not follow the
// direction of power), so the sign is taken from the phase's power: negative while it exports.
export function phaseCurrent(phase: AmsPhase): number {
  const current = Math.abs(phase.i);
  return phase.p - phase.q < 0 ? -current : current;
}

// HAN status from /data.json: 1 data within 15 s, 2 within 30 s or waiting for the first frame
// after boot, 3 no data or error. Firmware before 2.6 used 0 for the wait after boot.
export function meterOk(d: AmsData): boolean | undefined {
  if (d.hm === 0) return undefined;
  return d.hm === 1 || d.hm === 2;
}

// The capability values one /data.json reading gives, as [capability, value] pairs.
export function capabilityValues(d: AmsData): [string, number][] {
  // Power is import minus export, so it goes negative while solar panels export.
  const values: [string, number][] = [
    ['measure_power', d.w],
    ['measure_voltage.l1', d.l1.u],
    ['measure_voltage.l2', d.l2.u],
    ['measure_voltage.l3', d.l3.u],
    ['measure_current.l1', phaseCurrent(d.l1)],
    ['measure_current.l3', phaseCurrent(d.l3)],
  ];
  if (!d.l2.e) values.push(['measure_current.l2', phaseCurrent(d.l2)]);
  // Not all meters send power per phase (Aidon does not); the firmware then reports 0.
  const phases = [d.l1, d.l2, d.l3];
  if (phases.some((phase) => phase.p !== 0 || phase.q !== 0)) {
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
