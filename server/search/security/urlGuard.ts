import dns from 'node:dns/promises';
import net from 'node:net';

export interface UrlValidationResult {
  readonly safe: boolean;
  readonly reason?: string;
  readonly normalizedUrl?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const ipv4ToInt = (ip: string): number => {
  const parts = ip.split('.').map((octet) => Number(octet));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return -1;
  }
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
};

const isPrivateIpv4 = (ip: string): boolean => {
  const num = ipv4ToInt(ip);
  if (num < 0) return true;

  const first = (num >>> 24) & 0xff;
  const second = (num >>> 16) & 0xff;

  if (first === 0) return true; // 0.0.0.0/8
  if (first === 10) return true; // 10.0.0.0/8
  if (first === 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 CGNAT
  if (first === 127) return true; // 127.0.0.0/8 loopback
  if (first === 169 && second === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (first === 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
  if (first === 192 && second === 168) return true; // 192.168.0.0/16
  if (first === 192 && second === 0 && ((num >>> 8) & 0xff) === 0) return true; // 192.0.0.0/24
  if (first === 198 && (second === 18 || second === 19)) return true; // 198.18.0.0/15 benchmarking
  if (first >= 224) return true; // multicast & reserved

  return false;
};

const isPrivateIpv6 = (ip: string): boolean => {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local ULA
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) {
      return isPrivateIpv4(mapped);
    }
  }
  return false;
};

export const isPrivateOrReservedIp = (ip: string): boolean => {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true;
};

export const validateHttpUrl = (rawUrl: string): UrlValidationResult => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { safe: false, reason: 'Empty URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, reason: 'Malformed URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'Credentials in URL are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Blocked internal hostname: ${hostname}` };
  }

  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    !hostname.includes('.')
  ) {
    return { safe: false, reason: `Non-public hostname blocked: ${hostname}` };
  }

  if (net.isIP(hostname) !== 0 && isPrivateOrReservedIp(hostname)) {
    return { safe: false, reason: `Private or reserved IP blocked: ${hostname}` };
  }

  return { safe: true, normalizedUrl: parsed.toString() };
};

export const assertSafePublicUrl = async (rawUrl: string): Promise<UrlValidationResult> => {
  const syntaxCheck = validateHttpUrl(rawUrl);
  if (!syntaxCheck.safe || !syntaxCheck.normalizedUrl) {
    return syntaxCheck;
  }

  const parsed = new URL(syntaxCheck.normalizedUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(hostname) !== 0) {
    return syntaxCheck;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: `DNS resolved zero addresses for ${hostname}` };
    }
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          safe: false,
          reason: `DNS resolved ${hostname} to private/reserved IP ${record.address}`,
        };
      }
    }
    return syntaxCheck;
  } catch {
    return { safe: false, reason: `DNS lookup failed for ${hostname}` };
  }
};
