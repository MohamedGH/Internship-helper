import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import {
  AppError,
  AppState,
  ApplicationChannel,
  CandidateProfile,
  CoverLetterLanguage,
  CoverLetterTone,
  ErrorSeverity,
  ExternalSearchLink,
  InternshipOffer,
  PreparedDossier,
  SearchQuery,
  SourceCollectionLog,
} from '../types/domain';
import {
  AppAction,
  appReducer,
  loadStateFromStorage,
  saveStateToStorage,
} from './stateManager';
import { createAppError, normalizeUnknownError, parseApiErrorResponse } from './errorManager';
import { normalizeOffer, validateSearchQuery } from '../modules/sourceAggregator';
import { normalizeChannelsFromRaw } from '../modules/channelFinder';
import { buildPreparedDossier } from '../modules/dossierComposer';

interface AppStateContextValue {
  readonly state: AppState;
  readonly dispatch: React.Dispatch<AppAction>;
  readonly runMultiSourceSearch: (overrideQuery?: SearchQuery) => Promise<void>;
  readonly prepareOfferDossier: (
    offer: InternshipOffer,
    language: CoverLetterLanguage,
    tone: CoverLetterTone,
    useAi?: boolean
  ) => Promise<PreparedDossier>;
  readonly discoverChannelsForOffer: (offer: InternshipOffer) => Promise<void>;
  readonly updateProfile: (profile: CandidateProfile) => void;
  readonly reportError: (error: AppError) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider: React.FC<{ readonly children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(appReducer, undefined, loadStateFromStorage);

  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  const reportError = useCallback((error: AppError) => {
    dispatch({ type: 'ADD_ERROR', error });
  }, []);

  const updateProfile = useCallback((profile: CandidateProfile) => {
    dispatch({ type: 'SET_PROFILE', profile });
  }, []);

  const runMultiSourceSearch = useCallback(
    async (overrideQuery?: SearchQuery) => {
      const query = overrideQuery ?? state.searchQuery;
      const validation = validateSearchQuery(query);
      if (!validation.valid) {
        dispatch({
          type: 'ADD_ERROR',
          error: createAppError({
            code: 'INVALID_SEARCH_QUERY',
            severity: ErrorSeverity.Validation,
            message: validation.message ?? 'Invalid search input.',
            context: 'search',
          }),
        });
        return;
      }

      dispatch({ type: 'SEARCH_STARTED', sources: query.sources });

      try {
        const requestBody = JSON.stringify({
          ...query,
          skills: query.skills && query.skills.length > 0 ? query.skills : state.profile.skills,
          educationLevel:
            query.educationLevel?.trim() || state.profile.degree?.trim() || undefined,
          customSources: state.customSources,
          profile: {
            fullName: state.profile.fullName,
            location: state.profile.location,
            school: state.profile.school,
            degree: state.profile.degree,
            graduationYear: state.profile.graduationYear,
            targetRole: state.profile.targetRole,
            availability: state.profile.availability,
            skills: state.profile.skills,
            experiences: state.profile.experiences,
            rawCvText: state.profile.rawCvText,
          },
        });

        type SearchPayload = {
          offers?: Array<Parameters<typeof normalizeOffer>[0]>;
          groundingUrls?: Array<{ title: string; url: string }>;
          externalSearchLinks?: ExternalSearchLink[];
          sourceLogs?: SourceCollectionLog[];
          queriesExecuted?: string[];
        };

        let payload: SearchPayload | null = null;
        const streamRes = await fetch('/api/search/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        if (
          streamRes.ok &&
          streamRes.body &&
          (streamRes.headers.get('content-type') ?? '').includes('ndjson')
        ) {
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              const evt = JSON.parse(trimmed) as {
                type: string;
                sources?: string[];
                queriesExecuted?: string[];
                source?: string;
                log?: SourceCollectionLog;
                result?: SearchPayload;
                error?: string;
                detail?: string;
              };
              if (evt.type === 'init') {
                dispatch({
                  type: 'SEARCH_PROGRESS_INIT',
                  sources: evt.sources ?? [...query.sources],
                  queriesExecuted: evt.queriesExecuted ?? [],
                });
              } else if (evt.type === 'source_start' && evt.source) {
                dispatch({ type: 'SEARCH_SOURCE_STARTED', source: evt.source });
              } else if (evt.type === 'source_done' && evt.log) {
                dispatch({ type: 'SEARCH_SOURCE_COMPLETED', log: evt.log });
              } else if (evt.type === 'complete' && evt.result) {
                payload = evt.result;
              } else if (evt.type === 'error') {
                throw new Error(evt.detail || evt.error || 'Search stream failed');
              }
            }
          }
        } else {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          });
          if (!res.ok) {
            const apiErr = await parseApiErrorResponse(res, 'search');
            dispatch({ type: 'SEARCH_FAILED', error: apiErr });
            return;
          }
          payload = (await res.json()) as SearchPayload;
        }

        if (!payload) {
          throw new Error('Empty response received from search engine.');
        }

        const normalized = (payload.offers ?? [])
          .filter((item) => item && item.title && item.organization)
          .map((item, idx) => normalizeOffer(item, idx, state.customSources));

