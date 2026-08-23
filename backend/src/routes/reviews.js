const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../graph/neo4j');
const jwt = require('jsonwebtoken');

// --- Scope pivot (2026-08-16) ------------------------------------------
// Federation removed. Reviews are now local-only — the outbound Create
// activity has been stripped. delivery.js and getPrivateKey are still on
// disk if federation is reintroduced later.
// ------------------------------------------------------------------------

const router = express.Router();
const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3001';

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

// POST /reviews
router.post('/', auth, async (req, res) => {
  const { isbn, content, rating } = req.body;
  if (!isbn || !content) return res.status(400).json({ error: 'isbn and content required' });

  const id = uuidv4();
  const base = BASE_URL();
  const activityId = `${base}/reviews/${id}`;
  const actorId = req.user.id;

  await write(
    `MATCH (p:Person {id: $actorId}), (b:Book {isbn: $isbn})
     CREATE (r:Review {
       id: $id,
       content: $content,
       rating: $rating,
       published: datetime(),
       activityId: $activityId
     })
     CREATE (p)-[:AUTHORED]->(r)
     CREATE (r)-[:REVIEWS]->(b)`,
    { actorId, isbn, id, content, rating: rating || 0, activityId }
  );

  res.status(201).json({ id, activityId, content, rating });
});

// GET /reviews/:id
router.get('/:id', async (req, res) => {
  const records = await read(
    `MATCH (p:Person)-[:AUTHORED]->(r:Review {id: $id})-[:REVIEWS]->(b:Book)
     RETURN r, p.username AS username, p.displayName AS displayName,
            p.avatarUrl AS avatarUrl, b.isbn AS isbn, b.title AS title`,
    { id: req.params.id }
  );
  if (!records.length) return res.status(404).json({ error: 'Not found' });
  const r = records[0];
  res.json({
    ...r.get('r').properties,
    author: {
      username: r.get('username'),
      displayName: r.get('displayName'),
      avatarUrl: r.get('avatarUrl'),
    },
    book: { isbn: r.get('isbn'), title: r.get('title') },
  });
});

// POST /reviews/:id/like
router.post('/:id/like', auth, async (req, res) => {
  const actorId = req.user.id;
  await write(
    `MATCH (p:Person {id: $actorId}), (r:Review {id: $reviewId})
     MERGE (p)-[:LIKES]->(r)`,
    { actorId, reviewId: req.params.id }
  );
  res.json({ liked: true });
});

// POST /reviews/:id/announce
router.post('/:id/announce', auth, async (req, res) => {
  const actorId = req.user.id;
  await write(
    `MATCH (p:Person {id: $actorId}), (r:Review {id: $reviewId})
     MERGE (p)-[:BOOSTED]->(r)`,
    { actorId, reviewId: req.params.id }
  );
  res.json({ boosted: true });
});

// POST /reviews/:id/replies
router.post('/:id/replies', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const id = uuidv4();
  const actorId = req.user.id;
  await write(
    `MATCH (p:Person {id: $actorId}), (r:Review {id: $reviewId})
     CREATE (reply:Reply {id: $id, content: $content, published: datetime()})
     CREATE (p)-[:REPLIED]->(reply)
     CREATE (reply)-[:REPLY_TO]->(r)`,
    { actorId, reviewId: req.params.id, id, content }
  );
  res.status(201).json({ id, content });
});

// GET /reviews/:id/replies
router.get('/:id/replies', async (req, res) => {
  const records = await read(
    `MATCH (p:Person)-[:REPLIED]->(reply:Reply)-[:REPLY_TO]->(r:Review {id: $id})
     RETURN reply.id AS id, reply.content AS content, reply.published AS published,
            p.username AS username, p.displayName AS displayName, p.avatarUrl AS avatarUrl
     ORDER BY reply.published ASC`,
    { id: req.params.id }
  );
  res.json(records.map((r) => ({
    id: r.get('id'),
    content: r.get('content'),
    published: r.get('published'),
    author: {
      username: r.get('username'),
      displayName: r.get('displayName'),
      avatarUrl: r.get('avatarUrl'),
    },
  })));
});

module.exports = router;
