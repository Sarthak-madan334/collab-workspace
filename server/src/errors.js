export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function error(status, code, message) { return new AppError(status, code, message); }
export function assert(condition, status, code, message) {
  if (!condition) throw error(status, code, message);
}
export function isDuplicateKey(err) { return err?.code === 11000; }
export function publicError(err) {
  return err instanceof AppError ? err : error(503, 'SERVICE_UNAVAILABLE', 'The workspace is temporarily unavailable');
}
