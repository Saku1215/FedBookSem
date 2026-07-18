const express = require('express');
const { read, toJson } = require('../graph/neo4j');

const router = express.Router();

router.get('/', async (_req, res) => {
  const records = await read('MATCH (b:Book) RETURN b ORDER BY b.title ASC');
  res.json(records.map((r) => toJson(r.get('b').properties)));
});

router.get('/:isbn', async (req, res) => {
  const records = await read(
    'MATCH (b:Book {isbn: $isbn}) RETURN b',
    { isbn: req.params.isbn }
  );
  if (!records.length) return res.status(404).json({ error: 'Not found' });
  res.json(toJson(records[0].get('b').properties));
});

router.get('/:isbn/reviews', async (req, res) => {
  const records = await read(
    `MATCH (p:Person)-[:AUTHORED]->(r:Review)-[:REVIEWS]->(b:Book {isbn: $isbn})
     OPTIONAL MATCH (liker:Person)-[:LIKES]->(r)
     RETURN r, p.username AS username, p.displayName AS displayName,
            p.id AS authorId, p.avatarUrl AS avatarUrl,
            count(DISTINCT liker) AS likeCount
     ORDER BY r.published DESC`,
    { isbn: req.params.isbn }
  );
  res.json(records.map((r) => ({
    ...r.get('r').properties,
    likeCount: r.get('likeCount').toNumber ? r.get('likeCount').toNumber() : r.get('likeCount'),
    author: {
      id: r.get('authorId'),
      username: r.get('username'),
      displayName: r.get('displayName'),
      avatarUrl: r.get('avatarUrl'),
    },
  })));
});

module.exports = router;
