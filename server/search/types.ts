export type VerificationStatus =
  | 'verified_ats_api'
  | 'verified_offer'
  | 'generic_career_page'
  | 'unverified_url';

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
  readonly enabled: boolean;
  readonly isDefault?: boolean;
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
  readonly sources: readonly string[];
  readonly customSources?: readonly CustomSourceInput[];
  readonly includeUnspecifiedDuration?: boolean;
  readonly includeUnspecifiedDates?: boolean;
}

export interface RawScrapedOffer {
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
  readonly skills?: readonly string[];
  readonly description?: string | null;
  readonly originalUrl: string;
  readonly applicationUrl?: string | null;
  readonly applicationEmail?: string | null;
  readonly contactName?: string | null;
  readonly source: string;
  readonly isAtsApi?: boolean;
}

export interface NormalizedScrapedOffer {
  readonly id: string;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary: string;
  readonly description: string;
  readonly location: string;
  readonly workMode: WorkModeValue;
  readonly contractType: string | null;
  readonly duration: string | null;
  readonly durationMonths: number | null;
  readonly postedDate: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly requirements: readonly string[];
  readonly source: string;
  readonly sourceUrl: string;
  readonly applicationUrl: string | null;
  readonly applicationEmail: string | null;
  readonly applicationFormUrl: string | null;
  readonly contactName: string | null;
  readonly collectedAt: string;
  readonly verificationStatus: VerificationStatus;
  readonly matchScore: number;
}

export interface ExternalSearchLink {
  readonly source: string;
  readonly label: string;
  readonly url: string;
  readonly reason: string;
}

export interface SourceCollectionLog {
  readonly source: string;
  readonly connector: string;
  readonly status: 'ok' | 'cached' | 'disabled_policy' | 'robots_blocked' | 'error';
  readonly collectedCount: number;
  readonly matchedCount: number;
  readonly durationMs: number;
  readonly message?: string;
}

export interface ConnectorExecutionResult {
  readonly source: string;
  readonly connector: string;
  readonly status: SourceCollectionLog['status'];
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

export interface ScrapingEngineResponse {
  readonly offers: readonly NormalizedScrapedOffer[];
  readonly groundingUrls: readonly { readonly title: string; readonly url: string }[];
  readonly externalSearchLinks: readonly ExternalSearchLink[];
  readonly sourceLogs: readonly SourceCollectionLog[];
  readonly stats: {
    readonly totalCollected: number;
    readonly afterDeduplication: number;
    readonly afterFiltering: number;
    readonly durationMs: number;
  };
}
