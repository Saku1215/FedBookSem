require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'fedbooksem123'
  ),
  {
    // Deliver INT and LONG as plain JS numbers instead of {low, high}
    // objects. Every existing .toNumber() call in this codebase is
    // already guarded with (v.toNumber ? v.toNumber() : v) so the
    // switch is safe. Prevents React from crashing when a property
    // like b.goodbooksBookId gets rendered directly.
    disableLosslessIntegers: true,
  }
);

async function read(query, params = {}) {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

async function write(query, params = {}) {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

async function getPrivateKey(actorId) {
  const records = await read(
    'MATCH (p:Person {id: $id}) RETURN p.privateKey AS privateKey',
    { id: actorId }
  );
  if (!records.length) return null;
  return records[0].get('privateKey');
}

// Walk an object graph and convert Neo4j-driver-specific values (DateTime,
// Date, Time, LocalDateTime, LocalDate, Duration, plus any residual Integer
// {low,high} objects) into JSON-friendly primitives. Everything else passes
// through unchanged. Prevents React from crashing when React tries to render
// an object like {year, month, day, ...} as a text child.
function toJson(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value !== 'object') return value;

  // neo4j.Integer (only reachable if disableLosslessIntegers is off)
  if (typeof value.toNumber === 'function' && 'low' in value && 'high' in value) {
    return value.toNumber();
  }
  // Any temporal type - the driver's temporal classes all expose toString()
  // that returns an ISO-8601 string.
  if (
    typeof value.toString === 'function'
    && (value.constructor?.name === 'DateTime'
      || value.constructor?.name === 'Date'
      || value.constructor?.name === 'Time'
      || value.constructor?.name === 'LocalDateTime'
      || value.constructor?.name === 'LocalDate'
      || value.constructor?.name === 'LocalTime'
      || value.constructor?.name === 'Duration')
  ) {
    return value.toString();
  }
  const out = {};
  for (const k of Object.keys(value)) {
    out[k] = toJson(value[k]);
  }
  return out;
}

module.exports = { driver, read, write, getPrivateKey, toJson };
