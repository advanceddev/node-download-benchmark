#!/usr/bin/env node
/**
 * Sequential Download Benchmark (TypeScript)
 *
 * Makes N sequential full-body HTTPS downloads, measures average latency
 * and overall throughput.
 *
 * Usage:
 *   npx tsx src/cli.ts <https-url> [--requests=10] [--timeout-ms=30000] [--retries=2]
 *   npm run build && node dist/cli.js <https-url>
 */

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from './config.js';
import { BenchmarkError, isBenchmarkError } from './errors.js';
import { downloadWithRetry } from './download.js';
import { formatBytes, formatSpeed, round } from './format.js';
import { validateAndResolveUrl } from './url-validation.js';
import type { BenchmarkConfig, DownloadOptions, DownloadResult } from './types.js';
import { logger } from './logger.js';

/**
 * Parse and validate CLI arguments.
 */
export function parseArgs(argv: readonly string[]): BenchmarkConfig {
  let url: string | null = null;
  let requests = DEFAULTS.requests;
  let timeoutMs = DEFAULTS.timeoutMs;
  let retries = DEFAULTS.retries;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;

    if (a.startsWith('--requests=')) {
      const v = Number.parseInt(a.slice('--requests='.length), 10);
      if (!Number.isInteger(v) || v < 1 || v > 1000) {
        throw new BenchmarkError(
          '--requests must be an integer between 1 and 1000',
          'INVALID_ARG',
        );
      }
      requests = v;
    } else if (a.startsWith('--timeout-ms=')) {
      const v = Number.parseInt(a.slice('--timeout-ms='.length), 10);
      if (!Number.isInteger(v) || v < 1000 || v > 600_000) {
        throw new BenchmarkError(
          '--timeout-ms must be an integer between 1000 and 600000',
          'INVALID_ARG',
        );
      }
      timeoutMs = v;
    } else if (a.startsWith('--retries=')) {
      const v = Number.parseInt(a.slice('--retries='.length), 10);
      if (!Number.isInteger(v) || v < 0 || v > 10) {
        throw new BenchmarkError(
          '--retries must be an integer between 0 and 10',
          'INVALID_ARG',
        );
      }
      retries = v;
    } else if (a.startsWith('-')) {
      throw new BenchmarkError(`Unknown option: ${a}`, 'INVALID_ARG');
    } else if (url === null) {
      url = a;
    } else {
      throw new BenchmarkError('Only one URL is allowed', 'INVALID_ARG');
    }
  }

  if (url === null) {
    throw new BenchmarkError(
      'Usage: node dist/cli.js <https-url> [--requests=10] [--timeout-ms=30000] [--retries=2]',
      'MISSING_URL',
    );
  }

  return { url, requests, timeoutMs, retries };
}

/**
 * Core benchmark loop – exported for testing.
 */
export async function runBenchmark(
  config: BenchmarkConfig,
  opts: DownloadOptions,
  validatedUrl: URL,
): Promise<{ results: DownloadResult[]; wallDurationMs: number }> {
  const results: DownloadResult[] = [];
  const wallStart = performance.now();

  for (let i = 0; i < config.requests; i++) {
    try {
      const r = await downloadWithRetry(validatedUrl, opts, fetch, logger);
      results.push(r);

      logger.info(
        {
          index: i + 1,
          status: r.status,
          bytes: r.bytes,
          durationMs: round(r.durationMs, 2),
        },
        'request completed',
      );
    } catch (err) {
      logger.error(
        {
          index: i + 1,
          err:
            err instanceof Error
              ? {
                  message: err.message,
                  name: err.name,
                  code: isBenchmarkError(err) ? err.code : undefined,
                  details: isBenchmarkError(err) ? err.details : undefined,
                }
              : { message: String(err) },
        },
        'request failed permanently',
      );
      process.exitCode = 1;
      break;
    }
  }

  const wallDurationMs = performance.now() - wallStart;
  return { results, wallDurationMs };
}

