export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}

export function found<T>(row: T | undefined, what: string): T {
  return row ?? fail(404, 'NOT_FOUND', `ไม่พบ${what}`);
}
