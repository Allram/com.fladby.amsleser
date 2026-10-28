// HTTP client for the amsreader firmware's web API (github.com/UtilitechAS/amsreader-firmware).
// /data.json uses the short keys the firmware's own web UI reads; only the ones we use are typed.

export interface AmsPhase {
  u: number; // voltage (V)
  i: number; // current (A)
  p: number; // active import (W)
  q: number; // active export (W)
}

export interface AmsData {
  i: number; // active import (W)
  e: number; // active export (W)
  w: number; // import minus export (W)
  ic: number; // import counter (kWh)
  ec: number; // export counter (kWh)
  l1: AmsPhase;
  l2: AmsPhase;
  l3: AmsPhase;
  t: number; // temperature (°C), -127 without a sensor
  hm: number; // HAN status
  c: number; // device clock (epoch seconds)
}

export interface AmsSysinfo {
  version: string;
  chipId: string;
  mac: string;
  hostname: string;
  meter: { mfg: number; model: string; id: string };
}

const TIMEOUT_MS = 10000;

export class AmsClient {
  private readonly host: string;
  private readonly username: string;
  private readonly password: string;

  constructor(host: string, username = '', password = '') {
    this.host = host;
    this.username = username;
    this.password = password;
  }

  getData(): Promise<AmsData> {
    return this.getJson<AmsData>('/data.json');
  }

  getSysinfo(): Promise<AmsSysinfo> {
    return this.getJson<AmsSysinfo>('/sysinfo.json');
  }

  private async getJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.username) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }
    const res = await fetch(`http://${this.host}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401) throw new Error('Wrong username or password');
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
    return await res.json() as T;
  }
}