function printHumanReport(
  url: URL,
  successCount: number,
  requested: number,
  totalBytes: number,
  avgDurationMs: number,
  totalDurationMs: number,
  wallDurationMs: number,
): void {
  const speed = formatSpeed(totalBytes, totalDurationMs);
  const wallSpeed = formatSpeed(totalBytes, wallDurationMs);

  console.log('────────────────────────────────────────────────────────');
  console.log('Download Benchmark Results');
  console.log('────────────────────────────────────────────────────────');
  console.log(`URL:                    ${url.href}`);
  console.log(`Successful requests:    ${successCount} / ${requested}`);
  console.log(`Average request time:   ${avgDurationMs.toFixed(2)} ms`);
  console.log(`Total data transferred: ${formatBytes(totalBytes)} (${totalBytes} bytes)`);
  console.log(`Aggregate duration:     ${(totalDurationMs / 1000).toFixed(3)} s (sum of request times)`);
  console.log(`Wall-clock duration:    ${(wallDurationMs / 1000).toFixed(3)} s`);
  console.log('');
  console.log('Download speed (based on sum of request times):');
  console.log(`  ${speed.mibPerSec.toFixed(3)} MiB/s`);
  console.log(`  ${speed.mbps.toFixed(3)} Mbps`);
  console.log('');
  console.log('Download speed (wall-clock, includes gaps):');
  console.log(`  ${wallSpeed.mibPerSec.toFixed(3)} MiB/s`);
  console.log(`  ${wallSpeed.mbps.toFixed(3)} Mbps`);
  console.log('────────────────────────────────────────────────────────');
}

async function main(): Promise<void> {
  let config: BenchmarkConfig;
  try {
    config = parseArgs(process.argv);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err : { message: String(err) } },
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 2;
    return;
  }

  let url: URL;
  try {
    url = await validateAndResolveUrl(config.url);
  } catch (err) {
    logger.error(
      {
        err:
          err instanceof Error
            ? {
                message: err.message,
                name: err.name,
                code: isBenchmarkError(err) ? err.code : 'UNKNOWN',
                details: isBenchmarkError(err) ? err.details : null,
              }
            : { message: String(err) },
      },
      'URL validation failed',
    );
    process.exitCode = 3;
    return;
  }

  const opts: DownloadOptions = {
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    minBackoffMs: DEFAULTS.minBackoffMs,
    maxBackoffMs: DEFAULTS.maxBackoffMs,
    maxBodyBytes: DEFAULTS.maxBodyBytes,
    maxRedirects: DEFAULTS.maxRedirects,
    userAgent: DEFAULTS.userAgent,
  };

  logger.info(
    {
      url: url.href,
      requests: config.requests,
      timeoutMs: config.timeoutMs,
      retries: config.retries,
    },
    'benchmark started',
  );

  const { results, wallDurationMs } = await runBenchmark(config, opts, url);

  if (results.length === 0) {
    logger.error('no successful requests');
    process.exitCode = 1;
    return;
  }

  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0);
  const avgDurationMs = totalDurationMs / results.length;
  const speed = formatSpeed(totalBytes, totalDurationMs);
  const wallSpeed = formatSpeed(totalBytes, wallDurationMs);

  printHumanReport(
    url,
    results.length,
    config.requests,
    totalBytes,
    avgDurationMs,
    totalDurationMs,
    wallDurationMs,
  );

  logger.info(
    {
      successCount: results.length,
      requested: config.requests,
      totalBytes,
      avgDurationMs: round(avgDurationMs, 2),
      totalDurationMs: round(totalDurationMs, 2),
      wallDurationMs: round(wallDurationMs, 2),
      speedMiBps: round(speed.mibPerSec, 3),
      speedMbps: round(speed.mbps, 3),
      wallSpeedMiBps: round(wallSpeed.mibPerSec, 3),
      wallSpeedMbps: round(wallSpeed.mbps, 3),
    },
    'benchmark finished',
  );
}

/**
 * True only when this file is the process entrypoint (tsx/node src/cli.ts).
 * Never true under Vitest — argv[1] is the test runner, not this module.
 */
function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry == null || entry.length === 0) return false;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = path.resolve(entry);
    return path.resolve(thisFile) === entryFile;
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  main().catch((err: unknown) => {
    logger.fatal(
      {
        err:
          err instanceof Error
            ? { message: err.message, name: err.name, stack: err.stack ?? null }
            : { message: String(err) },
      },
      'unhandled error',
    );
    process.exitCode = 1;
  });
}

export { main };
