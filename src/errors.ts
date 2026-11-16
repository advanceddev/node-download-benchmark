import type { BenchmarkErrorCode } from './types.js';

/**
 * Typed application error with a stable machine-readable code.
 * Used for validation, SSRF blocks, timeouts, and HTTP failures.
 */
export class BenchmarkError extends Error {
  readonly name = 'BenchmarkError';
  readonly code: BenchmarkErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: BenchmarkErrorCode,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.details = Object.freeze({ ...details });

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isBenchmarkError(err: unknown): err is BenchmarkError {
  return err instanceof BenchmarkError;
}
