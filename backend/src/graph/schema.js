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
