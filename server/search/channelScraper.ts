import * as cheerio from 'cheerio';
import {
  extractAtsFormLinksFromHtml,
  extractEmailsFromHtml,
} from './extractors/htmlExtractor.ts';
import { extractJobPostingsFromJsonLd } from './extractors/jsonLdExtractor.ts';
import { checkRobotsAllowance } from './security/robotsGuard.ts';
import { assertSafePublicUrl } from './security/urlGuard.ts';
import { fetchWithRetry } from './utils/httpClient.ts';

export interface ScrapedChannelResult {
  readonly type: 'email' | 'form' | 'portal';
  readonly target: string;
  readonly label: string;
  readonly contactName?: string;
  readonly verified: boolean;
  readonly sourceUrl?: string;
}

export const discoverChannelsFromUrl = async (input: {
  readonly organization: string;
  readonly title: string;
  readonly sourceUrl?: string;
  readonly applicationUrl?: string;
}): Promise<readonly ScrapedChannelResult[]> => {
  const discovered: ScrapedChannelResult[] = [];
  const seenTargets = new Set<string>();

  const pushUnique = (channel: ScrapedChannelResult) => {
    const key = channel.target.toLowerCase();
    if (!seenTargets.has(key)) {
      seenTargets.add(key);
      discovered.push(channel);
    }
  };

  const urlsToScan = [input.applicationUrl, input.sourceUrl]
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

  for (const targetUrl of urlsToScan) {
    const safeCheck = await assertSafePublicUrl(targetUrl);
    if (!safeCheck.safe || !safeCheck.normalizedUrl) continue;

    // Recognize official ATS endpoints immediately
    const lowerUrl = safeCheck.normalizedUrl.toLowerCase();
    if (
      lowerUrl.includes('greenhouse.io') ||
      lowerUrl.includes('lever.co') ||
      lowerUrl.includes('ashbyhq.com')
    ) {
      pushUnique({
        type: 'form',
        target: safeCheck.normalizedUrl,
        label: lowerUrl.includes('greenhouse')
          ? 'Greenhouse Application Form'
          : lowerUrl.includes('lever')
            ? 'Lever Application Form'
            : 'Ashby Application Form',
        verified: true,
        sourceUrl: safeCheck.normalizedUrl,
      });
    }

    const robots = await checkRobotsAllowance(safeCheck.normalizedUrl);
    if (!robots.allowed) continue;

    try {
      const res = await fetchWithRetry(safeCheck.normalizedUrl, {
        timeoutMs: 6500,
        retries: 0,
      });
      if (!res.ok) continue;

      const jsonLdOffers = extractJobPostingsFromJsonLd(
        res.bodyText,
        res.url,
        input.organization
      );
      for (const offer of jsonLdOffers) {
        if (offer.applicationEmail) {
          pushUnique({
            type: 'email',
            target: offer.applicationEmail,
            label: `${input.organization} Recruiting Inbox`,
            verified: true,
            sourceUrl: res.url,
          });
        }
        if (offer.applicationUrl) {
          pushUnique({
            type: 'form',
            target: offer.applicationUrl,
            label: 'Official Application Form',
            verified: true,
            sourceUrl: res.url,
          });
        }
      }

      const $ = cheerio.load(res.bodyText);
      for (const email of extractEmailsFromHtml($).slice(0, 3)) {
        pushUnique({
          type: 'email',
          target: email,
          label: `${input.organization} Direct Email`,
          verified: true,
          sourceUrl: res.url,
        });
      }
      for (const atsUrl of extractAtsFormLinksFromHtml($, res.url).slice(0, 3)) {
        pushUnique({
          type: 'form',
          target: atsUrl,
          label: 'Detected ATS Application Form',
          verified: true,
          sourceUrl: res.url,
        });
      }
    } catch {
      // Non-blocking per-URL channel scan
    }
  }

  return discovered;
};
