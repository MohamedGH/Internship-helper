import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  discoverChannelsWithGemini,
  prepareDossierWithGemini,
  searchInternshipsWithGemini,
} from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const startServer = async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'stagepilot-api' });
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

      const result = await searchInternshipsWithGemini({
        keywords,
        location: typeof body.location === 'string' ? body.location : 'Paris / Remote',
        duration: typeof body.duration === 'string' ? body.duration : '6 months',
        workMode: typeof body.workMode === 'string' ? body.workMode : 'all',
        sources: Array.isArray(body.sources) && body.sources.length > 0
          ? body.sources
          : ['Welcome to the Jungle', 'LinkedIn', 'Indeed', 'HelloWork'],
      });

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.';
      const status = message.includes('429') || message.includes('RESOURCE_EXHAUSTED') ? 429 : 500;
      res.status(status).json({
        code: status === 429 ? 'RATE_LIMIT' : 'SEARCH_API_ERROR',
        error: 'Unable to search internship sources right now.',
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

      const channels = await discoverChannelsWithGemini({
        organization: String(body.organization),
        title: String(body.title),
        location: String(body.location ?? ''),
        sourceUrl: String(body.sourceUrl ?? ''),
      });

      res.json({ channels });
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
