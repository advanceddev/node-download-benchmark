import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';
import { BenchmarkError } from '../src/errors.js';
import { DEFAULTS } from '../src/config.js';

function argv(...args: string[]): string[] {
  return ['node', 'cli.js', ...args];
}

describe('parseArgs', () => {
  it('parses URL with defaults', () => {
    const cfg = parseArgs(argv('https://example.com/img.jpg'));
    expect(cfg.url).toBe('https://example.com/img.jpg');
    expect(cfg.requests).toBe(DEFAULTS.requests);
    expect(cfg.timeoutMs).toBe(DEFAULTS.timeoutMs);
    expect(cfg.retries).toBe(DEFAULTS.retries);
  });

  it('parses all flags', () => {
    const cfg = parseArgs(
      argv(
        'https://cdn.example.com/a.bin',
        '--requests=20',
        '--timeout-ms=60000',
        '--retries=3',
      ),
    );
    expect(cfg.requests).toBe(20);
    expect(cfg.timeoutMs).toBe(60000);
    expect(cfg.retries).toBe(3);
  });

  it('throws on missing URL', () => {
    expect(() => parseArgs(argv())).toThrow(BenchmarkError);
    try {
      parseArgs(argv());
    } catch (e) {
      expect((e as BenchmarkError).code).toBe('MISSING_URL');
    }
  });

  it('throws on unknown option', () => {
    expect(() => parseArgs(argv('https://x.com', '--foo=1'))).toThrow(
      /Unknown option/,
    );
  });

  it('throws on second positional argument', () => {
    expect(() =>
      parseArgs(argv('https://a.com', 'https://b.com')),
    ).toThrow(/Only one URL/);
  });

  it('rejects out-of-range requests', () => {
    expect(() => parseArgs(argv('https://x.com', '--requests=0'))).toThrow(
      BenchmarkError,
    );
    expect(() => parseArgs(argv('https://x.com', '--requests=1001'))).toThrow(
      BenchmarkError,
    );
  });

  it('rejects out-of-range timeout', () => {
    expect(() => parseArgs(argv('https://x.com', '--timeout-ms=500'))).toThrow(
      BenchmarkError,
    );
  });

  it('rejects out-of-range retries', () => {
    expect(() => parseArgs(argv('https://x.com', '--retries=-1'))).toThrow(
      BenchmarkError,
    );
    expect(() => parseArgs(argv('https://x.com', '--retries=11'))).toThrow(
      BenchmarkError,
    );
  });
});
