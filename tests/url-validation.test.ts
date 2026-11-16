import { describe, it, expect, vi } from 'vitest';
import { validateAndResolveUrl } from '../src/url-validation.js';
import type { DnsRecord } from '../src/types.js';

function mockLookup(records: DnsRecord[]) {
  return vi.fn(async () => records);
}

describe('validateAndResolveUrl', () => {
  it('accepts a public HTTPS URL with public DNS', async () => {
    const lookup = mockLookup([{ address: '93.184.216.34', family: 4 }]);
    const url = await validateAndResolveUrl('https://example.com/path', lookup);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('example.com');
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('rejects empty / too long / control chars', async () => {
    await expect(validateAndResolveUrl('')).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    await expect(validateAndResolveUrl('a'.repeat(3000))).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    await expect(validateAndResolveUrl('https://ex.com/\n')).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
  });

  it('rejects non-https protocols', async () => {
    await expect(validateAndResolveUrl('http://example.com')).rejects.toMatchObject({
      code: 'PROTOCOL_FORBIDDEN',
    });
    await expect(validateAndResolveUrl('ftp://example.com')).rejects.toMatchObject({
      code: 'PROTOCOL_FORBIDDEN',
    });
    await expect(validateAndResolveUrl('file:///etc/passwd')).rejects.toMatchObject({
      code: 'PROTOCOL_FORBIDDEN',
    });
  });

  it('rejects credentials in URL', async () => {
    await expect(
      validateAndResolveUrl('https://user:pass@example.com/'),
    ).rejects.toMatchObject({ code: 'CREDENTIALS_FORBIDDEN' });
  });

  it('rejects localhost and internal hostnames', async () => {
    await expect(validateAndResolveUrl('https://localhost/')).rejects.toMatchObject({
      code: 'HOST_FORBIDDEN',
    });
    await expect(validateAndResolveUrl('https://foo.local/')).rejects.toMatchObject({
      code: 'HOST_FORBIDDEN',
    });
    await expect(validateAndResolveUrl('https://svc.internal/')).rejects.toMatchObject({
      code: 'HOST_FORBIDDEN',
    });
  });

  it('rejects literal private IPs', async () => {
    await expect(validateAndResolveUrl('https://127.0.0.1/')).rejects.toMatchObject({
      code: 'IP_BLOCKED',
    });
    await expect(validateAndResolveUrl('https://10.0.0.5/')).rejects.toMatchObject({
      code: 'IP_BLOCKED',
    });
    await expect(validateAndResolveUrl('https://192.168.1.1/')).rejects.toMatchObject({
      code: 'IP_BLOCKED',
    });
    await expect(validateAndResolveUrl('https://[::1]/')).rejects.toMatchObject({
      code: 'IP_BLOCKED',
    });
  });

  it('allows literal public IP', async () => {
    const url = await validateAndResolveUrl('https://8.8.8.8/');
    expect(url.hostname).toBe('8.8.8.8');
  });

  it('rejects hostname that resolves to private IP', async () => {
    const lookup = mockLookup([{ address: '10.0.0.1', family: 4 }]);
    await expect(
      validateAndResolveUrl('https://internal.example.com', lookup),
    ).rejects.toMatchObject({ code: 'IP_BLOCKED' });
  });

  it('rejects when any of multiple records is private', async () => {
    const lookup = mockLookup([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(
      validateAndResolveUrl('https://mixed.example.com', lookup),
    ).rejects.toMatchObject({ code: 'IP_BLOCKED' });
  });

  it('rejects DNS failure', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(
      validateAndResolveUrl('https://does-not-exist.invalid', lookup),
    ).rejects.toMatchObject({ code: 'DNS_FAILED' });
  });

  it('rejects empty DNS result', async () => {
    const lookup = mockLookup([]);
    await expect(
      validateAndResolveUrl('https://empty.example.com', lookup),
    ).rejects.toMatchObject({ code: 'DNS_EMPTY' });
  });

  it('rejects malformed URL', async () => {
    await expect(validateAndResolveUrl('not a url at all')).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
  });
});
