export enum SourceProvider {
  WelcomeToTheJungle = 'Welcome to the Jungle',
  LinkedIn = 'LinkedIn',
  Indeed = 'Indeed',
  HelloWork = 'HelloWork',
  JobTeaser = 'JobTeaser',
  CompanyCareer = 'Company Career Page',
}

export enum WorkMode {
  OnSite = 'On-site',
  Hybrid = 'Hybrid',
  Remote = 'Remote',
}

export enum ChannelType {
  Email = 'email',
  Form = 'form',
  Portal = 'portal',
}

export enum ApplicationStatus {
  Discovered = 'discovered',
  Drafting = 'drafting',
  Ready = 'ready',
  Sent = 'sent',
  Interview = 'interview',
  Archived = 'archived',
}

export enum ErrorSeverity {
  Validation = 'validation',
  Network = 'network',
  Api = 'api',
  Dispatch = 'dispatch',
}

export type CoverLetterLanguage = 'fr' | 'en';
export type CoverLetterTone = 'professional' | 'enthusiastic' | 'concise';

export interface CandidateProfile {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly location: string;
  readonly school: string;
  readonly degree: string;
  readonly graduationYear: string;
  readonly targetRole: string;
  readonly availability: string;
  readonly portfolioUrl: string;
  readonly linkedinUrl: string;
  readonly skills: readonly string[];
  readonly experiences: readonly string[];
  readonly rawCvText: string;
  readonly avatarUrl: string;
}

export interface ApplicationChannel {
  readonly id: string;
  readonly type: ChannelType;
  readonly target: string; // email address or URL
  readonly label: string; // e.g. "Recruiting Inbox", "WelcomeKit Form", "Greenhouse ATS"
  readonly contactName?: string;
  readonly verified: boolean;
  readonly sourceUrl?: string;
}

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

export interface CustomSource {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly searchUrlTemplate?: string;
  readonly description?: string;
  readonly cssSelectors?: CustomSourceSelectors;
  readonly collectFrequencyMinutes?: number;
  readonly usePlaywright?: boolean;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly createdAt: string;
}

export type SourceIdentifier = SourceProvider | string;

export type OfferVerificationStatus =
  | 'verified_ats_api'
  | 'verified_offer'
  | 'generic_career_page'
  | 'unverified_url';

export interface InternshipOffer {
  readonly id: string;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary: string;
  readonly location: string;
  readonly workMode: WorkMode;
  readonly contractType?: string | null;
  readonly duration: string | null;
  readonly durationMonths: number | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly source: SourceIdentifier;
  readonly sourceUrl: string;
  readonly applicationUrl?: string | null;
  readonly postedDate: string | null;
  readonly collectedAt?: string;
  readonly verificationStatus?: OfferVerificationStatus;
  readonly matchScore?: number;
  readonly description: string;
  readonly requirements: readonly string[];
  readonly channels: readonly ApplicationChannel[];
  readonly status: ApplicationStatus;
  readonly sentAt?: string;
  readonly sentViaChannelId?: string;
}

export interface PreparedDossier {
  readonly offerId: string;
  readonly language: CoverLetterLanguage;
  readonly tone: CoverLetterTone;
  readonly emailSubject: string;
  readonly coverLetter: string;
  readonly cvTailoringHighlights: readonly string[];
  readonly matchedSkills: readonly string[];
  readonly selectedChannelId: string;
  readonly updatedAt: string;
  readonly aiGenerated: boolean;
}

export interface SearchQuery {
  readonly keywords: string;
  readonly domains?: readonly string[];
  readonly skills?: readonly string[];
  readonly location: string;
  readonly radiusKm?: number;
  readonly duration: string;
  readonly minDurationMonths: number;
  readonly maxDurationMonths: number;
  readonly startDateFrom: string;
  readonly startDateTo: string;
  readonly workMode: WorkMode | 'all';
  readonly sources: readonly string[];
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

export interface AppError {
  readonly id: string;
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly message: string;
  readonly detail?: string;
  readonly retryable: boolean;
  readonly timestamp: string;
  readonly context?: string;
}

export type RouteName = 'discover' | 'dossier' | 'queue' | 'applications' | 'profile';

export type AppRoute =
  | { readonly name: 'discover'; readonly path: '/' }
  | { readonly name: 'dossier'; readonly path: `/dossier/${string}`; readonly offerId: string }
  | { readonly name: 'queue'; readonly path: '/queue' }
  | { readonly name: 'applications'; readonly path: '/applications' }
  | { readonly name: 'profile'; readonly path: '/cv' };

export interface FilterState {
  readonly sourceFilter: string | 'all';
  readonly channelFilter: ChannelType | 'all';
  readonly textFilter: string;
  readonly minDurationFilter: number;
  readonly maxDurationFilter: number;
  readonly dateRangeFrom: string;
  readonly dateRangeTo: string;
}

export interface AppState {
  readonly profile: CandidateProfile;
  readonly searchQuery: SearchQuery;
  readonly filters: FilterState;
  readonly customSources: readonly CustomSource[];
  readonly offers: readonly InternshipOffer[];
  readonly dossiers: Readonly<Record<string, PreparedDossier>>;
  readonly isSearching: boolean;
  readonly isPreparingOfferId: string | null;
  readonly isDiscoveringChannelsId: string | null;
  readonly lastSearchGroundingUrls: readonly { readonly title: string; readonly url: string }[];
  readonly lastExternalSearchLinks: readonly ExternalSearchLink[];
  readonly lastSourceLogs: readonly SourceCollectionLog[];
  readonly errors: readonly AppError[];
  readonly lastDispatchNotice: string | null;
}
