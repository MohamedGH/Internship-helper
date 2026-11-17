import {
  JobBoardAccessMode,
  JobBoardPolicySnapshot,
  RawScrapedOffer,
  SearchCriteria,
} from '../types.ts';

export type AuthorizationStatus =
  | 'authorized'
  | 'requires_credentials'
  | 'requires_written_agreement'
  | 'prohibited_without_agreement'
  | 'suspended'
  | 'unavailable';

export type CollectibleField =
  | 'title'
  | 'organization'
  | 'location'
  | 'url'
  | 'snippet'
  | 'publishedDate'
  | 'contractType'
  | 'duration'
  | 'description';

export interface JobBoardSourceConfig {
  readonly id: string;
  readonly name: string;
  readonly siteUrl: string;
  readonly tosUrl: string;
  readonly robotsTxtUrl: string;
  readonly accessMode: JobBoardAccessMode;
  readonly authorizationStatus: AuthorizationStatus;
  readonly lastTosCheckedAt: string;
  readonly allowedFields: readonly CollectibleField[];
  readonly requiresWrittenAgreement: boolean;
  readonly requiresApiCredentials: boolean;
  readonly envCredentialVars?: readonly string[];
  readonly domains: readonly string[];
  readonly countryScope: 'FR' | 'EU' | 'GLOBAL';
  readonly policySummary: string;
  readonly rssFeedUrls?: readonly string[];
  readonly apiEndpoint?: string;
  readonly supportsSearchIndexDiscovery?: boolean;
  readonly buildExternalSearchUrl: (criteria: SearchCriteria) => string;
  readonly resolveEffectiveAccessMode?: (
    env?: Readonly<Record<string, string | undefined>>
  ) => {
    readonly accessMode: JobBoardAccessMode;
    readonly authorizationStatus: AuthorizationStatus;
    readonly reason?: string;
  };
}

export const isAutomatedExtractionAllowed = (mode: JobBoardAccessMode): boolean =>
  mode === 'official_api' || mode === 'rss_feed' || mode === 'authorized_html';

export const isSearchIndexDiscoveryAllowed = (config: JobBoardSourceConfig): boolean =>
  Boolean(config.supportsSearchIndexDiscovery) &&
  (config.accessMode === 'link_only' || config.accessMode === 'search_index');

export const toPolicySnapshot = (
  config: JobBoardSourceConfig,
  env: Readonly<Record<string, string | undefined>> = process.env
): JobBoardPolicySnapshot => {
  const effective = config.resolveEffectiveAccessMode
    ? config.resolveEffectiveAccessMode(env)
    : {
        accessMode: config.accessMode,
        authorizationStatus: config.authorizationStatus,
      };

  return {
    id: config.id,
    name: config.name,
    siteUrl: config.siteUrl,
    tosUrl: config.tosUrl,
    robotsTxtUrl: config.robotsTxtUrl,
    accessMode: effective.accessMode,
    authorizationStatus: effective.authorizationStatus,
    lastTosCheckedAt: config.lastTosCheckedAt,
    requiresWrittenAgreement: config.requiresWrittenAgreement,
    requiresApiCredentials: config.requiresApiCredentials,
    allowedFields: [...config.allowedFields],
    policySummary: effective.reason
      ? `${config.policySummary} (${effective.reason})`
      : config.policySummary,
  };
};

export const sanitizeOfferByPolicy = (
  offer: RawScrapedOffer,
  config: JobBoardSourceConfig
): RawScrapedOffer => {
  const allowed = new Set<CollectibleField>(config.allowedFields);
  return {
    ...offer,
    location: allowed.has('location') ? offer.location : null,
    description: allowed.has('description')
      ? offer.description
      : allowed.has('snippet')
        ? offer.description?.slice(0, 320) ?? null
        : null,
    postedDate: allowed.has('publishedDate') ? offer.postedDate : null,
    contractType: allowed.has('contractType') ? offer.contractType : null,
    duration: allowed.has('duration') ? offer.duration : null,
    durationMonths: allowed.has('duration') ? offer.durationMonths : null,
  };
};
