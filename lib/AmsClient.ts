// HTTP client for the amsreader firmware's web API (github.com/UtilitechAS/amsreader-firmware).
// /data.json uses the short keys the firmware's own web UI reads; only the ones we use are typed.

import { AmsError } from './AmsError';

export interface AmsPhase {
  u: number; // voltage (V)
  i: number; // current (A)
  p: number; // active import (W)
  q: number; // active export (W)
  e?: boolean; // only on l2: true when the meter does not measure L2 current (IT networks)
}

export interface AmsPeriod {
  u: number; // used (kWh)
  p: number; // produced (kWh)
}

export interface AmsEnergy {
  x: number; // average of this month's highest hours (kW), the base for the capacity step
  t: number; // current capacity step (kW)
  h: AmsPeriod; // this hour
  d: AmsPeriod; // today
}

export interface AmsData {
  w: number; // import minus export (W)
  ic: number; // import counter (kWh)
  ec: number; // export counter (kWh)
  l1: AmsPhase;
  l2: AmsPhase;
  l3: AmsPhase;
  t: number; // temperature (°C), -127 without a sensor
  hm: number; // HAN status, see meterOk() in values.ts
  ea?: AmsEnergy;
}

export interface AmsSysinfo {
  chipId: string;
  mac: string;
  hostname: string;
}

const TIMEOUT_MS = 10000;

export class AmsClient {
  private readonly host: string;
  private readonly headers: Record<string, string> = {};

  constructor(host: string, username = '', password = '') {
    this.host = host;
    if (username) this.headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  getData(): Promise<AmsData> {
    return this.getJson<AmsData>('/data.json');
  }

  getSysinfo(): Promise<AmsSysinfo> {
    return this.getJson<AmsSysinfo>('/sysinfo.json');
  }

  private async getJson<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`http://${this.host}${path}`, {
        // The firmware never redirects these endpoints; following one could take the login elsewhere.
        headers: this.headers, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const { name } = (err as Error);
      throw new AmsError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable', this.host, err as Error);
    }
    if (res.status === 401) throw new AmsError('auth', this.host);
    if (!res.ok) throw new AmsError('not_reader', this.host);
    try {
      return await res.json() as T;
    } catch (err) {
      throw new AmsError('not_reader', this.host, err as Error);
    }
  }
}
