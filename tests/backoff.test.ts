import { describe, it, expect, vi, afterEach } from 'vitest';
import { backoffMs } from '../src/backoff.js';

describe('backoffMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns value within [0, exp] for attempt 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(backoffMs(0, 200, 5000)).toBe(0);

    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    // exp = min(5000, 200 * 1) = 200 → floor(0.999 * 201) = 200
    expect(backoffMs(0, 200, 5000)).toBe(200);
  });

  it('grows exponentially until max', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999999); // near 1 → top of [0, exp]

    // attempt 0 → min(5000, 200) = 200
    expect(backoffMs(0, 200, 5000)).toBe(200);
    // attempt 1 → min(5000, 400) = 400
    expect(backoffMs(1, 200, 5000)).toBe(400);
    // attempt 2 → 800
    expect(backoffMs(2, 200, 5000)).toBe(800);
    // attempt 5 → min(5000, 6400) = 5000
    expect(backoffMs(5, 200, 5000)).toBe(5000);
  });

  it('clamps negative inputs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(backoffMs(-1, 100, 1000)).toBeGreaterThanOrEqual(0);
    expect(backoffMs(0, -50, 100)).toBeGreaterThanOrEqual(0);
  });

  it('handles max < min by using min', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999999);
    expect(backoffMs(0, 500, 100)).toBe(500);
  });
});
