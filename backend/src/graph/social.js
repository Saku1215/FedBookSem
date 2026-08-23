const { read, write } = require('./neo4j');

async function follow(followerId, followeeId) {
  await write(
    `MATCH (a:Person {id: $followerId}), (b:Person {id: $followeeId})
     MERGE (a)-[:FOLLOWS]->(b)`,
    { followerId, followeeId }
  );
}

async function unfollow(followerId, followeeId) {
  await write(
    `MATCH (a:Person {id: $followerId})-[r:FOLLOWS]->(b:Person {id: $followeeId})
     DELETE r`,
    { followerId, followeeId }
  );
}

async function getTimeline(userId) {
  const records = await read(
    `MATCH (me:Person {id: $userId})-[:FOLLOWS]->(other:Person)-[:AUTHORED]->(r:Review)-[:REVIEWS]->(b:Book)
     OPTIONAL MATCH (liker:Person)-[:LIKES]->(r)
     RETURN DISTINCT r, other.username AS username, other.displayName AS displayName,
            other.id AS authorId, other.avatarUrl AS avatarUrl,
            b.isbn AS isbn, b.title AS bookTitle, b.coverUrl AS bookCoverUrl,
            count(DISTINCT liker) AS likeCount
     ORDER BY r.published DESC LIMIT 50`,
    { userId }
  );
  return records.map(mapReview);
}

async function getAllReviews() {
  const records = await read(
    `MATCH (p:Person)-[:AUTHORED]->(r:Review)-[:REVIEWS]->(b:Book)
     OPTIONAL MATCH (liker:Person)-[:LIKES]->(r)
     RETURN DISTINCT r, p.username AS username, p.displayName AS displayName,
            p.id AS authorId, p.avatarUrl AS avatarUrl,
            b.isbn AS isbn, b.title AS bookTitle, b.coverUrl AS bookCoverUrl,
            count(DISTINCT liker) AS likeCount
     ORDER BY r.published DESC LIMIT 100`
  );
  return records.map(mapReview);
}

async function getAllUsers({ q = '', limit = 20, offset = 0 } = {}) {
  const whereClause = q
    ? 'WHERE toLower(p.displayName) CONTAINS toLower($q) OR toLower(p.username) CONTAINS toLower($q)'
    : '';
  const records = await read(
    `MATCH (p:Person)
     ${whereClause}
     RETURN p ORDER BY p.displayName ASC
     SKIP toInteger($offset) LIMIT toInteger($limit)`,
    { q, limit, offset }
  );
  return records.map((r) => {
    const p = r.get('p').properties;
    return { id: p.id, username: p.username, displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl };
  });
}

// Suggested people — order by follower count (desc), tie-break by displayName.
// Only tiny sample (default 8) so the People page starts with a curated feel.
async function getSuggestedUsers(limit = 8) {
  const records = await read(
    `MATCH (p:Person)
     OPTIONAL MATCH (f:Person)-[:FOLLOWS]->(p)
     WITH p, count(DISTINCT f) AS followers
     RETURN p, followers ORDER BY followers DESC, p.displayName ASC
     LIMIT toInteger($limit)`,
    { limit }
  );
  return records.map((r) => {
    const p = r.get('p').properties;
    const f = r.get('followers');
    return {
      id: p.id, username: p.username, displayName: p.displayName,
      bio: p.bio, avatarUrl: p.avatarUrl,
      followerCount: f?.toNumber ? f.toNumber() : (f || 0),
    };
  });
}

async function getFollowers(actorId) {
  const records = await read(
    `MATCH (f:Person)-[:FOLLOWS]->(p:Person {id: $actorId})
     RETURN f.id AS id, f.username AS username, f.displayName AS displayName,
            f.avatarUrl AS avatarUrl, f.domain AS domain`,
    { actorId }
  );
  return records.map((r) => ({ id: r.get('id'), username: r.get('username'), displayName: r.get('displayName'), avatarUrl: r.get('avatarUrl'), domain: r.get('domain') }));
}

async function getFollowing(actorId) {
  const records = await read(
    `MATCH (p:Person {id: $actorId})-[:FOLLOWS]->(f:Person)
     RETURN f.id AS id, f.username AS username, f.displayName AS displayName,
            f.avatarUrl AS avatarUrl, f.domain AS domain`,
    { actorId }
  );
  return records.map((r) => ({ id: r.get('id'), username: r.get('username'), displayName: r.get('displayName'), avatarUrl: r.get('avatarUrl'), domain: r.get('domain') }));
}

