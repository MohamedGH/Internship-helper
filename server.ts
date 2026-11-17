import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { prepareDossierWithGemini } from './server/geminiService.ts';
import { discoverChannelsFromUrl } from './server/search/channelScraper.ts';
import { getJobBoardPolicySnapshots } from './server/search/jobboards/jobBoardSearch.ts';
import { buildMultipliedQueries } from './server/search/platforms/queryPlanner.ts';
import { runScrapingSearch } from './server/search/scraperEngine.ts';
import type {
  CandidateProfileContext,
  CustomSourceInput,
  SearchCriteria,
} from './server/search/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const DEFAULT_API_SOURCES = [
  'Company Career Page',
  'France Travail',
  'Meteojob',
  'Apec',
  'Welcome to the Jungle',
  'HelloWork',
  'LesJeudis',
  'AFJV',
  'Remotive',
  'Remote OK',
  'We Work Remotely',
  'Arbeitnow',
  'Himalayas',
  'Jobicy',
];

const parseSearchCriteriaFromBody = (body: Record<string, unknown>): SearchCriteria => {
  const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : '';
  const customSources = Array.isArray(body.customSources)
    ? (body.customSources as CustomSourceInput[])
    : [];
  const rawProfile =
    body.profile && typeof body.profile === 'object'
      ? (body.profile as CandidateProfileContext)
      : undefined;

  return {
    keywords,
    domains: Array.isArray(body.domains) ? body.domains.map(String) : undefined,
    skills: Array.isArray(body.skills) ? body.skills.map(String) : undefined,
    location: typeof body.location === 'string' ? body.location : 'Paris / Remote',
    radiusKm: typeof body.radiusKm === 'number' ? body.radiusKm : undefined,
    minDurationMonths:
      typeof body.minDurationMonths === 'number' ? body.minDurationMonths : undefined,
    maxDurationMonths:
      typeof body.maxDurationMonths === 'number' ? body.maxDurationMonths : undefined,
    startDateFrom: typeof body.startDateFrom === 'string' ? body.startDateFrom : undefined,
    startDateTo: typeof body.startDateTo === 'string' ? body.startDateTo : undefined,
    workMode: typeof body.workMode === 'string' ? body.workMode : 'all',
    educationLevel: typeof body.educationLevel === 'string' ? body.educationLevel : undefined,
    languages: Array.isArray(body.languages) ? body.languages.map(String) : undefined,
    experienceLevel: typeof body.experienceLevel === 'string' ? body.experienceLevel : undefined,
    includeExternalDiscovery:
      typeof body.includeExternalDiscovery === 'boolean'
        ? body.includeExternalDiscovery
        : true,
    sources:
      Array.isArray(body.sources) && body.sources.length > 0
        ? body.sources.map(String)
        : DEFAULT_API_SOURCES,
    customSources,
    profile: rawProfile,
  };
};

const startServer = async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'stagepilot-api' });
  });

  app.get('/api/sources/registry', (_req, res) => {
    res.json({ jobBoards: getJobBoardPolicySnapshots() });
  });

  app.post('/api/search', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : '';
      if (keywords.length < 2) {
        res.status(400).json({
          code: 'INVALID_KEYWORDS',
          error: 'Search keywords must be at least 2 characters long.',
        });
        return;
      }

      const criteria = parseSearchCriteriaFromBody(body);
      const result = await runScrapingSearch(criteria);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.';
      res.status(500).json({
        code: 'SCRAPER_ENGINE_ERROR',
        error: 'Unable to run web scraper search right now.',
        detail: message,
      });
    }
  });

  app.post('/api/search/stream', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : '';
    if (keywords.length < 2) {
      res.status(400).json({
        code: 'INVALID_KEYWORDS',
        error: 'Search keywords must be at least 2 characters long.',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const writeEvent = (payload: unknown) => {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify(payload)}\n`);
      }
    };

    try {
      const criteria = parseSearchCriteriaFromBody(body);
      const plannedQueries = buildMultipliedQueries(criteria, { maxQueries: 8 }).map(
        (q) => q.query
      );
      writeEvent({
        type: 'init',
        sources: criteria.sources,
        queriesExecuted: plannedQueries,
      });

      const result = await runScrapingSearch(criteria, {
        onConnectorStart: (connector) => {
          writeEvent({
            type: 'source_start',
            source: connector.sourceName,
            connector: connector.id,
          });
        },
        onConnectorComplete: (log) => {
          writeEvent({
            type: 'source_done',
            log,
          });
        },
      });

      writeEvent({
        type: 'complete',
        result,
      });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.';
      writeEvent({
        type: 'error',
        code: 'SCRAPER_ENGINE_ERROR',
        error: 'Unable to run web scraper search right now.',
        detail: message,
      });
      res.end();
    }
  });

  app.post('/api/channels', async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!body.organization || !body.title) {
        res.status(400).json({
          code: 'MISSING_OFFER_INFO',
          error: 'Organization and role title are required to discover channels.',
        });
        return;
      }

      const scrapedChannels = await discoverChannelsFromUrl({
        organization: String(body.organization),
        title: String(body.title),
        sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
        applicationUrl: typeof body.applicationUrl === 'string' ? body.applicationUrl : undefined,
        companyUrl: typeof body.companyUrl === 'string' ? body.companyUrl : undefined,
      });

      res.json({ channels: scrapedChannels });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Channel discovery failed.';
      res.status(500).json({
        code: 'CHANNEL_DISCOVERY_ERROR',
        error: 'Could not discover application channels.',
        detail: message,
      });
    }
  });

  app.post('/api/prepare', async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!body.offer || !body.profile) {
        res.status(400).json({
          code: 'MISSING_DOSSIER_INPUT',
          error: 'Offer and candidate profile are required to prepare a dossier.',
        });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.json({ fallbackOnly: true });
        return;
      }

      const prepared = await prepareDossierWithGemini({
        offer: body.offer,
        profile: body.profile,
        language: body.language === 'en' ? 'en' : 'fr',
        tone:
          body.tone === 'enthusiastic' || body.tone === 'concise'
            ? body.tone
            : 'professional',
      });

      res.json(prepared);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preparation failed.';
      res.status(500).json({
        code: 'DOSSIER_PREP_ERROR',
        error: 'Could not generate adapted cover letter.',
        detail: message,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StagePilot server listening on http://localhost:${PORT}`);
  });
};

startServer();
