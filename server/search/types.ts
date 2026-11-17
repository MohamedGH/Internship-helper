export type VerificationStatus =
  | 'verified_ats_api'
  | 'verified_offer'
  | 'generic_career_page'
  | 'unverified_url'
  | 'collected'
  | 'discovered'
  | 'externally_unverified'
  | 'verified'
  | 'expired';

export type JobBoardAccessMode =
  | 'official_api'
  | 'rss_feed'
  | 'authorized_html'
  | 'search_index'
  | 'link_only'
  | 'disabled';

export type CollectionMode = 'collected' | 'discovered';

export type VerificationLevel =
  | 'verified'
  | 'collected'
  | 'discovered'
  | 'externally_unverified'
  | 'expired';

export type WorkModeValue = 'On-site' | 'Hybrid' | 'Remote';

export interface CustomSourceSelectors {
  readonly jobListSelector?: string;
  readonly titleSelector?: string;
  readonly companySelector?: string;
  readonly locationSelector?: string;
  readonly linkSelector?: string;
  readonly descriptionSelector?: string;
  readonly dateSelector?: string;
  readonly durationSelector?: string;
  readonly emailSelector?: string;
}

export interface CustomSourceInput {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly searchUrlTemplate?: string;
  readonly description?: string;
  readonly cssSelectors?: CustomSourceSelectors;
  readonly collectFrequencyMinutes?: number;
  readonly usePlaywright?: boolean;
  readonly accessMode?: JobBoardAccessMode | 'ats_api' | 'custom_html';
  readonly enabled: boolean;
  readonly isDefault?: boolean;
}

export interface CandidateProfileContext {
  readonly fullName?: string;
  readonly location?: string;
  readonly school?: string;
  readonly degree?: string;
  readonly graduationYear?: string;
  readonly targetRole?: string;
  readonly availability?: string;
  readonly skills?: readonly string[];
  readonly experiences?: readonly string[];
  readonly rawCvText?: string;
}

export interface SearchCriteria {
  readonly keywords: string;
  readonly domains?: readonly string[];
  readonly skills?: readonly string[];
  readonly location: string;
  readonly radiusKm?: number;
  readonly minDurationMonths?: number;
  readonly maxDurationMonths?: number;
  readonly startDateFrom?: string;
  readonly startDateTo?: string;
  readonly workMode: string;
  readonly educationLevel?: string;
  readonly languages?: readonly string[];
  readonly experienceLevel?: string;
  readonly includeExternalDiscovery?: boolean;
  readonly sources: readonly string[];
  readonly customSources?: readonly CustomSourceInput[];
  readonly includeUnspecifiedDuration?: boolean;
  readonly includeUnspecifiedDates?: boolean;
  readonly profile?: CandidateProfileContext;
}

export interface RawScrapedOffer {
  readonly externalId?: string | null;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary?: string | null;
  readonly location?: string | null;
  readonly workMode?: string | null;
  readonly contractType?: string | null;
  readonly duration?: string | null;
  readonly durationMonths?: number | null;
  readonly postedDate?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly expiresAt?: string | null;
  readonly isExpired?: boolean;
  readonly skills?: readonly string[];
  readonly languages?: readonly string[];
  readonly missions?: readonly string[];
  readonly educationLevel?: string | null;
  readonly experienceLevel?: string | null;
  readonly description?: string | null;
  readonly originalUrl: string;
  readonly applicationUrl?: string | null;
  readonly applicationEmail?: string | null;
  readonly contactName?: string | null;
  readonly source: string;
  readonly isAtsApi?: boolean;
  readonly isAuthorizedApi?: boolean;
  readonly isRssFeed?: boolean;
  readonly isExternalDiscovery?: boolean;
  readonly contentAccessible?: boolean;
  readonly accessMode?: JobBoardAccessMode | 'ats_api' | 'custom_html';
  readonly collectionMode?: CollectionMode;
}

