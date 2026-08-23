const express = require('express');
const { read, toJson } = require('../graph/neo4j');
const { ratingByIsbn } = require('../services/hardcover');

const router = express.Router();

// Kaggle catalogue stores Google Books thumbnail URLs as http://books.google.com/...
// Upgrade to https on the way out so browsers with strict mixed-content or
// HSTS policies still render the image.
function upgradeCover(url) {
  if (!url) return url;
  return url.replace(/^http:\/\/books\.google\.com/, 'https://books.google.com');
}

// Reddit dropped (2026-08-16). Re-weighted across the remaining three
// platforms proportionally to the ML dashboard defaults.
const PLATFORM_WEIGHTS = { youtube: 0.40, bluesky: 0.30, mastodon: 0.30 };

// Fetch and shape :PlatformReception nodes for a single book.
// Returns null if no reception nodes exist for this ISBN. Only platforms
// present in PLATFORM_WEIGHTS are surfaced — stale rows from removed
// platforms (e.g. reddit) are ignored server-side.
async function receptionForBook(isbn) {
  const allowed = Object.keys(PLATFORM_WEIGHTS);
  const rows = await read(
    `MATCH (:Book {isbn: $isbn})-[:RECEPTION_ON]->(r:PlatformReception)
     WHERE r.platform IN $allowed
     RETURN r.platform AS platform, r.positive AS positive,
            r.neutral AS neutral, r.negative AS negative, r.mentions AS mentions`,
    { isbn, allowed }
  );
  if (!rows.length) return null;

  const platforms = rows.map((row) => {
    const positive = num(row.get('positive'));
    const neutral  = num(row.get('neutral'));
    const negative = num(row.get('negative'));
    const mentions = num(row.get('mentions'));
    const total = positive + neutral + negative;
    const positivePct = total ? positive / total : null;
    // Sentiment-to-stars: positive counts as 1.0, neutral as 0.5, negative as 0.0.
    // Scaled to a 0-5 scale so it reads next to the Hardcover ★.
    const starRating = total ? ((positive + 0.5 * neutral) / total) * 5 : null;
    return {
      platform: row.get('platform'),
      positive, neutral, negative, mentions,
      positivePct, starRating,
    };
  });

  let wsumPos = 0, wsumStars = 0, wtotal = 0;
  for (const p of platforms) {
    if (p.positivePct == null) continue;
    const w = PLATFORM_WEIGHTS[p.platform];
    wsumPos   += p.positivePct * w;
    wsumStars += p.starRating  * w;
    wtotal    += w;
  }
  const overallPositivePct = wtotal ? wsumPos / wtotal : null;
  const overallStarRating  = wtotal ? wsumStars / wtotal : null;
  const totalMentions = platforms.reduce((s, p) => s + p.mentions, 0);

  return { platforms, overallPositivePct, overallStarRating, totalMentions };
}

function num(v) {
  if (v == null) return 0;
  return v.toNumber ? v.toNumber() : v;
}

// Slim list endpoint for the Library page.
// Query params:
//   q      — case-insensitive substring on title or author (optional)
//   limit  — max rows to return (default 60, cap 200)
//   offset — pagination offset (default 0)
// Response shape: { books, total, hasMore, limit, offset }
// The response projects only fields the UI actually renders — no embedding,
// no description, no passage — so the payload stays under a few hundred KB
// even against a 6.5k catalogue.
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const whereClause = q
    ? 'WHERE toLower(b.title) CONTAINS toLower($q) OR toLower(coalesce(b.author,\'\')) CONTAINS toLower($q)'
    : '';
  const params = { q, limit, offset };

  const rows = await read(
    `MATCH (b:Book)
     ${whereClause}
     RETURN b.isbn AS isbn, b.title AS title, coalesce(b.author,'') AS author,
            b.year AS year,
            coalesce(b.coverUrl, b.thumbnail) AS coverUrl,
            coalesce(b.sourceCatalog, 'seed') AS source
     ORDER BY b.title ASC
     SKIP toInteger($offset) LIMIT toInteger($limit)`,
    params
  );
  const totalRows = await read(
    `MATCH (b:Book) ${whereClause} RETURN count(b) AS n`,
    { q }
  );
  const total = totalRows[0].get('n').toNumber
    ? totalRows[0].get('n').toNumber()
    : totalRows[0].get('n');

  const books = rows.map((r) => ({
    isbn: r.get('isbn'),
    title: r.get('title'),
    author: r.get('author'),
    year: r.get('year')?.toNumber ? r.get('year').toNumber() : r.get('year'),
    coverUrl: upgradeCover(r.get('coverUrl')),
    source: r.get('source'),
    reception: { platforms: [], overallPositivePct: null },
  }));

  // One aggregation for the whole page — attach reception summary per book.
  // Skipped when the page has no rows (empty search result).
  if (books.length) {
    const isbns = books.map((b) => b.isbn);
    const allowed = Object.keys(PLATFORM_WEIGHTS);
    const receptionRows = await read(
      `MATCH (b:Book) WHERE b.isbn IN $isbns
       OPTIONAL MATCH (b)-[:RECEPTION_ON]->(r:PlatformReception)
       WHERE r.platform IN $allowed
       WITH b.isbn AS isbn,
            collect(DISTINCT r.platform) AS platforms,
            sum(coalesce(r.positive, 0)) AS pos,
            sum(coalesce(r.positive, 0) + coalesce(r.neutral, 0) + coalesce(r.negative, 0)) AS total
       RETURN isbn,
              [p IN platforms WHERE p IS NOT NULL] AS platforms,
              CASE WHEN total > 0 THEN toFloat(pos)/total ELSE null END AS overallPositivePct`,
      { isbns, allowed }
    );
    const receptionByIsbn = {};
    for (const row of receptionRows) {
      receptionByIsbn[row.get('isbn')] = {
        platforms: row.get('platforms') || [],
        overallPositivePct: row.get('overallPositivePct'),
      };
    }
    for (const b of books) {
      if (receptionByIsbn[b.isbn]) b.reception = receptionByIsbn[b.isbn];
    }
  }

  res.json({
    books,
    total,
    hasMore: offset + books.length < total,
    limit,
    offset,
  });
});

router.get('/:isbn', async (req, res) => {
  const records = await read(
    `MATCH (b:Book {isbn: $isbn})
     RETURN b.isbn AS isbn, b.title AS title, coalesce(b.author,'') AS author,
            b.year AS year, b.description AS description, b.passage AS passage,
            coalesce(b.coverUrl, b.thumbnail) AS coverUrl,
            b.subjects AS subjects,
            coalesce(b.sourceCatalog, 'seed') AS source`,
    { isbn: req.params.isbn }
  );
  if (!records.length) return res.status(404).json({ error: 'Not found' });
  const r = records[0];
  const isbn = r.get('isbn');

  // Fetch reception (Neo4j, always) and Hardcover (external, best-effort) in parallel.
  const [reception, hardcover] = await Promise.all([
    receptionForBook(isbn),
    ratingByIsbn(isbn),
  ]);

  res.json({
    isbn,
    title: r.get('title'),
    author: r.get('author'),
    year: r.get('year')?.toNumber ? r.get('year').toNumber() : r.get('year'),
    description: r.get('description'),
    passage: r.get('passage'),
    coverUrl: upgradeCover(r.get('coverUrl')),
    subjects: r.get('subjects') || [],
    source: r.get('source'),
    reception,   // { platforms:[...], overallPositivePct, totalMentions } or null
    hardcover,   // { rating, ratingsCount, reviewsCount } or null
  });
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
