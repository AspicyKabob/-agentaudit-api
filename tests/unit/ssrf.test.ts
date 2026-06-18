import { isUnsafeIp, validateWebhookUrl } from '../../src/utils/ssrf';

describe('isUnsafeIp', () => {
  it('flags loopback, private, link-local, CGNAT, and reserved IPv4', () => {
    const unsafe = [
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '198.18.0.1',
      '224.0.0.1', // multicast
      '255.255.255.255',
    ];
    for (const ip of unsafe) {
      expect(isUnsafeIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    expect(isUnsafeIp('8.8.8.8')).toBe(false);
    expect(isUnsafeIp('1.1.1.1')).toBe(false);
    expect(isUnsafeIp('93.184.216.34')).toBe(false);
    expect(isUnsafeIp('172.32.0.1')).toBe(false); // just outside 172.16/12
  });

  it('flags loopback, link-local, unique-local, and mapped IPv6', () => {
    expect(isUnsafeIp('::1')).toBe(true);
    expect(isUnsafeIp('::')).toBe(true);
    expect(isUnsafeIp('fe80::1')).toBe(true);
    expect(isUnsafeIp('fc00::1')).toBe(true);
    expect(isUnsafeIp('fd00:ec2::254')).toBe(true);
    expect(isUnsafeIp('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
  });

  it('allows public IPv6', () => {
    expect(isUnsafeIp('2606:4700:4700::1111')).toBe(false);
  });

  it('treats invalid input as unsafe', () => {
    expect(isUnsafeIp('not-an-ip')).toBe(true);
  });
});

describe('validateWebhookUrl', () => {
  it('accepts a public https URL', () => {
    expect(validateWebhookUrl('https://hooks.example.com/path').ok).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(validateWebhookUrl('http://hooks.example.com').ok).toBe(false);
    expect(validateWebhookUrl('ftp://hooks.example.com').ok).toBe(false);
  });

  it('rejects localhost and internal-looking hostnames', () => {
    expect(validateWebhookUrl('https://localhost/hook').ok).toBe(false);
    expect(validateWebhookUrl('https://api.localhost/hook').ok).toBe(false);
    expect(validateWebhookUrl('https://service.internal/hook').ok).toBe(false);
    expect(validateWebhookUrl('https://printer.local/hook').ok).toBe(false);
  });

  it('rejects literal private / metadata / loopback IPs', () => {
    expect(validateWebhookUrl('https://127.0.0.1/hook').ok).toBe(false);
    expect(validateWebhookUrl('https://10.0.0.5/hook').ok).toBe(false);
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(validateWebhookUrl('https://[::1]/hook').ok).toBe(false);
  });

  it('rejects embedded credentials and malformed URLs', () => {
    expect(validateWebhookUrl('https://user:pass@evil.example.com/hook').ok).toBe(false);
    expect(validateWebhookUrl('not a url').ok).toBe(false);
  });
});
