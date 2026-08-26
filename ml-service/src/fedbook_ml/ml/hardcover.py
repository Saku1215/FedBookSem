"""Hardcover.app GraphQL client for live book ratings.

Uses the public Hardcover GraphQL API as an alternative ground-truth source
for per-book aggregate ratings, in place of the retired Goodreads API. See
`docs/API_Feasibility_Assessment.md` section 6 for the rationale.

Constraints documented by Hardcover (2026):
    - Rate limit: 60 requests / minute
    - Timeout: 30 seconds per query
    - Max query depth: 3
    - Fuzzy operators disabled (no _ilike / _regex)
    - Beta - tokens may be reset without notice; auto-expire yearly on Jan 1

Env vars:
    HARDCOVER_API_TOKEN (Bearer token)

The client fails gracefully on any error (missing token, 401, timeout,
schema drift) - callers get `None` and the recommender proceeds without
the Hardcover fields. This keeps the recommender resilient to Hardcover's
beta instability without breaking the API contract.
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger("fedbook_ml.hardcover")

ENDPOINT = "https://api.hardcover.app/v1/graphql"
RATE_LIMIT_PER_MIN = 60
MIN_INTERVAL = 60.0 / RATE_LIMIT_PER_MIN   # 1.0 s between calls


@dataclass
class HardcoverRating:
    isbn: str
    rating: float | None            # 0-5
    ratings_count: int | None
    reviews_count: int | None = None


class HardcoverClient:
    """Async Hardcover GraphQL client. Rate-limited to 60 req/min."""

    def __init__(self, token: str | None = None, timeout: float = 15.0) -> None:
        self._token = token or os.environ.get("HARDCOVER_API_TOKEN")
        self._client = httpx.AsyncClient(timeout=timeout)
        self._last_call = 0.0
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _throttle(self) -> None:
        # Serialise via the lock so concurrent callers observe MIN_INTERVAL
        async with self._lock:
            now = time.monotonic()
            wait = self._last_call + MIN_INTERVAL - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()

    async def rating_by_isbn(self, isbn: str) -> HardcoverRating | None:
        """Return per-book aggregate rating and count. `None` on any failure."""
        if not self.enabled:
            return None

        # Query editions by ISBN-13, then take the joined book's aggregate
        # fields. Depth 3 - matches Hardcover's cap.
        query = """
            query BookByIsbn($isbn: String!) {
              editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
                book {
                  rating
                  ratings_count
                  reviews_count
                }
              }
            }
        """
        await self._throttle()
        try:
            resp = await self._client.post(
                ENDPOINT,
                json={"query": query, "variables": {"isbn": isbn}},
                headers={"Authorization": f"Bearer {self._token}"},
            )
        except httpx.HTTPError as exc:
            log.warning("Hardcover request failed for %s: %s", isbn, exc)
            return None

        if resp.status_code == 401:
            log.warning("Hardcover 401 for %s - token expired or reset", isbn)
            self._token = None      # short-circuit further calls this session
            return None
        if resp.status_code != 200:
            log.warning("Hardcover %s for %s: %s", resp.status_code, isbn, resp.text[:200])
            return None

        try:
            data = resp.json()
            editions = data.get("data", {}).get("editions") or []
            if not editions or not editions[0].get("book"):
                return HardcoverRating(isbn=isbn, rating=None, ratings_count=None)
            book = editions[0]["book"]
            return HardcoverRating(
                isbn=isbn,
                rating=book.get("rating"),
                ratings_count=book.get("ratings_count"),
                reviews_count=book.get("reviews_count"),
            )
        except (ValueError, KeyError, TypeError) as exc:
            log.warning("Hardcover parse failed for %s: %s", isbn, exc)
            return None

    async def ratings_for_isbns(self, isbns: list[str]) -> dict[str, HardcoverRating]:
        """Fetch ratings for a batch of ISBNs concurrently (still rate-limited)."""
        if not self.enabled or not isbns:
            return {}
        results = await asyncio.gather(*(self.rating_by_isbn(i) for i in isbns))
        return {r.isbn: r for r in results if r is not None}
