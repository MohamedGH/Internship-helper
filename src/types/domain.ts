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

export interface InternshipOffer {
  readonly id: string;
  readonly title: string;
  readonly organization: string;
  readonly organizationSummary: string;
  readonly location: string;
  readonly workMode: WorkMode;
  readonly duration: string;
  readonly source: SourceProvider;
  readonly sourceUrl: string;
  readonly postedDate: string;
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
  readonly location: string;
  readonly duration: string;
  readonly workMode: WorkMode | 'all';
  readonly sources: readonly SourceProvider[];
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
  readonly sourceFilter: SourceProvider | 'all';
  readonly channelFilter: ChannelType | 'all';
  readonly textFilter: string;
}

export interface AppState {
  readonly profile: CandidateProfile;
  readonly searchQuery: SearchQuery;
  readonly filters: FilterState;
  readonly offers: readonly InternshipOffer[];
  readonly dossiers: Readonly<Record<string, PreparedDossier>>;
  readonly isSearching: boolean;
  readonly isPreparingOfferId: string | null;
  readonly isDiscoveringChannelsId: string | null;
  readonly lastSearchGroundingUrls: readonly { readonly title: string; readonly url: string }[];
  readonly errors: readonly AppError[];
  readonly lastDispatchNotice: string | null;
}
