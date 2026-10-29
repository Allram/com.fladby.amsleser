import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AmsData } from '../lib/AmsClient';
import {
  capabilityValues, estimateL2Current, meterOk, phaseCurrent,
} from '../lib/values';

function data(overrides: Partial<AmsData> = {}): AmsData {
  const phase = {
    u: 230, i: 2, p: 460, q: 0,
  };
  return {
    w: 1380,
    ic: 1000.5,
    ec: 20.25,
    l1: { ...phase },
    l2: { ...phase },
    l3: { ...phase },
    t: -127,
    hm: 1,
    ea: {
      x: 4.2, t: 5, h: { u: 0.8, p: 0 }, d: { u: 12.3, p: 4.5 },
    },
    ...overrides,
  };
}

const asMap = (d: AmsData) => new Map(capabilityValues(d));

test('power and phase power go negative while exporting', () => {
  const v = asMap(data({
    w: -900,
    l1: {
      u: 230, i: 4, p: 0, q: 900,
    },
  }));
  assert.equal(v.get('measure_power'), -900);
  assert.equal(v.get('measure_power.l1'), -900);
  assert.equal(v.get('measure_current.l1'), -4);
});

test('phase power only when the meter sends it, L2 current not on IT networks', () => {
  const zero = {
    u: 230, i: 2, p: 0, q: 0,
  };
  const v = asMap(data({ l1: { ...zero }, l2: { ...zero, e: true }, l3: { ...zero } }));
  assert.equal(v.has('measure_power.l1'), false);
  assert.equal(v.has('measure_current.l2'), false);
  assert.equal(v.get('measure_current.l3'), 2);
});

test('phase current takes its sign from the phase power, not from the meter', () => {
  assert.equal(phaseCurrent({
    u: 230, i: -1.5, p: 345, q: 0,
  }, -500), 1.5);
  assert.equal(phaseCurrent({
    u: 230, i: 1.5, p: 0, q: 345,
  }, 500), -1.5);
  // Without power per phase (Aidon) the total power decides.
  assert.equal(phaseCurrent({
    u: 230, i: -1.5, p: 0, q: 0,
  }, 600), 1.5);
  assert.equal(phaseCurrent({
    u: 230, i: 1.5, p: 0, q: 0,
  }, -600), -1.5);
});

test('daily import and export come from the energy accounting', () => {
  const v = asMap(data());
  assert.equal(v.get('ams_day_import'), 12.3);
  assert.equal(v.get('ams_day_export'), 4.5);
  assert.equal(v.get('ams_hour_usage'), 0.8);
  assert.equal(v.get('ams_threshold'), 5);
});

test('counters are left out until the meter has sent them', () => {
  const v = asMap(data({ ic: 0, ec: 0 }));
  assert.equal(v.has('meter_power.imported'), false);
  assert.equal(v.has('meter_power.exported'), false);
});

test('temperature only with a sensor connected', () => {
  assert.equal(asMap(data()).has('measure_temperature'), false);
  assert.equal(asMap(data({ t: 21.5 })).get('measure_temperature'), 21.5);
});

test('meter status', () => {
  assert.equal(meterOk(data({ hm: 1 })), true);
  assert.equal(meterOk(data({ hm: 2 })), true);
  assert.equal(meterOk(data({ hm: 3 })), false);
  assert.equal(meterOk(data({ hm: 0 })), undefined);
});

test('L2 current is estimated on IT networks when asked for', () => {
  const it = data({
    l1: {
      u: 236, i: 3.2, p: 0, q: 0,
    },
    l2: {
      u: 237, i: 0, p: 0, q: 0, e: true,
    },
    l3: {
      u: 234, i: -1.5, p: 0, q: 0,
    },
  });
  assert.equal(estimateL2Current(it), 2.77);
  assert.equal(asMap(it).has('measure_current.l2'), false);
  assert.equal(new Map(capabilityValues(it, { estimateL2: true })).get('measure_current.l2'), 2.77);
  // Balanced load: all three currents equal.
  assert.equal(estimateL2Current(data({
    l1: {
      u: 230, i: 5, p: 0, q: 0,
    },
    l3: {
      u: 230, i: 5, p: 0, q: 0,
    },
  })), 5);
});
