// Thin proxy that forwards recommendation queries to the ML FastAPI service.
// FE calls /api/recommend/similar; this hop keeps ML off the public CORS
// surface and degrades gracefully if the ML container is down.

const express = require('express');
const axios = require('axios');

const router = express.Router();

// In-docker default: http://ml-service:8000. Native dev: http://localhost:8000.
// Overridable via ML_SERVICE_URL in .env.
const ML_URL = process.env.ML_SERVICE_URL
  || (process.env.NODE_ENV === 'production' ? 'http://ml-service:8000' : 'http://localhost:8000');
const TIMEOUT_MS = 6000;

router.get('/similar', async (req, res) => {
  const { isbn, text, k, reRank, alpha, beta, gamma } = req.query;
  if (!isbn && !text) {
    return res.status(400).json({ error: 'isbn or text required' });
  }

  try {
    const resp = await axios.get(`${ML_URL}/recommend/similar`, {
      params: { isbn, text, k, reRank, alpha, beta, gamma },
      timeout: TIMEOUT_MS,
    });
    // ML returns { strategy, results:[...] }. Normalise to `items` so the
    // FE has one consistent shape and can render without a schema switch.
    const data = resp.data || {};
    const items = (data.items || data.results || []).map((r) => ({
      isbn: r.isbn,
      title: r.title,
      author: r.author,
      coverUrl: (r.coverUrl || r.thumbnail || '').replace(/^http:\/\/books\.google\.com/, 'https://books.google.com'),
      score: r.score,
      simScore: r.sim_score,
      receptionScore: r.reception_score,
      platformBreakdown: r.platform_breakdown || {},
      subjects: r.subjects || [],
      hardcoverRating: r.hardcover_rating,
    }));
    res.json({ items, strategy: data.strategy || 'semantic', degraded: false });
  } catch (err) {
    const reason = err.code === 'ECONNREFUSED' ? 'ml-service-unreachable'
      : err.code === 'ECONNABORTED' ? 'ml-service-timeout'
      : err.response?.status === 503 ? 'ml-model-not-loaded'
      : (err.message || 'unknown');
    // Return 200 with an empty envelope so the FE never sees an error toast
    // for a nice-to-have panel.
    res.json({ items: [], degraded: true, reason });
  }
});

module.exports = router;
