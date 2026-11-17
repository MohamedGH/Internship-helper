import { validateHttpUrl } from '../security/urlGuard.ts';
import { RawScrapedOffer, VerificationStatus } from '../types.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const GENERIC_CAREER_PATHS = new Set([
  '',
  '/',
  '/careers',
  '/careers/',
  '/career',
  '/career/',
  '/jobs',
  '/jobs/',
  '/recrutement',
  '/recrutement/',
  '/nous-rejoindre',
  '/nous-rejoindre/',
  '/join-us',
  '/join-us/',
]);

export const isValidEmailSyntax = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return EMAIL_REGEX.test(email.trim());
};

export const isSpecificOfferUrl = (rawUrl: string): boolean => {
  const check = validateHttpUrl(rawUrl);
  if (!check.safe || !check.normalizedUrl) return false;

  const parsed = new URL(check.normalizedUrl);
  const pathLower = parsed.pathname.toLowerCase();

  if (GENERIC_CAREER_PATHS.has(pathLower) && !parsed.search) {
    return false;
  }

  const segments = pathLower.split('/').filter(Boolean);
  if (segments.length === 1 && GENERIC_CAREER_PATHS.has(`/${segments[0]}`) && !parsed.search) {
    return false;
  }

  return segments.length >= 2 || parsed.search.length > 1;
};

export interface OfferVerificationResult {
  readonly valid: boolean;
  readonly status: VerificationStatus;
  readonly verificationLevel:
    | 'verified'
    | 'collected'
    | 'discovered'
    | 'externally_unverified'
    | 'expired';
  readonly collectionMode: 'collected' | 'discovered';
  readonly normalizedOriginalUrl: string;
  readonly normalizedApplicationUrl: string | null;
  readonly normalizedEmail: string | null;
  readonly reasons: readonly string[];
}

const isOfferExpired = (raw: RawScrapedOffer): boolean => {
  if (raw.isExpired) return true;
  if (!raw.expiresAt) return false;
  const ts = Date.parse(raw.expiresAt);
  return !Number.isNaN(ts) && ts < Date.now();
};

export const verifyScrapedOffer = (raw: RawScrapedOffer): OfferVerificationResult => {
  const reasons: string[] = [];

  if (!raw.title?.trim() || raw.title.trim().length < 3) {
    reasons.push('Missing or too short title');
  }
  if (!raw.organization?.trim() || raw.organization.trim().length < 2) {
    reasons.push('Missing or invalid organization');
  }

  const origCheck = validateHttpUrl(raw.originalUrl);
  if (!origCheck.safe || !origCheck.normalizedUrl) {
    reasons.push(`Invalid originalUrl: ${origCheck.reason ?? 'unknown'}`);
  }

  let normalizedAppUrl: string | null = null;
  if (raw.applicationUrl) {
    const appCheck = validateHttpUrl(raw.applicationUrl);
    if (appCheck.safe && appCheck.normalizedUrl) {
      normalizedAppUrl = appCheck.normalizedUrl;
    }
  }

  const normalizedEmail =
    raw.applicationEmail && isValidEmailSyntax(raw.applicationEmail)
      ? raw.applicationEmail.trim().toLowerCase()
      : null;

  const isExternalDiscovery =
    Boolean(raw.isExternalDiscovery) || raw.collectionMode === 'discovered';
  const collectionMode: 'collected' | 'discovered' = isExternalDiscovery
    ? 'discovered'
    : 'collected';

  let status: VerificationStatus = 'unverified_url';
  let verificationLevel: OfferVerificationResult['verificationLevel'] = 'externally_unverified';

  if (isOfferExpired(raw)) {
    status = 'expired';
    verificationLevel = 'expired';
  } else if (isExternalDiscovery) {
    // Never mark a discovery link as verified when target page was not legally fetched
    status = 'externally_unverified';
    verificationLevel = 'externally_unverified';
  } else if (origCheck.safe && origCheck.normalizedUrl) {
    if (raw.isAtsApi) {
      status = 'verified_ats_api';
      verificationLevel = 'verified';
    } else if (raw.isAuthorizedApi || raw.isRssFeed) {
      status = 'collected';
      verificationLevel = 'collected';
    } else if (isSpecificOfferUrl(origCheck.normalizedUrl)) {
      status = 'verified_offer';
      verificationLevel = 'verified';
    } else {
      status = 'generic_career_page';
      verificationLevel = 'collected';
    }
  }

  return {
    valid: reasons.length === 0 && origCheck.safe,
    status,
    verificationLevel,
    collectionMode,
    normalizedOriginalUrl: origCheck.normalizedUrl ?? raw.originalUrl,
    normalizedApplicationUrl: normalizedAppUrl,
    normalizedEmail,
    reasons,
  };
};