export interface NormalizedScrapedOffer {
  readonly id: string;
  readonly externalId: string | null;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary: string | null;
  readonly description: string;
  readonly missions?: readonly string[];
  readonly contentAccessible: boolean;
  readonly location: string;
  readonly workMode: WorkModeValue;
  readonly contractType: string | null;
  readonly duration: string | null;
  readonly durationMonths: number | null;
  readonly postedDate: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly expiresAt: string | null;
  readonly requirements: readonly string[];
  readonly languages: readonly string[];
  readonly educationLevel: string | null;
  readonly experienceLevel: string | null;
  readonly source: string;
  readonly sources: readonly string[];
  readonly sourceUrl: string;
  readonly alternateUrls: readonly string[];
  readonly applicationUrl: string | null;
  readonly applicationEmail: string | null;
  readonly applicationFormUrl: string | null;
  readonly contactName: string | null;
  readonly collectedAt: string;
  readonly discoveredAt: string;
  readonly collectionMode: CollectionMode;
  readonly accessMode: JobBoardAccessMode | 'ats_api' | 'custom_html';
  readonly verificationStatus: VerificationStatus;
  readonly verificationLevel: VerificationLevel;
  readonly matchScore: number;
  readonly matchReasons?: readonly string[];
}

export interface ExternalSearchLink {
  readonly source: string;
  readonly label: string;
  readonly url: string;
  readonly reason: string;
  readonly accessMode?: JobBoardAccessMode;
}

export type SourceExecutionStatus =
  | 'ok'
  | 'empty'
  | 'cached'
  | 'disabled_policy'
  | 'robots_blocked'
  | 'link_only'
  | 'error';

export interface SourceCollectionLog {
  readonly source: string;
  readonly connector: string;
  readonly accessMode?: JobBoardAccessMode | 'ats_api' | 'custom_html';
  readonly status: SourceExecutionStatus;
  readonly collectedCount: number;
  readonly matchedCount: number;
  readonly durationMs: number;
  readonly message?: string;
}

export interface ConnectorExecutionResult {
  readonly source: string;
  readonly connector: string;
  readonly accessMode?: JobBoardAccessMode | 'ats_api' | 'custom_html';
  readonly status: SourceExecutionStatus;
  readonly offers: readonly RawScrapedOffer[];
  readonly externalSearchLinks: readonly ExternalSearchLink[];
  readonly durationMs: number;
  readonly message?: string;
}

export interface ScraperConnector {
  readonly id: string;
  readonly sourceName: string;
  readonly policyDisabled?: boolean;
  readonly policyReason?: string;
  readonly buildExternalSearchLink?: (criteria: SearchCriteria) => ExternalSearchLink | null;
  readonly collect: (criteria: SearchCriteria) => Promise<ConnectorExecutionResult>;
}

export interface JobBoardPolicySnapshot {
  readonly id: string;
  readonly name: string;
  readonly siteUrl: string;
  readonly tosUrl: string;
  readonly robotsTxtUrl: string;
  readonly accessMode: JobBoardAccessMode;
  readonly authorizationStatus: string;
  readonly lastTosCheckedAt: string;
  readonly requiresWrittenAgreement: boolean;
  readonly requiresApiCredentials: boolean;
  readonly allowedFields: readonly string[];
  readonly policySummary: string;
}

export interface ScrapingEngineResponse {
  readonly offers: readonly NormalizedScrapedOffer[];
  readonly groundingUrls: readonly { readonly title: string; readonly url: string }[];
  readonly externalSearchLinks: readonly ExternalSearchLink[];
  readonly sourceLogs: readonly SourceCollectionLog[];
  readonly jobBoardPolicies?: readonly JobBoardPolicySnapshot[];
  readonly queriesExecuted?: readonly string[];
  readonly stats: {
    readonly totalCollected: number;
    readonly afterDeduplication: number;
    readonly afterFiltering: number;
    readonly collectedCount: number;
    readonly discoveredCount: number;
    readonly durationMs: number;
  };
}
