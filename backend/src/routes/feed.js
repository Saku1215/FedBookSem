const express = require('express');
const jwt = require('jsonwebtoken');
const { getTimeline, getAllReviews, recommendBooks, booksLikedByFollowed } = require('../graph/social');

const router = express.Router();
const ML_BASE = process.env.ML_SERVICE_URL || 'http://localhost:8000';

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/', auth, async (req, res) => {
  res.json(await getTimeline(req.user.id));
});

router.get('/all', async (_req, res) => {
  res.json(await getAllReviews());
});

// Legacy graph-based recommender (kept as the A/B baseline)
router.get('/recommendations', auth, async (req, res) => {
  res.json(await recommendBooks(req.user.id));
});

router.get('/liked-by-followed', auth, async (req, res) => {
  res.json(await booksLikedByFollowed(req.user.id));
});

// ML semantic recommender (proxies to fedbook-ml FastAPI)
async function proxyML(path, req, res) {
  const url = new URL(path, ML_BASE);
  for (const [k, v] of Object.entries(req.query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  try {
    const r = await fetch(url.toString());
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    res.status(502).json({ error: 'ml-service unreachable', message: err.message });
  }
}

router.get('/recommendations/ml', auth, (req, res) =>
  proxyML('/recommend/similar', req, res)
);
router.get('/recommendations/cf', auth, (req, res) =>
  proxyML('/recommend/cf', req, res)
);
router.get('/recommendations/graph', auth, (req, res) =>
  proxyML('/recommend/graph', req, res)
);

module.exports = router;