        const hasExternalLinks = (payload.externalSearchLinks?.length ?? 0) > 0;
        if (normalized.length === 0 && !hasExternalLinks) {
          dispatch({
            type: 'SEARCH_FAILED',
            error: createAppError({
              code: 'NO_RESULTS_FOUND',
              severity: ErrorSeverity.Api,
              message:
                'No matching internships were scraped for these criteria. Try broader keywords, wider duration, or select more platforms.',
              retryable: true,
              context: 'search',
            }),
          });
          return;
        }

        dispatch({
          type: 'SEARCH_SUCCEEDED',
          offers: normalized,
          groundingUrls: payload.groundingUrls ?? [],
          externalSearchLinks: payload.externalSearchLinks ?? [],
          sourceLogs: payload.sourceLogs ?? [],
          queriesExecuted: payload.queriesExecuted ?? [],
        });
      } catch (err) {
        dispatch({
          type: 'SEARCH_FAILED',
          error: normalizeUnknownError(err, 'search', 'Unable to complete multi-source internship search.'),
        });
      }
    },
    [state.searchQuery, state.customSources, state.profile]
  );

  const discoverChannelsForOffer = useCallback(async (offer: InternshipOffer) => {
    dispatch({ type: 'DISCOVER_CHANNELS_STARTED', offerId: offer.id });
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: offer.organization,
          title: offer.title,
          location: offer.location,
          sourceUrl: offer.sourceUrl,
          applicationUrl: offer.applicationUrl ?? undefined,
        }),
      });

      if (!res.ok) {
        const apiErr = await parseApiErrorResponse(res, 'channels');
        dispatch({ type: 'DISCOVER_CHANNELS_FAILED', error: apiErr });
        return;
      }

      const payload = (await res.json()) as {
        channels?: Array<Partial<ApplicationChannel>>;
      };

      const normalized = normalizeChannelsFromRaw(
        offer.id,
        payload.channels ?? [],
        offer.sourceUrl
      );

      dispatch({
        type: 'DISCOVER_CHANNELS_SUCCEEDED',
        offerId: offer.id,
        channels: normalized,
      });
    } catch (err) {
      dispatch({
        type: 'DISCOVER_CHANNELS_FAILED',
        error: normalizeUnknownError(
          err,
          'channels',
          `Could not verify application channels for ${offer.organization}.`
        ),
      });
    }
  }, []);

  const prepareOfferDossier = useCallback(
    async (
      offer: InternshipOffer,
      language: CoverLetterLanguage,
      tone: CoverLetterTone,
      useAi = true
    ): Promise<PreparedDossier> => {
      const instantDraft = buildPreparedDossier(offer, state.profile, language, tone);

      if (!useAi) {
        dispatch({
          type: 'PREPARE_SUCCEEDED',
          offerId: offer.id,
          dossier: instantDraft,
        });
        return instantDraft;
      }

      dispatch({ type: 'PREPARE_STARTED', offerId: offer.id });

      try {
        const res = await fetch('/api/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offer,
            profile: state.profile,
            language,
            tone,
          }),
        });

        if (!res.ok) {
          const apiErr = await parseApiErrorResponse(res, 'prepare');
          dispatch({ type: 'PREPARE_FAILED', error: apiErr });
          // Still preserve deterministic draft so user is never blocked
          dispatch({
            type: 'PREPARE_SUCCEEDED',
            offerId: offer.id,
            dossier: instantDraft,
          });
          return instantDraft;
        }

        const payload = (await res.json()) as {
          fallbackOnly?: boolean;
          emailSubject?: string;
          emailBody?: string;
          formCoverNote?: string;
          coverLetter?: string;
          cvTailoringHighlights?: string[];
        };

        if (payload.fallbackOnly) {
          dispatch({
            type: 'PREPARE_SUCCEEDED',
            offerId: offer.id,
            dossier: instantDraft,
          });
          return instantDraft;
        }

        const aiDossier: PreparedDossier = {
          ...instantDraft,
          emailSubject: payload.emailSubject?.trim() || instantDraft.emailSubject,
          emailBody: payload.emailBody?.trim() || instantDraft.emailBody,
          formCoverNote: payload.formCoverNote?.trim() || instantDraft.formCoverNote,
          coverLetter: payload.coverLetter?.trim() || instantDraft.coverLetter,
          cvTailoringHighlights:
            Array.isArray(payload.cvTailoringHighlights) &&
            payload.cvTailoringHighlights.length > 0
              ? payload.cvTailoringHighlights
              : instantDraft.cvTailoringHighlights,
          updatedAt: new Date().toISOString(),
          aiGenerated: true,
        };

        dispatch({
          type: 'PREPARE_SUCCEEDED',
          offerId: offer.id,
          dossier: aiDossier,
        });
        return aiDossier;
      } catch (err) {
        dispatch({
          type: 'PREPARE_FAILED',
          error: normalizeUnknownError(
            err,
            'prepare',
            'AI adaptation unavailable; prepared structured template instead.'
          ),
        });
        dispatch({
          type: 'PREPARE_SUCCEEDED',
          offerId: offer.id,
          dossier: instantDraft,
        });
        return instantDraft;
      }
    },
    [state.profile]
  );

  return (
    <AppStateContext.Provider
      value={{
        state,
        dispatch,
        runMultiSourceSearch,
        prepareOfferDossier,
        discoverChannelsForOffer,
        updateProfile,
        reportError,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = (): AppStateContextValue => {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside AppStateProvider.');
  }
  return ctx;
};
