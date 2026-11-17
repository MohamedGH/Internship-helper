import { createTtlCache } from '../utils/cache.ts';
import { validateHttpUrl } from './urlGuard.ts';

interface RobotsRuleSet {
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
  readonly crawlDelayMs?: number;
}

const robotsCache = createTtlCache<RobotsRuleSet>(30 * 60 * 1000);

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const anchoredEnd = escaped.endsWith('\\$')
    ? `${escaped.slice(0, -2)}$`
    : escaped;
  return new RegExp(`^${anchoredEnd}`);
};

export const parseRobotsTxt = (
  robotsTxt: string,
  userAgent = 'StagePilotBot'
): RobotsRuleSet => {
  const lines = robotsTxt.split(/\r?\n/);
  const sections: Array<{ agents: string[]; allow: string[]; disallow: string[]; crawlDelayMs?: number }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[]; crawlDelayMs?: number } | null = null;

  for (const rawLine of lines) {
    const commentIdx = rawLine.indexOf('#');
    const clean = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim();
    if (!clean) continue;

    const colonIdx = clean.indexOf(':');
    if (colonIdx <= 0) continue;

    const directive = clean.slice(0, colonIdx).trim().toLowerCase();
    const value = clean.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      if (!current || current.allow.length > 0 || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], allow: [], disallow: [] };
        sections.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
      continue;
    }

    if (!current) continue;

    if (directive === 'disallow' && value) {
      current.disallow.push(value);
    } else if (directive === 'allow' && value) {
      current.allow.push(value);
    } else if (directive === 'crawl-delay') {
      const sec = Number.parseFloat(value);
      if (!Number.isNaN(sec) && sec > 0) {
        current.crawlDelayMs = Math.min(sec * 1000, 10_000);
      }
    }
  }

  const uaLower = userAgent.toLowerCase();
  const specific = sections.filter((s) => s.agents.some((a) => uaLower.includes(a) && a !== '*'));
  const wildcard = sections.filter((s) => s.agents.includes('*'));
  const chosen = specific.length > 0 ? specific : wildcard;

  return {
    allow: chosen.flatMap((s) => s.allow),
    disallow: chosen.flatMap((s) => s.disallow),
    crawlDelayMs: chosen.find((s) => s.crawlDelayMs)?.crawlDelayMs,
  };
};

export const isPathAllowedByRules = (pathAndQuery: string, rules: RobotsRuleSet): boolean => {
  let longestAllow = -1;
  for (const pattern of rules.allow) {
    if (globToRegExp(pattern).test(pathAndQuery)) {
      longestAllow = Math.max(longestAllow, pattern.length);
    }
  }

  let longestDisallow = -1;
  for (const pattern of rules.disallow) {
    if (pattern === '/') {
      longestDisallow = Math.max(longestDisallow, 1);
    } else if (globToRegExp(pattern).test(pathAndQuery)) {
      longestDisallow = Math.max(longestDisallow, pattern.length);
    }
  }

  if (longestDisallow === -1) return true;
  return longestAllow >= longestDisallow;
};

export const checkRobotsAllowance = async (
  targetUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<{ readonly allowed: boolean; readonly crawlDelayMs?: number; readonly reason?: string }> => {
  const urlCheck = validateHttpUrl(targetUrl);
  if (!urlCheck.safe || !urlCheck.normalizedUrl) {
    return { allowed: false, reason: urlCheck.reason };
  }

  const parsed = new URL(urlCheck.normalizedUrl);
  const origin = parsed.origin;
  const cached = robotsCache.get(origin);
  if (cached) {
    const allowed = isPathAllowedByRules(`${parsed.pathname}${parsed.search}`, cached);
    return {
      allowed,
      crawlDelayMs: cached.crawlDelayMs,
      reason: allowed ? undefined : 'Disallowed by robots.txt',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetchFn(`${origin}/robots.txt`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'StagePilotBot/1.0 (+https://stagepilot.local/bot-info)',
      },
    });
    clearTimeout(timeoutId);

    const rules: RobotsRuleSet =
      res.ok ? parseRobotsTxt(await res.text()) : { allow: [], disallow: [] };
    robotsCache.set(origin, rules);

    const allowed = isPathAllowedByRules(`${parsed.pathname}${parsed.search}`, rules);
    return {
      allowed,
      crawlDelayMs: rules.crawlDelayMs,
      reason: allowed ? undefined : 'Disallowed by robots.txt',
    };
  } catch {
    const fallback: RobotsRuleSet = { allow: [], disallow: [] };
    robotsCache.set(origin, fallback, 5 * 60 * 1000);
    return { allowed: true };
  }
};
