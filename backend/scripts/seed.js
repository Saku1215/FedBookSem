require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// --- Scope pivot (2026-08-16) ------------------------------------------
// Federation removed — no RSA keypairs are generated for :Person any more.
// node-forge remains in package.json in case federation is reintroduced,
// but this seed no longer imports it. Annotations seeding was also dropped.
// New: reading-status (:Person)-[:READING {status}]->(:Book) seeds.
// ------------------------------------------------------------------------

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { write } = require('../src/graph/neo4j');

const DOMAIN = process.env.DOMAIN || 'localhost:3001';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const users = [
  { username: 'alice', displayName: 'Alice Perera', bio: 'Lover of Sinhala fiction and poetry.', password: 'alice123' },
  { username: 'bob', displayName: 'Bob Silva', bio: 'Academic reader and literary critic.', password: 'bob123' },
  { username: 'carol', displayName: 'Carol Fernando', bio: 'Educator and avid annotator.', password: 'carol123' },
];

const books = [
  { isbn: '9789556682045', title: 'Gamperaliya', author: 'Martin Wickramasinghe', year: 1944, coverUrl: 'https://upload.wikimedia.org/wikipedia/en/7/79/Gamperaliya_%28novel%29.jpg' },
  { isbn: '9789556682052', title: 'Viragaya', author: 'Martin Wickramasinghe', year: 1956, coverUrl: 'https://upload.wikimedia.org/wikipedia/en/3/3e/Viragaya_novel.jpg' },
  { isbn: '9789555232310', title: 'Madol Doova', author: 'Martin Wickramasinghe', year: 1947, coverUrl: 'https://upload.wikimedia.org/wikipedia/en/5/5c/MadolDoova.jpg' },
  { isbn: '9789553100012', title: 'Siri Parakum', author: 'Mahagama Sekera', year: 1964, coverUrl: null },
  { isbn: '9789555360180', title: 'Nidhanaya', author: 'Karunasena Jayalath', year: 1980, coverUrl: null },
  { isbn: '9789550019015', title: 'Ahasin Polowata', author: 'Ediriweera Sarachchandra', year: 1959, coverUrl: null },
];

const passages = {
  '9789556682045': 'The village of Koggala stretched along the southern coast, its coconut palms swaying in the monsoon wind. Piyal stood at the edge of the paddy field, watching the horizon where the ocean met the sky. Life here moved slowly, shaped by the rhythms of harvest and rain, by the stories of ancestors carried in the wind.',
  '9789556682052': 'Aravinda walked the long road alone, carrying nothing but the weight of his own silence. He had chosen solitude not out of despair but out of a deep understanding that some truths can only be found when the noise of the world fades away. The mountains ahead were indifferent to his suffering, and that indifference was its own kind of comfort.',
  '9789555232310': 'The small island in the lagoon was their kingdom. Upali and his friends had built a world there, hidden from the adults who lived their complicated lives on the mainland. The water around the island was shallow and warm, and every morning the birds came to the tall trees and filled the air with sound.',
  '9789553100012': 'The king looked out from the ramparts at the armies gathered below. He had ruled with wisdom for many years, but wisdom alone could not stop what was coming. The drums of war had been beating for weeks, and now the silence before battle was heavier than all the noise that had come before it.',
  '9789555360180': 'The treasure, if it existed at all, had been hidden for three generations. The old man in the village knew part of the story, but he guarded his knowledge carefully, sharing only fragments with those who came to ask. Some secrets, he believed, were safer left buried beneath the earth.',
  '9789550019015': 'The stage was empty and the lights were low. She had rehearsed this moment a hundred times, but now that it had arrived, the words she had memorised seemed to belong to someone else. The theatre held its breath. In the darkness of the wings, she found the stillness she needed, and walked out to meet the audience.',
};

