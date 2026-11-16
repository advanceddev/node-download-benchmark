import { isIP } from 'node:net';
import { BLOCKED_CIDRS } from './config.js';

/**
 * Convert dotted IPv4 string to unsigned 32-bit integer.
 */
export function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (
    (((parts[0]! << 24) >>> 0) |
      ((parts[1]! << 16) >>> 0) |
      ((parts[2]! << 8) >>> 0) |
      (parts[3]! >>> 0)) >>>
    0
  );
}

/**
 * Expand IPv6 string to 16 raw bytes. Returns null on parse failure.
 */
export function ipv6ToBytes(ip: string): Uint8Array | null {
  try {
    const normalized = ip.toLowerCase();
    let parts = normalized.split(':');

    const emptyIdx = parts.indexOf('');
    if (emptyIdx !== -1) {
      const left = parts.slice(0, emptyIdx).filter(Boolean);
      const right = parts.slice(emptyIdx + 1).filter(Boolean);
      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
    }

    if (parts.length !== 8) return null;

    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      const n = Number.parseInt(parts[i]!, 16);
      if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
      bytes[i * 2] = (n >> 8) & 0xff;
      bytes[i * 2 + 1] = n & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Check whether `ip` falls inside the given CIDR (IPv4 or IPv6).
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash === -1) return false;

  const range = cidr.slice(0, slash);
  const bits = Number.parseInt(cidr.slice(slash + 1), 10);
  if (!Number.isInteger(bits) || bits < 0) return false;

  const family = isIP(ip);
  if (!family) return false;

  if (family === 4) {
    if (isIP(range) !== 4 || bits > 32) return false;
    const ipNum = ipv4ToInt(ip);
    const rangeNum = ipv4ToInt(range);
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  }

  if (family === 6) {
    if (isIP(range) !== 6 || bits > 128) return false;
    const ipBytes = ipv6ToBytes(ip);
    const rangeBytes = ipv6ToBytes(range);
    if (!ipBytes || !rangeBytes) return false;

    const fullBytes = Math.floor(bits / 8);
    const remBits = bits % 8;

    for (let i = 0; i < fullBytes; i++) {
      if (ipBytes[i] !== rangeBytes[i]) return false;
    }
    if (remBits > 0) {
      const mask = (0xff << (8 - remBits)) & 0xff;
      if ((ipBytes[fullBytes]! & mask) !== (rangeBytes[fullBytes]! & mask)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Returns true if the IP must be blocked (private, reserved, metadata, etc.).
 * Fail-closed: non-IP strings are treated as blocked.
 */
export function isBlockedIp(ip: string): boolean {
  if (!isIP(ip)) return true;

  for (const cidr of BLOCKED_CIDRS) {
    if (ipInCidr(ip, cidr)) return true;
  }

  if (ip === '169.254.169.254' || ip === 'fd00:ec2::254') return true;

  return false;
}
