import { describe, it, expect } from 'vitest';
import { ipv4ToInt, ipv6ToBytes, ipInCidr, isBlockedIp } from '../src/ip.js';

describe('ipv4ToInt', () => {
  it('converts common addresses', () => {
    expect(ipv4ToInt('0.0.0.0')).toBe(0);
    expect(ipv4ToInt('127.0.0.1')).toBe(0x7f000001);
    expect(ipv4ToInt('192.168.1.1')).toBe(0xc0a80101);
    expect(ipv4ToInt('255.255.255.255')).toBe(0xffffffff);
  });

  it('throws on invalid input', () => {
    expect(() => ipv4ToInt('1.2.3')).toThrow();
    expect(() => ipv4ToInt('1.2.3.256')).toThrow();
    expect(() => ipv4ToInt('abc')).toThrow();
  });
});

describe('ipv6ToBytes', () => {
  it('parses loopback', () => {
    const bytes = ipv6ToBytes('::1');
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(16);
    expect(bytes![15]).toBe(1);
    expect(bytes!.slice(0, 15).every((b) => b === 0)).toBe(true);
  });

  it('parses full address', () => {
    const bytes = ipv6ToBytes('2001:db8::1');
    expect(bytes).not.toBeNull();
    expect(bytes![0]).toBe(0x20);
    expect(bytes![1]).toBe(0x01);
    expect(bytes![2]).toBe(0x0d);
    expect(bytes![3]).toBe(0xb8);
  });

  it('returns null on garbage', () => {
    expect(ipv6ToBytes('not-an-ip')).toBeNull();
    expect(ipv6ToBytes('gggg::1')).toBeNull();
  });
});

describe('ipInCidr', () => {
  it('matches IPv4 private ranges', () => {
    expect(ipInCidr('10.0.0.1', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false);

    expect(ipInCidr('192.168.0.1', '192.168.0.0/16')).toBe(true);
    expect(ipInCidr('192.169.0.1', '192.168.0.0/16')).toBe(false);

    expect(ipInCidr('172.16.0.1', '172.16.0.0/12')).toBe(true);
    expect(ipInCidr('172.31.255.255', '172.16.0.0/12')).toBe(true);
    expect(ipInCidr('172.32.0.1', '172.16.0.0/12')).toBe(false);
  });

  it('matches exact /32', () => {
    expect(ipInCidr('8.8.8.8', '8.8.8.8/32')).toBe(true);
    expect(ipInCidr('8.8.8.9', '8.8.8.8/32')).toBe(false);
  });

  it('matches IPv6 loopback', () => {
    expect(ipInCidr('::1', '::1/128')).toBe(true);
    expect(ipInCidr('::2', '::1/128')).toBe(false);
  });

  it('returns false for malformed cidr or ip', () => {
    expect(ipInCidr('not-ip', '10.0.0.0/8')).toBe(false);
    expect(ipInCidr('10.0.0.1', 'bad')).toBe(false);
  });
});

describe('isBlockedIp', () => {
  it('blocks private and reserved IPv4', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.1.2.3')).toBe(true);
    expect(isBlockedIp('192.168.100.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
  });

  it('allows public IPv4', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false); // example.com
  });

  it('blocks IPv6 loopback and ULA', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
  });

  it('fails closed on non-IP', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});
