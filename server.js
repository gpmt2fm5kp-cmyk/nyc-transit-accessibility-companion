import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { dataset, search_stations, get_station_accessibility, demonstrationFor } from './src/station-tools.js';
import { askSchema, askGuide } from './src/guide.js';

export function createApp({ answer = askGuide, keyConfigured = () => Boolean(process.env.GEMINI_API_KEY) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: keyConfigured(), stationCount: dataset.records.length, dataVerifiedAt: dataset.verifiedAt, refreshState: 'not_implemented', liveStatus: 'not_checked' }));
  app.get('/api/stations', (req, res) => res.json({ ...search_stations({ query: req.query.query ?? '', borough: req.query.borough ?? 'All' }), verifiedAt: dataset.verifiedAt }));
  app.get('/api/stations/:stationId', (req, res) => res.json(get_station_accessibility({ stationId: req.params.stationId })));
  app.get('/api/stations/:stationId/demo', (req, res) => res.json(demonstrationFor(get_station_accessibility({ stationId: req.params.stationId }).record)));
  const questionLimit = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited', message: 'Please wait a minute before asking another question. Station cards are still available.' } });
  app.post('/api/ask', questionLimit, async (req, res, next) => {
    try {
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'invalid_origin', message: 'Please ask from the Access Granted website.' });
      const body = askSchema.parse(req.body);
      get_station_accessibility({ stationId: body.stationId });
      if (!keyConfigured()) return res.status(503).json({ error: 'ai_not_configured', message: 'The AI guide is not connected yet. You can still read station details and official sources below.' });
      try { res.json(await answer(body)); }
      catch (error) {
        // Classify in memory; never return or log the provider's raw error or key.
        const raw = String(error?.message || '');
        const status = Number(error?.status) || 0;
        let code = 'ai_unavailable';
        let message = 'The AI guide could not answer just now. Try again shortly, or use the station card and official MTA links.';
        if (status === 429) { code = 'ai_quota'; message = 'Google has reached a usage limit for this AI connection. Try later; station cards and official MTA links are still available.'; }
        else if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|key expired/i.test(raw)) { code = 'ai_credentials'; message = 'The AI connection needs its private Gemini key checked by the project owner. Station cards are still available.'; }
        else if (status === 404) { code = 'ai_model'; message = 'The configured AI model is unavailable. The project owner needs to select a supported Gemini model. Station cards are still available.'; }
        else if (status === 400) { code = 'ai_request'; }
        else if (error instanceof ZodError || error instanceof SyntaxError) { code = 'ai_response'; }
        else if (/abort|timed? ?out|timeout/i.test(raw)) { code = 'ai_timeout'; }
        console.warn('Gemini request failed', { code, providerStatus: status || null });
        res.status(502).json({ error: code, message });
      }
    } catch (error) {
      if (error instanceof ZodError || error.status === 404) return next(error);
      // Do not return provider errors: they may contain credentials or raw prompts.
      res.status(502).json({ error: 'ai_unavailable', message: 'The AI guide could not answer just now. Try again shortly, or use the station card and official MTA links.' });
    }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'That request is not available.' }));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.use((error, req, res, next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'invalid_input', message: 'Check your station, borough, and question. Questions must be 1–600 characters.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'That request is too large. Please shorten your question.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'invalid_input', message: 'That request could not be read. Please try again.' });
    res.status(error.status || 500).json({ error: error.code || 'server_error', message: error.status === 404 ? error.message : 'Something went wrong. Please try again.' });
  });
  return app;
}
const app = createApp();
export default app;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(Number(process.env.PORT) || 8770, '127.0.0.1', () => console.log(`Access Granted: http://127.0.0.1:${Number(process.env.PORT) || 8770}`));
}
