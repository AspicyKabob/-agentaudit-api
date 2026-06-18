import dns from 'dns';
import net from 'net';
import https from 'https';

export interface WebhookUrlValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Returns true if an IP literal points at infrastructure that a customer
 * webhook must never be able to reach (loopback, private ranges, link-local,
 * cloud metadata, multicast/reserved, etc.). Covers both IPv4 and IPv6,
 * including IPv4-mapped IPv6 addresses.
 */
export function isUnsafeIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true; // not a valid IP — treat as unsafe

  if (family === 4) return isUnsafeIpv4(ip);
  return isUnsafeIpv6(ip);
}

function isUnsafeIpv4(ip: string): boolean {
  const octets = ip.split('.').map((o) => parseInt(o, 10));
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    return true;
  }
  const [a, b] = octets;

  if (a === 0) return true; // 0.0.0.0/8 "this" network / unspecified
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 0 && octets[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255

  return false;
}

function isUnsafeIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // drop zone id

  // IPv4-mapped / IPv4-compatible — validate the embedded IPv4.
  const mapped = addr.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isUnsafeIpv4(mapped[1]);

  // NAT64 well-known prefix 64:ff9b::/96 carrying an embedded IPv4.
  const nat64 = addr.match(/^64:ff9b::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (nat64) return isUnsafeIpv4(nat64[1]);

  if (addr === '::' || addr === '::1') return true; // unspecified / loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (addr.startsWith('fec') || addr.startsWith('fed') || addr.startsWith('fee') || addr.startsWith('fef')) {
    return true; // fec0::/10 deprecated site-local
  }
  // fc00::/7 unique local (covers fd00:ec2::254 AWS IMDS IPv6).
  const first = parseInt(addr.split(':')[0] || '0', 16);
  if (!Number.isNaN(first) && (first & 0xfe00) === 0xfc00) return true;
  if (addr.startsWith('ff')) return true; // ff00::/8 multicast

  return false;
}

/**
 * Synchronous, format-level validation for a customer-supplied webhook URL.
 * Enforces https, rejects embedded credentials, and rejects literal IPs or
 * hostnames that obviously point at internal infrastructure. DNS-based checks
 * happen at delivery time (see {@link safePostJson}).
 */
export function validateWebhookUrl(raw: string): WebhookUrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Webhook URL is not a valid URL' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Webhook URL must use https' };
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'Webhook URL must not contain credentials' };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) {
    return { ok: false, reason: 'Webhook URL must have a host' };
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { ok: false, reason: 'Webhook URL must not target a local host' };
  }

  if (net.isIP(hostname) !== 0 && isUnsafeIp(hostname)) {
    return { ok: false, reason: 'Webhook URL must not target a private or reserved IP' };
  }

  return { ok: true };
}

/**
 * DNS lookup wrapper that resolves a hostname, rejects the request if ANY
 * resolved address is unsafe, and pins the connection to a validated address.
 * Pinning the socket to the exact IP we vetted defeats DNS-rebinding (TOCTOU).
 */
function safeLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions | number,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (!addresses.length) {
      callback(new Error(`Webhook host did not resolve: ${hostname}`), '', 0);
      return;
    }
    for (const addr of addresses) {
      if (isUnsafeIp(addr.address)) {
        callback(new Error(`Blocked SSRF webhook target: ${addr.address}`), '', 0);
        return;
      }
    }
    const wantsAll = typeof options === 'object' && options.all === true;
    if (wantsAll) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
}

export interface SafePostResult {
  statusCode: number;
}

/**
 * POST a JSON payload to a webhook URL with SSRF protections: https-only,
 * format validation, and a connection pinned to a DNS address that has been
 * verified to be public. Rejects on validation failure, network error, or
 * timeout.
 */
export function safePostJson(
  rawUrl: string,
  body: unknown,
  timeoutMs = 5000
): Promise<SafePostResult> {
  return new Promise((resolve, reject) => {
    const validation = validateWebhookUrl(rawUrl);
    if (!validation.ok) {
      reject(new Error(validation.reason ?? 'Invalid webhook URL'));
      return;
    }

    const url = new URL(rawUrl);
    const data = Buffer.from(JSON.stringify(body), 'utf8');

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
        lookup: safeLookup,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume(); // drain so the socket can close
        resolve({ statusCode: res.statusCode ?? 0 });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Webhook request timed out'));
    });
    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}
