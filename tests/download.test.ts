import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  drainBody,
  downloadOnce,
  downloadWithRetry,
  isRetriableError,
} from '../src/download.js';
import { BenchmarkError } from '../src/errors.js';
import type { DownloadOptions } from '../src/types.js';
import { DEFAULTS } from '../src/config.js';

function makeOpts(overrides: Partial<DownloadOptions> = {}): DownloadOptions {
  return {
    timeoutMs: 5_000,
    retries: 2,
    minBackoffMs: 1,
    maxBackoffMs: 5,
    maxBodyBytes: 1024 * 1024,
    maxRedirects: 5,
    userAgent: DEFAULTS.userAgent,
    ...overrides,
  };
}

function uint8Stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i]!);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe('drainBody', () => {
  it('returns 0 for null body', async () => {
    const signal = new AbortController().signal;
    expect(await drainBody(null, 1000, signal)).toBe(0);
  });

  it('sums chunk sizes', async () => {
    const body = uint8Stream([
      new Uint8Array(100),
      new Uint8Array(50),
      new Uint8Array(25),
    ]);
    const signal = new AbortController().signal;
    expect(await drainBody(body, 10_000, signal)).toBe(175);
  });

  it('throws BODY_TOO_LARGE and cancels', async () => {
    const body = uint8Stream([new Uint8Array(100), new Uint8Array(100)]);
    const signal = new AbortController().signal;
    await expect(drainBody(body, 150, signal)).rejects.toMatchObject({
      code: 'BODY_TOO_LARGE',
    });
  });

  it('throws ABORTED when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const body = uint8Stream([new Uint8Array(10)]);
    await expect(drainBody(body, 1000, controller.signal)).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });
});

describe('isRetriableError', () => {
  it('retries timeouts and network codes', () => {
    expect(isRetriableError(new BenchmarkError('t', 'TIMEOUT'))).toBe(true);
    expect(
      isRetriableError(Object.assign(new Error('fail'), { code: 'ECONNRESET' })),
    ).toBe(true);
    expect(
      isRetriableError(Object.assign(new Error('fail'), { code: 'ENOTFOUND' })),
    ).toBe(true);
  });

  it('retries 408 / 429 / 5xx', () => {
    expect(
      isRetriableError(new BenchmarkError('e', 'HTTP_ERROR', { status: 503 })),
    ).toBe(true);
    expect(
      isRetriableError(new BenchmarkError('e', 'HTTP_ERROR', { status: 429 })),
    ).toBe(true);
  });

  it('does not retry 4xx (except 408/429) or validation errors', () => {
    expect(
      isRetriableError(new BenchmarkError('e', 'HTTP_ERROR', { status: 404 })),
    ).toBe(false);
    expect(
      isRetriableError(new BenchmarkError('e', 'HTTP_ERROR', { status: 400 })),
    ).toBe(false);
    expect(isRetriableError(new BenchmarkError('bad', 'INVALID_URL'))).toBe(
      false,
    );
  });

  it('returns false for non-Error', () => {
    expect(isRetriableError('string')).toBe(false);
    expect(isRetriableError(null)).toBe(false);
  });
});

describe('downloadOnce', () => {
  const url = new URL('https://example.com/file.bin');

  it('returns duration, bytes and status on success', async () => {
    const body = uint8Stream([new Uint8Array(42)]);
    const fetchImpl = vi.fn(async () => {
      return new Response(body, { status: 200, statusText: 'OK' });
    });

    const result = await downloadOnce(url, makeOpts(), fetchImpl);
    expect(result.status).toBe(200);
    expect(result.bytes).toBe(42);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws HTTP_ERROR on non-2xx and cancels body', async () => {
    const cancel = vi.fn(async () => undefined);
    const body = {
      cancel,
      getReader: () => {
        throw new Error('should not read');
      },
    } as unknown as ReadableStream<Uint8Array>;

    const fetchImpl = vi.fn(async () => {
      return {
        status: 404,
        statusText: 'Not Found',
        body,
      } as unknown as Response;
    });

    await expect(downloadOnce(url, makeOpts(), fetchImpl)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      details: { status: 404 },
    });
    expect(cancel).toHaveBeenCalled();
  });
});

describe('downloadWithRetry', () => {
  const url = new URL('https://example.com/file.bin');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns on first success', async () => {
    const body = uint8Stream([new Uint8Array(10)]);
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));

    const result = await downloadWithRetry(url, makeOpts({ retries: 2 }), fetchImpl);
    expect(result.bytes).toBe(10);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new BenchmarkError('timeout', 'TIMEOUT');
      }
      return new Response(uint8Stream([new Uint8Array(5)]), { status: 200 });
    });

    const promise = downloadWithRetry(
      url,
      makeOpts({ retries: 3, minBackoffMs: 1, maxBackoffMs: 1 }),
      fetchImpl,
    );

    // Advance timers for the two backoff sleeps
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bytes).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retriable errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new BenchmarkError('bad url', 'INVALID_URL');
    });

    await expect(
      downloadWithRetry(url, makeOpts({ retries: 3 }), fetchImpl),
    ).rejects.toMatchObject({ code: 'INVALID_URL' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws last error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new BenchmarkError('timeout', 'TIMEOUT');
    });

    const promise = downloadWithRetry(
      url,
      makeOpts({ retries: 2, minBackoffMs: 1, maxBackoffMs: 1 }),
      fetchImpl,
    );
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
