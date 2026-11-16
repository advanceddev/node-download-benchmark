import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { BenchmarkError } from './errors.js';
import { isBlockedIp } from './ip.js';
import type { DnsRecord } from './types.js';

const CONTROL_OR_WHITESPACE = /[\x00-\x1f\x7f]|\s/;

/**
 * Validate raw user input and resolve DNS.
 * Only https: is permitted. Private / reserved destinations are rejected.
 *
 * @param raw - User-supplied URL string
 * @param dnsLookup - Injectable DNS function (for tests)
 * @returns Normalized WHATWG URL whose host resolves only to public IPs
 */

/**
 * Extract a literal IP from a URL hostname, if any.
 * Handles bracketed IPv6 ("[::1]"), zone ids ("fe80::1%lo0"), and plain forms.
 */
function literalIpFromHostname(hostname: string): string | null {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.slice(1, -1);
  }
  const zone = h.indexOf('%');
  if (zone !== -1) {
    h = h.slice(0, zone);
  }
  return isIP(h) !== 0 ? h : null;
}

export async function validateAndResolveUrl(
  raw: string,
  dnsLookup: typeof lookup = lookup,
): Promise<URL> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    throw new BenchmarkError(
      'URL must be a non-empty string ≤ 2048 chars',
      'INVALID_URL',
    );
  }

  if (CONTROL_OR_WHITESPACE.test(raw)) {
    throw new BenchmarkError('URL contains illegal characters', 'INVALID_URL');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BenchmarkError('Malformed URL', 'INVALID_URL');
  }

  if (url.protocol !== 'https:') {
    throw new BenchmarkError(
      `Only https: protocol is allowed (got ${url.protocol})`,
      'PROTOCOL_FORBIDDEN',
    );
  }

  if (url.username || url.password) {
    throw new BenchmarkError(
      'URLs with embedded credentials are forbidden',
      'CREDENTIALS_FORBIDDEN',
    );
  }

  if (!url.hostname || url.hostname.length === 0) {
    throw new BenchmarkError('URL must contain a hostname', 'INVALID_URL');
  }

  const hostLower = url.hostname.toLowerCase();
  if (
    hostLower === 'localhost' ||
    hostLower.endsWith('.localhost') ||
    hostLower.endsWith('.local') ||
    hostLower.endsWith('.internal') ||
    hostLower === 'metadata.google.internal'
  ) {
    throw new BenchmarkError(
      'Hostname is not allowed (local/internal)',
      'HOST_FORBIDDEN',
    );
  }

  // Explicit loopback host forms (covers parsers that don't classify as isIP)
  const loopbackHosts = new Set([
    '::1',
    '[::1]',
    '0:0:0:0:0:0:0:1',
    '127.0.0.1',
    '0.0.0.0',
  ]);
  if (loopbackHosts.has(hostLower)) {
    throw new BenchmarkError(
      `IP address is blocked: ${hostLower}`,
      'IP_BLOCKED',
    );
  }

  // Literal IP – never send to DNS (avoids DNS_FAILED on loopback literals).
  const ipHost = literalIpFromHostname(url.hostname);
  if (ipHost !== null) {
    if (isBlockedIp(ipHost)) {
      throw new BenchmarkError(
        `IP address is blocked: ${ipHost}`,
        'IP_BLOCKED',
      );
    }
    return url;
  }

  let records: DnsRecord[];
  try {
    const result = await dnsLookup(url.hostname, { all: true, verbatim: true });
    records = result as DnsRecord[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BenchmarkError(
      `DNS resolution failed for ${url.hostname}: ${message}`,
      'DNS_FAILED',
      { cause: message },
    );
  }

  if (!records || records.length === 0) {
    throw new BenchmarkError(
      `No DNS records for ${url.hostname}`,
      'DNS_EMPTY',
    );
  }

  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw new BenchmarkError(
        `Hostname resolves to blocked IP ${rec.address}`,
        'IP_BLOCKED',
        { hostname: url.hostname, address: rec.address },
      );
    }
  }

  return url;
}
