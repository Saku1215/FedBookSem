"""Daily cross-platform ingestion worker.

Iterates over every :Book in the catalogue, collects mentions from each
configured platform, sentiment-scores them, aggregates counts, and MERGEs
a :PlatformReception node into Neo4j.

Raw mention text is NEVER persisted. Only aggregate counts + external IDs
(for the deletion-sweep) are written.
"""

import argparse
import asyncio
import logging
import os

from fedbook_ml.ingest.base import ReceptionAggregate
from fedbook_ml.ingest.bluesky import BlueskyCollector
from fedbook_ml.ingest.mastodon import MastodonCollector
from fedbook_ml.ingest.reddit import RedditCollector
from fedbook_ml.ingest.youtube import YouTubeCollector
from fedbook_ml.neo4j_client import Neo4jClient
from fedbook_ml.sentiment import SentimentScorer

log = logging.getLogger("fedbook_ml.ingest_daily")

# Which env var must be set for each collector to be viable.
# Bluesky and Mastodon can run unauthenticated so they have no strict gate.
_COLLECTOR_REQUIREMENTS = {
    "reddit":   (RedditCollector,   "REDDIT_CLIENT_ID"),
    "youtube":  (YouTubeCollector,  "YOUTUBE_API_KEY"),
    "bluesky":  (BlueskyCollector,  None),
    "mastodon": (MastodonCollector, None),
}


def _build_collectors(allowed: set[str] | None = None) -> list:
    """Instantiate the configured collectors, filtered by `allowed` set."""
    collectors = []
    for name, (cls, required_env) in _COLLECTOR_REQUIREMENTS.items():
        if allowed is not None and name not in allowed:
            continue
        if required_env and required_env not in os.environ:
            log.info("Skip %s: %s not set", name, required_env)
            continue
        try:
            collectors.append(cls())
        except Exception as e:  # noqa: BLE001
            log.warning("Skip %s: %s", cls.__name__, e)
    return collectors


async def _persist(neo: Neo4jClient, agg: ReceptionAggregate) -> None:
    await neo.write(
        """
        MATCH (b:Book {isbn:$isbn})
        MERGE (b)-[:RECEPTION_ON]->(r:PlatformReception {platform:$platform, book_isbn:$isbn})
        SET r.positive = $pos,
            r.neutral  = $neu,
            r.negative = $neg,
            r.mentions = $mentions,
            r.external_ids = $eids,
            r.ingested_at = $ingested,
            r.expires_at = $expires
        """,
        {
            "isbn": agg.isbn,
            "platform": agg.platform,
            "pos": agg.positive,
            "neu": agg.neutral,
            "neg": agg.negative,
            "mentions": agg.mentions,
            "eids": agg.external_ids,
            "ingested": agg.ingested_at.isoformat(),
            "expires": agg.expires_at.isoformat() if agg.expires_at else None,
        },
    )


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--platforms",
        default=None,
        help="comma-separated subset: reddit,youtube,bluesky,mastodon (default: all with credentials)",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=30,
        help="how many books to ingest per run (respects rate limits; raise as you're comfortable)",
    )
    ap.add_argument(
        "--drop-mock",
        action="store_true",
        help="drop demo :PlatformReception (r.demo=true) before real ingestion so mock data doesn't co-exist with real data",
    )
    args = ap.parse_args()

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    neo = Neo4jClient.from_env()
    scorer = SentimentScorer()

    allowed = None
    if args.platforms:
        allowed = {p.strip().lower() for p in args.platforms.split(",") if p.strip()}
        unknown = allowed - _COLLECTOR_REQUIREMENTS.keys()
        if unknown:
            log.error("Unknown platform(s): %s. Valid: %s", unknown, list(_COLLECTOR_REQUIREMENTS))
            return

    collectors = _build_collectors(allowed=allowed)
    if not collectors:
        log.error("No collectors configured - set at least one platform's env vars")
        return
    log.info("Active collectors: %s", [c.platform for c in collectors])

    if args.drop_mock:
        result = await neo.write(
            "MATCH (r:PlatformReception {demo:true}) DETACH DELETE r RETURN count(*) AS n"
        )
        log.info("Dropped %s mock :PlatformReception nodes", result[0]["n"] if result else 0)

    books = await neo.read(
        "MATCH (b:Book) WHERE b.description IS NOT NULL "
        "RETURN b.isbn AS isbn, b.title AS title, coalesce(b.author,'') AS author "
        "LIMIT $limit",
        {"limit": args.limit},
    )

    for book in books:
        for coll in collectors:
            try:
                mentions = await coll.collect_for_book(book["title"], book["author"])
            except Exception as e:  # noqa: BLE001
                log.warning("collect %s for %s failed: %s", coll.platform, book["isbn"], e)
                continue
            if not mentions:
                continue

            labels_scores = scorer.batch([m.text for m in mentions])
            counts = scorer.aggregate([l for l, _ in labels_scores])
            expires = None
            if coll.platform == "youtube":
                expires = YouTubeCollector.expiry_for_now()

            agg = ReceptionAggregate(
                isbn=book["isbn"],
                platform=coll.platform,
                positive=counts["positive"],
                neutral=counts["neutral"],
                negative=counts["negative"],
                mentions=len(mentions),
                external_ids=[m.external_id for m in mentions],
                expires_at=expires,
            )
            await _persist(neo, agg)
            log.info(
                "%s %s +%d /%d -%d (mentions=%d)",
                book["isbn"], coll.platform,
                agg.positive, agg.neutral, agg.negative, agg.mentions,
            )

    await neo.close()


if __name__ == "__main__":
    asyncio.run(main())
