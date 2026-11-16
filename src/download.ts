import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { BenchmarkError } from './errors.js';
import { backoffMs } from './backoff.js';
import type { DownloadOptions, DownloadResult } from './types.js';
import type { Logger } from './logger.js';


/**
 * Node's fetch throws TypeError("fetch failed") and hides the real reason in `.cause`.
 * Re-throw a BenchmarkError with the underlying code/message for logs and retries.
 */
export function unwrapFetchError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new BenchmarkError(String(err), 'UNKNOWN');
  }

  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code =
      'code' in cause && cause.code != null ? String(cause.code) : undefined;
    const message = cause.message || err.message;
    return new BenchmarkError(
      message,
      code && /TIMEOUT|ABORT/i.test(code) ? 'TIMEOUT' : 'UNKNOWN',
      {
        causeCode: code ?? null,
        causeName: cause.name,
        outer: err.message,
      },
    );
  }

  if (err.name === 'AbortError' || err.message.includes('aborted')) {
    return new BenchmarkError(err.message || 'aborted', 'TIMEOUT');
  }

  return err;
}

/**
 * Drain a ReadableStream completely while counting bytes.
 * Never materialises the whole body in memory.
 */
export async function drainBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<number> {
  if (!body) return 0;

  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      if (signal.aborted) {
        throw new BenchmarkError('Request aborted while reading body', 'ABORTED');
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel('body too large').catch(() => undefined);
          throw new BenchmarkError(
            `Response body exceeds hard limit of ${maxBytes} bytes`,
            'BODY_TOO_LARGE',
            { bytes: total },
          );
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  return total;
}

/**
 * Single timed full-body download.
 */
export async function downloadOnce(
  url: URL,
  opts: DownloadOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
  const { timeoutMs, maxBodyBytes, userAgent } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new BenchmarkError('Overall request timeout', 'TIMEOUT'));
  }, timeoutMs);

  const clear = (): void => {
    clearTimeout(timer);
  };

  try {
    const start = performance.now();

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
        },
      });
    } catch (err) {
      throw unwrapFetchError(err);
    }

    if (response.status < 200 || response.status >= 300) {
      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }
      throw new BenchmarkError(
        `HTTP ${response.status} ${response.statusText || ''}`.trim(),
        'HTTP_ERROR',
        { status: response.status },
      );
    }

    const bytes = await drainBody(response.body, maxBodyBytes, controller.signal);
    const durationMs = performance.now() - start;

    return {
      durationMs,
      bytes,
      status: response.status,
    };
  } finally {
    clear();
  }
}

/**
 * Decide whether an error is worth retrying.
 */
export function isRetriableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  let code = '';
  if (err instanceof BenchmarkError) {
    const causeCode = err.details['causeCode'];
    code = typeof causeCode === 'string' && causeCode.length > 0 ? causeCode : err.code;
  } else if ('code' in err && err.code != null) {
    code = String(err.code);
  }

  const name = err.name;
  const message = err.message.toLowerCase();

  const isTimeout =
    code === 'TIMEOUT' ||
    name === 'TimeoutError' ||
    message.includes('timeout') ||
    message.includes('aborted');

  const isNetwork =
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    message.includes('fetch failed') ||
    message.includes('network');

  const status =
    err instanceof BenchmarkError ? err.details['status'] : undefined;
  const isRetriableHttp =
    code === 'HTTP_ERROR' &&
    typeof status === 'number' &&
    (status === 408 || status === 429 || status >= 500);

  return isTimeout || isNetwork || isRetriableHttp;
}

/**
 * Download with bounded retries and full-jitter exponential backoff.
 */
export async function downloadWithRetry(
  url: URL,
  opts: DownloadOptions,
  fetchImpl: typeof fetch = fetch,
  log: Logger | null = null,
): Promise<DownloadResult> {
  const { retries, minBackoffMs, maxBackoffMs } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await downloadOnce(url, opts, fetchImpl);
    } catch (err) {
      lastError = err;

      if (!isRetriableError(err) || attempt === retries) {
        throw err;
      }

      const delay = backoffMs(attempt, minBackoffMs, maxBackoffMs);
      log?.warn(
        {
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          delayMs: delay,
          err:
            err instanceof Error
              ? {
                  message: err.message,
                  name: err.name,
                  code: err instanceof BenchmarkError ? err.code : null,
                  details: err instanceof BenchmarkError ? err.details : null,
                }
              : { message: String(err) },
        },
        'retrying after transient error',
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