async function recommendBooks(userId) {
  const records = await read(
    `MATCH (me:Person {id: $userId})-[:FOLLOWS]->(friend:Person)-[:FOLLOWS]->(fof:Person)-[:AUTHORED]->(r:Review)-[:REVIEWS]->(b:Book)
     WHERE NOT (me)-[:AUTHORED]->(:Review)-[:REVIEWS]->(b)
     RETURN DISTINCT b.isbn AS isbn, b.title AS title, b.author AS author, b.year AS year, b.coverUrl AS coverUrl, count(r) AS score
     ORDER BY score DESC LIMIT 10`,
    { userId }
  );
  return records.map((r) => ({
    isbn: r.get('isbn'), title: r.get('title'), author: r.get('author'), year: r.get('year'), coverUrl: r.get('coverUrl'),
    score: r.get('score').toNumber ? r.get('score').toNumber() : r.get('score'),
  }));
}

async function booksLikedByFollowed(userId) {
  const records = await read(
    `MATCH (me:Person {id: $userId})-[:FOLLOWS]->(f:Person)-[:LIKES]->(r:Review)-[:REVIEWS]->(b:Book)
     RETURN DISTINCT b.isbn AS isbn, b.title AS title, b.author AS author, b.year AS year, b.coverUrl AS coverUrl, count(f) AS likers
     ORDER BY likers DESC LIMIT 10`,
    { userId }
  );
  return records.map((r) => ({
    isbn: r.get('isbn'), title: r.get('title'), author: r.get('author'), year: r.get('year'), coverUrl: r.get('coverUrl'),
    likers: r.get('likers').toNumber ? r.get('likers').toNumber() : r.get('likers'),
  }));
}

async function getUserByUsername(username) {
  const records = await read('MATCH (p:Person {username: $username}) RETURN p', { username });
  if (!records.length) return null;
  const p = records[0].get('p').properties;
  return { id: p.id, username: p.username, displayName: p.displayName, bio: p.bio, domain: p.domain, avatarUrl: p.avatarUrl };
}

async function updateUserProfile(username, { displayName, bio }) {
  await write(
    'MATCH (p:Person {username: $username}) SET p.displayName = $displayName, p.bio = $bio',
    { username, displayName, bio }
  );
}

async function updateUserAvatar(username, avatarUrl) {
  await write(
    'MATCH (p:Person {username: $username}) SET p.avatarUrl = $avatarUrl',
    { username, avatarUrl }
  );
}

async function getUserReviews(userId) {
  const records = await read(
    `MATCH (p:Person {id: $userId})-[:AUTHORED]->(r:Review)-[:REVIEWS]->(b:Book)
     RETURN r, p.username AS username, p.displayName AS displayName,
            p.id AS authorId, p.avatarUrl AS avatarUrl,
            b.isbn AS isbn, b.title AS bookTitle, b.coverUrl AS bookCoverUrl,
            0 AS likeCount
     ORDER BY r.published DESC`,
    { userId }
  );
  return records.map(mapReview);
}

async function getFollowCounts(actorId) {
  const records = await read(
    `MATCH (p:Person {id: $actorId})
     OPTIONAL MATCH (f:Person)-[:FOLLOWS]->(p)
     OPTIONAL MATCH (p)-[:FOLLOWS]->(g:Person)
     RETURN count(DISTINCT f) AS followers, count(DISTINCT g) AS following`,
    { actorId }
  );
  if (!records.length) return { followers: 0, following: 0 };
  const r = records[0];
  return {
    followers: r.get('followers').toNumber ? r.get('followers').toNumber() : r.get('followers'),
    following: r.get('following').toNumber ? r.get('following').toNumber() : r.get('following'),
  };
}

function mapReview(r) {
  const likeCount = r.get('likeCount');
  return {
    ...r.get('r').properties,
    likeCount: likeCount && likeCount.toNumber ? likeCount.toNumber() : (likeCount || 0),
    author: {
      id: r.get('authorId'),
      username: r.get('username'),
      displayName: r.get('displayName'),
      avatarUrl: r.get('avatarUrl'),
    },
    book: { isbn: r.get('isbn'), title: r.get('bookTitle'), coverUrl: r.get('bookCoverUrl') },
  };
}

module.exports = {
  follow, unfollow, getTimeline, getAllReviews, getAllUsers, getSuggestedUsers,
  getFollowers, getFollowing, recommendBooks, booksLikedByFollowed,
  getUserByUsername, updateUserProfile, updateUserAvatar,
  getUserReviews, getFollowCounts,
};
