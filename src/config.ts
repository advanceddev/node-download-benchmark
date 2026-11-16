import type { Defaults } from './types.js';

// default cfg
export const DEFAULTS: Readonly<Defaults> = Object.freeze({
  requests: 10,
  timeoutMs: 30_000,
  connectTimeoutMs: 10_000,
  retries: 2,
  minBackoffMs: 200,
  maxBackoffMs: 5_000,
  maxRedirects: 5,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  maxBodyBytes: 512 * 1024 * 1024, // 512 MiB
});

/**
 * Private / reserved CIDR ranges blocked for SSRF protection.
 * Fail-closed: any match rejects the target.
 */
export const BLOCKED_CIDRS: readonly string[] = Object.freeze([
  // IPv4
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  // IPv6
  '::1/128',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
]);
