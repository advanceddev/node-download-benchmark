import { describe, it, expect } from 'vitest';
import { BenchmarkError, isBenchmarkError } from '../src/errors.js';

describe('BenchmarkError', () => {
  it('sets name, code, message and details', () => {
    const err = new BenchmarkError('boom', 'TIMEOUT', { attempt: 1 });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BenchmarkError);
    expect(err.name).toBe('BenchmarkError');
    expect(err.message).toBe('boom');
    expect(err.code).toBe('TIMEOUT');
    expect(err.details).toEqual({ attempt: 1 });
  });

  it('freezes details', () => {
    const err = new BenchmarkError('x', 'INVALID_URL', { a: 1 });
    expect(Object.isFrozen(err.details)).toBe(true);
  });

  it('defaults details to empty object', () => {
    const err = new BenchmarkError('x', 'UNKNOWN');
    expect(err.details).toEqual({});
  });
});

describe('isBenchmarkError', () => {
  it('returns true for BenchmarkError instances', () => {
    expect(isBenchmarkError(new BenchmarkError('a', 'TIMEOUT'))).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isBenchmarkError(new Error('x'))).toBe(false);
    expect(isBenchmarkError(null)).toBe(false);
    expect(isBenchmarkError('TIMEOUT')).toBe(false);
  });
});
