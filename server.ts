import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  discoverChannelsWithGemini,
  prepareDossierWithGemini,
} from './server/geminiService.ts';
import { discoverChannelsFromUrl } from './server/search/channelScraper.ts';
import { getJobBoardPolicySnapshots } from './server/search/jobboards/jobBoardSearch.ts';
import { runScrapingSearch } from './server/search/scraperEngine.ts';
import type { CustomSourceInput } from './server/search/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

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
      const body = req.body ?? {};
      const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : '';
      if (keywords.length < 2) {
        res.status(400).json({
          code: 'INVALID_KEYWORDS',
          error: 'Search keywords must be at least 2 characters long.',
        });
        return;
      }

      const customSources = Array.isArray(body.customSources)
        ? (body.customSources as CustomSourceInput[])
        : [];

      const result = await runScrapingSearch({
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
        educationLevel:
          typeof body.educationLevel === 'string' ? body.educationLevel : undefined,
        languages: Array.isArray(body.languages) ? body.languages.map(String) : undefined,
        experienceLevel:
          typeof body.experienceLevel === 'string' ? body.experienceLevel : undefined,
        includeExternalDiscovery:
          typeof body.includeExternalDiscovery === 'boolean'
            ? body.includeExternalDiscovery
            : true,
        sources:
          Array.isArray(body.sources) && body.sources.length > 0
            ? body.sources.map(String)
            : [
                'Company Career Page',
                'Meteojob',
                'HelloWork',
                'Welcome to the Jungle',
                'France Travail',
                'Apec',
                'Remotive',
                'We Work Remotely',
              ],
        customSources,
      });

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
      });

      if (scrapedChannels.length > 0) {
        res.json({ channels: scrapedChannels });
        return;
      }

      // Optional Gemini fallback only when GEMINI_API_KEY is present and never crashes with 429
      if (process.env.GEMINI_API_KEY) {
        try {
          const aiChannels = await discoverChannelsWithGemini({
            organization: String(body.organization),
            title: String(body.title),
            location: String(body.location ?? ''),
            sourceUrl: String(body.sourceUrl ?? ''),
          });
          res.json({ channels: aiChannels });
          return;
        } catch {
          // Graceful fallback to empty verified channels instead of propagating 429
        }
      }

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
