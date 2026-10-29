// What went wrong talking to the reader, as a key under "errors" in the locales.
export type AmsErrorCode = 'timeout' | 'unreachable' | 'auth' | 'not_reader';

export class AmsError extends Error {
  readonly code: AmsErrorCode;
  readonly host: string;

  constructor(code: AmsErrorCode, host: string, cause?: Error) {
    super(`${code} (${host})${cause ? `: ${cause.message}` : ''}`);
    this.code = code;
    this.host = host;
  }

  // The message for the user, in Homey's language.
  localize(homey: { __: (key: string, tags?: object) => string }): string {
    return homey.__(`errors.${this.code}`, { host: this.host });
  }
}
