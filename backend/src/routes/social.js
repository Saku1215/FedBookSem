const express = require('express');
const jwt = require('jsonwebtoken');
const { follow, unfollow, getAllUsers, getSuggestedUsers, getFollowers, getFollowing } = require('../graph/social');
const { read, write } = require('../graph/neo4j');

const router = express.Router();

// --- Scope pivot (2026-08-16) ------------------------------------------
// Federation removed. Follow/unfollow now write to the local graph only.
// ActivityPub delivery module still lives at ../activitypub/delivery.js
// and getPrivateKey is still available on ../graph/neo4j if the federation
// path is re-enabled later. All outbound signed activities were dropped.
// ------------------------------------------------------------------------

const READING_STATUSES = new Set(['want-to-read', 'reading', 'finished']);

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

// ------------------- User follows (local only) --------------------------

router.post('/follow', auth, async (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });
  await follow(req.user.id, targetId);
  res.json({ following: true });
});

router.post('/unfollow', auth, async (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });
  await unfollow(req.user.id, targetId);
  res.json({ following: false });
});

router.get('/users', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const users = await getAllUsers({ q, limit, offset });
  res.json({ users, limit, offset, q });
});

router.get('/suggested-users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
  const users = await getSuggestedUsers(limit);
  res.json({ users });
});

router.get('/followers', async (req, res) => {
  const { actorId } = req.query;
  if (!actorId) return res.status(400).json({ error: 'actorId required' });
  res.json(await getFollowers(actorId));
});

router.get('/following', async (req, res) => {
  const { actorId } = req.query;
  if (!actorId) return res.status(400).json({ error: 'actorId required' });
  res.json(await getFollowing(actorId));
});

// ------------------- Book reading-status (want-to-read / reading / finished) --

router.put('/reading-status', auth, async (req, res) => {
  const { isbn, status } = req.body;
  if (!isbn || !status) return res.status(400).json({ error: 'isbn and status required' });
  if (!READING_STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of ${[...READING_STATUSES].join(', ')}` });
  }
  const result = await write(
    `MATCH (p:Person {id: $actorId}), (b:Book {isbn: $isbn})
     MERGE (p)-[r:READING]->(b)
     SET r.status = $status, r.updatedAt = datetime()
     RETURN r.status AS status, r.updatedAt AS updatedAt`,
    { actorId: req.user.id, isbn, status }
  );
  if (!result.length) return res.status(404).json({ error: 'Book not found' });
  res.json({ isbn, status: result[0].get('status'), updatedAt: result[0].get('updatedAt') });
});

router.delete('/reading-status/:isbn', auth, async (req, res) => {
  await write(
    `MATCH (:Person {id: $actorId})-[r:READING]->(:Book {isbn: $isbn}) DELETE r`,
    { actorId: req.user.id, isbn: req.params.isbn }
  );
  res.json({ removed: true });
});

router.get('/reading-status/:isbn', auth, async (req, res) => {
  const result = await read(
    `MATCH (:Person {id: $actorId})-[r:READING]->(:Book {isbn: $isbn})
     RETURN r.status AS status, r.updatedAt AS updatedAt`,
    { actorId: req.user.id, isbn: req.params.isbn }
  );
  if (!result.length) return res.json({ isbn: req.params.isbn, status: null });
  res.json({
    isbn: req.params.isbn,
    status: result[0].get('status'),
    updatedAt: result[0].get('updatedAt'),
  });
});

router.get('/reading-list/:username', async (req, res) => {
  const result = await read(
    `MATCH (p:Person {username: $username})-[r:READING]->(b:Book)
     RETURN b.isbn AS isbn, b.title AS title, b.author AS author,
            b.coverUrl AS coverUrl, b.thumbnail AS thumbnail,
            r.status AS status, r.updatedAt AS updatedAt
     ORDER BY r.updatedAt DESC`,
    { username: req.params.username }
  );
  res.json(result.map((row) => ({
    isbn: row.get('isbn'),
    title: row.get('title'),
    author: row.get('author'),
    coverUrl: row.get('coverUrl') || row.get('thumbnail'),
    status: row.get('status'),
    updatedAt: row.get('updatedAt'),
  })));
});

module.exports = router;
