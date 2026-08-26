// Minimal Hardcover.app GraphQL client for live star ratings.
// Mirrors ml-service/src/fedbook_ml/ml/hardcover.py — same endpoint, same query,
// same graceful-degradation behaviour (returns null on any error).
//
// Hardcover constraints (2026): 60 req/min, 30s timeout, max depth 3, no fuzzy.
// Token can be reset without notice — we short-circuit further calls after a 401.

const axios = require('axios');

const ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const QUERY = `
  query BookByIsbn($isbn: String!) {
    editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
      book {
        rating
        ratings_count
        reviews_count
      }
    }
  }
`;

let disabled = false; // flips true on 401 so we stop hammering the API

async function ratingByIsbn(isbn) {
  const token = process.env.HARDCOVER_API_TOKEN;
  if (!token || disabled || !isbn) return null;

  try {
    const resp = await axios.post(
      ENDPOINT,
      { query: QUERY, variables: { isbn } },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
    );
    const editions = resp.data?.data?.editions || [];
    if (!editions.length || !editions[0]?.book) {
      return { isbn, rating: null, ratingsCount: null, reviewsCount: null };
    }
    const b = editions[0].book;
    return {
      isbn,
      rating: b.rating ?? null,
      ratingsCount: b.ratings_count ?? null,
      reviewsCount: b.reviews_count ?? null,
    };
  } catch (err) {
    if (err.response?.status === 401) {
      // eslint-disable-next-line no-console
      console.warn('Hardcover 401 — disabling further calls this session');
      disabled = true;
    }
    return null;
  }
}

module.exports = { ratingByIsbn };
