require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { write } = require('./neo4j');

async function applySchema() {
  const constraints = [
    'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE',
    'CREATE CONSTRAINT person_username IF NOT EXISTS FOR (p:Person) REQUIRE p.username IS UNIQUE',
    'CREATE CONSTRAINT book_id IF NOT EXISTS FOR (b:Book) REQUIRE b.id IS UNIQUE',
    'CREATE CONSTRAINT review_id IF NOT EXISTS FOR (r:Review) REQUIRE r.id IS UNIQUE',
    'CREATE INDEX person_domain IF NOT EXISTS FOR (p:Person) ON (p.domain)',
    'CREATE INDEX book_openlibrary_id IF NOT EXISTS FOR (b:Book) ON (b.openLibraryWorkId)',
    // ML: cosine vector index on :Book(embedding) for semantic recommender (Neo4j 5.11+)
    `CREATE VECTOR INDEX bookEmbedding IF NOT EXISTS
     FOR (b:Book) ON (b.embedding)
     OPTIONS {
       indexConfig: {
         \`vector.dimensions\`: 384,
         \`vector.similarity_function\`: 'cosine'
       }
     }`,
    // ML: Phase 4 cross-platform reception aggregate
    'CREATE INDEX platform_reception_book_isbn IF NOT EXISTS FOR (r:PlatformReception) ON (r.book_isbn)',
    'CREATE INDEX platform_reception_expires IF NOT EXISTS FOR (r:PlatformReception) ON (r.expires_at)',
  ];

  for (const constraint of constraints) {
    await write(constraint);
    console.log('Applied:', constraint.split('FOR')[0].trim());
  }

  console.log('Schema applied successfully.');
  process.exit(0);
}

applySchema().catch((err) => {
  console.error('Schema error:', err);
  process.exit(1);
});