async function seed() {
  console.log('Seeding Neo4j (idempotent — will not wipe existing data)...');

  // Idempotent seeder. Uses MERGE + ON CREATE SET so re-running this script:
  //   - never deletes existing nodes/relationships
  //   - never overwrites data on nodes that already exist
  //   - is safe to run alongside ML ingestion / Kaggle catalogue data
  // Reviews and annotations get a stable `seedKey` so re-runs match the same
  // node instead of creating duplicates. User-created reviews/annotations
  // from the app never have `seedKey`, so they are never touched.

  // Create or preserve users
  const userRecords = [];
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const id = `${BASE_URL}/users/${u.username}`;
    await write(
      `MERGE (p:Person {username: $username})
       ON CREATE SET
         p.id = $id,
         p.displayName = $displayName,
         p.bio = $bio,
         p.domain = $domain,
         p.passwordHash = $passwordHash,
         p.avatarUrl = null,
         p.createdAt = datetime()`,
      { id, username: u.username, displayName: u.displayName, bio: u.bio, domain: DOMAIN, passwordHash }
    );
    userRecords.push({ ...u, id });
    console.log(`Ensured user: ${u.username}`);
  }

  // Create or preserve books
  for (const b of books) {
    const id = `${BASE_URL}/books/${b.isbn}`;
    const passage = passages[b.isbn] || '';
    await write(
      `MERGE (b:Book {isbn: $isbn})
       ON CREATE SET
         b.id = $id,
         b.title = $title,
         b.author = $author,
         b.year = $year,
         b.passage = $passage,
         b.coverUrl = $coverUrl,
         b.createdAt = datetime()`,
      { id, isbn: b.isbn, title: b.title, author: b.author, year: b.year, passage, coverUrl: b.coverUrl || null }
    );
    console.log(`Ensured book: ${b.title}`);
  }

  // Create follow relationships
  const follows = [
    ['alice', 'bob'],
    ['alice', 'carol'],
    ['bob', 'carol'],
    ['carol', 'alice'],
  ];
  for (const [follower, followee] of follows) {
    await write(
      `MATCH (a:Person {username: $follower}), (b:Person {username: $followee})
       MERGE (a)-[:FOLLOWS]->(b)`,
      { follower, followee }
    );
  }
  console.log('Created follow relationships.');

  // Create sample reviews
  const reviews = [
    { author: 'alice', isbn: '9789556682045', content: 'A timeless portrait of village life in Sri Lanka. Wickramasinghe captures the soul of a changing society with beautiful prose.', rating: 5 },
    { author: 'bob', isbn: '9789556682052', content: 'Deeply philosophical. The solitude at the heart of this novel resonates with anyone who has sought meaning beyond the ordinary.', rating: 5 },
    { author: 'carol', isbn: '9789555232310', content: 'Perfect for young readers and adults alike. The island setting is magical and the friendship between the children is wonderfully drawn.', rating: 4 },
    { author: 'alice', isbn: '9789553100012', content: 'A powerful historical epic. The language is rich and the emotional weight of the story stays with you long after the last page.', rating: 5 },
    { author: 'bob', isbn: '9789555360180', content: 'An engaging mystery with a strong sense of place. The gradual unravelling of the secret keeps you reading to the end.', rating: 4 },
    { author: 'carol', isbn: '9789550019015', content: 'Sarachchandra brings theatre and life together masterfully. A landmark in Sri Lankan literature.', rating: 5 },
  ];

  for (const r of reviews) {
    const id = uuidv4();
    const seedKey = `seed:review:${r.author}:${r.isbn}`;
    await write(
      `MATCH (p:Person {username: $author}), (b:Book {isbn: $isbn})
       MERGE (r:Review {seedKey: $seedKey})
       ON CREATE SET
         r.id = $id,
         r.content = $content,
         r.rating = $rating,
         r.published = datetime(),
         r.activityId = $activityId
       MERGE (p)-[:AUTHORED]->(r)
       MERGE (r)-[:REVIEWS]->(b)`,
      {
        author: r.author,
        isbn: r.isbn,
        id,
        seedKey,
        content: r.content,
        rating: r.rating,
        activityId: `${BASE_URL}/reviews/${id}`,
      }
    );
  }
  console.log('Ensured reviews.');

  // Reading-status seeds (:Person)-[:READING {status, updatedAt}]->(:Book)
  const readingStates = [
    { username: 'alice', isbn: '9789556682045', status: 'finished' },
    { username: 'alice', isbn: '9789555232310', status: 'reading' },
    { username: 'alice', isbn: '9789553100012', status: 'want-to-read' },
    { username: 'bob',   isbn: '9789556682052', status: 'finished' },
    { username: 'bob',   isbn: '9789555360180', status: 'reading' },
    { username: 'carol', isbn: '9789555232310', status: 'finished' },
    { username: 'carol', isbn: '9789550019015', status: 'want-to-read' },
  ];

  for (const r of readingStates) {
    await write(
      `MATCH (p:Person {username: $username}), (b:Book {isbn: $isbn})
       MERGE (p)-[rel:READING]->(b)
       ON CREATE SET rel.status = $status, rel.updatedAt = datetime()
       ON MATCH  SET rel.status = coalesce(rel.status, $status)`,
      r
    );
  }
  console.log('Ensured reading statuses.');

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
