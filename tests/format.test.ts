import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, round } from '../src/format.js';

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KiB / MiB / GiB', () => {
    expect(formatBytes(1024)).toBe('1.00 KiB');
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(1024 ** 2)).toBe('1.00 MiB');
    expect(formatBytes(1.5 * 1024 ** 2)).toBe('1.50 MiB');
    expect(formatBytes(1024 ** 3)).toBe('1.00 GiB');
  });

  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('computes MiB/s and Mbps', () => {
    // 1 MiB in 1 second → 1 MiB/s, 8.388608 Mbps
    const oneMiB = 1024 * 1024;
    const speed = formatSpeed(oneMiB, 1000);
    expect(speed.mibPerSec).toBeCloseTo(1, 5);
    expect(speed.mbps).toBeCloseTo((oneMiB * 8) / 1_000_000, 5);
  });

  it('returns zeros on zero/negative duration', () => {
    expect(formatSpeed(1000, 0)).toEqual({ mibPerSec: 0, mbps: 0 });
    expect(formatSpeed(1000, -100)).toEqual({ mibPerSec: 0, mbps: 0 });
  });

  it('handles zero bytes', () => {
    const speed = formatSpeed(0, 1000);
    expect(speed.mibPerSec).toBe(0);
    expect(speed.mbps).toBe(0);
  });
});

describe('round', () => {
  it('rounds to given digits', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
    expect(round(10, 0)).toBe(10);
  });

  it('handles non-finite', () => {
    expect(round(Number.NaN)).toBe(0);
    expect(round(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
