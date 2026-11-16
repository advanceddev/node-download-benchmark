import type { SpeedMetrics } from './types.js';

/**
 * Human-readable byte size using binary units (KiB / MiB / GiB).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

/**
 * Compute throughput from transferred bytes and duration.
 * - mibPerSec: binary mebibytes per second
 * - mbps: decimal megabits per second
 */
export function formatSpeed(bytes: number, durationMs: number): SpeedMetrics {
  if (!Number.isFinite(bytes) || !Number.isFinite(durationMs) || durationMs <= 0 || bytes < 0) {
    return { mibPerSec: 0, mbps: 0 };
  }
  const seconds = durationMs / 1000;
  const mibPerSec = bytes / (1024 ** 2) / seconds;
  const mbps = (bytes * 8) / 1_000_000 / seconds;
  return { mibPerSec, mbps };
}

/**
 * Round a number to a fixed number of decimal places (for stable JSON output).
 */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
