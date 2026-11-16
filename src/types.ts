/**
 * Shared domain types for the download benchmark.
 */

/** CLI / runtime configuration after parsing and defaults applied. */
export interface BenchmarkConfig {
  readonly url: string;
  readonly requests: number;
  readonly timeoutMs: number;
  readonly retries: number;
}

/** Defaults used when CLI flags are omitted. */
export interface Defaults {
  readonly requests: number;
  readonly timeoutMs: number;
  readonly connectTimeoutMs: number;
  readonly retries: number;
  readonly minBackoffMs: number;
  readonly maxBackoffMs: number;
  readonly maxRedirects: number;
  readonly userAgent: string;
  readonly maxBodyBytes: number;
}

/** Options passed into a single download attempt / retry loop. */
export interface DownloadOptions {
  readonly timeoutMs: number;
  readonly retries: number;
  readonly minBackoffMs: number;
  readonly maxBackoffMs: number;
  readonly maxBodyBytes: number;
  readonly maxRedirects: number;
  readonly userAgent: string;
}

/** Successful single-request measurement. */
export interface DownloadResult {
  readonly durationMs: number;
  readonly bytes: number;
  readonly status: number;
}

/** Speed numbers derived from bytes + duration. */
export interface SpeedMetrics {
  readonly mibPerSec: number;
  readonly mbps: number;
}

/** Aggregate benchmark report (machine-readable). */
export interface BenchmarkSummary {
  readonly successCount: number;
  readonly requested: number;
  readonly totalBytes: number;
  readonly avgDurationMs: number;
  readonly totalDurationMs: number;
  readonly wallDurationMs: number;
  readonly speedMiBps: number;
  readonly speedMbps: number;
  readonly wallSpeedMiBps: number;
  readonly wallSpeedMbps: number;
}

/** Structured log levels used on stderr. */
export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

/** DNS record shape returned by node:dns/promises lookup({ all: true }). */
export interface DnsRecord {
  readonly address: string;
  readonly family: 4 | 6;
}

/** Error codes produced by this package (stable for monitoring). */
export type BenchmarkErrorCode =
  | 'INVALID_ARG'
  | 'MISSING_URL'
  | 'INVALID_URL'
  | 'PROTOCOL_FORBIDDEN'
  | 'CREDENTIALS_FORBIDDEN'
  | 'HOST_FORBIDDEN'
  | 'IP_BLOCKED'
  | 'DNS_FAILED'
  | 'DNS_EMPTY'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'BODY_TOO_LARGE'
  | 'HTTP_ERROR'
  | 'UNKNOWN';
