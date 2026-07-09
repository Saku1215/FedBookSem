"""Daily cross-platform ingestion worker.

Iterates over every :Book in the catalogue, collects mentions from each
configured platform, sentiment-scores them, aggregates counts, and MERGEs
a :PlatformReception node into Neo4j.

Raw mention text is NEVER persisted. Only aggregate counts + external IDs
(for the deletion-sweep) are written.
"""

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


def _build_collectors() -> list:
    collectors = []
    for name, cls in (
        ("REDDIT_CLIENT_ID", RedditCollector),
        ("YOUTUBE_API_KEY", YouTubeCollector),
        ("BLUESKY_APPVIEW_URL", BlueskyCollector),
        ("MASTODON_INSTANCES", MastodonCollector),
    ):
        # Bluesky/Mastodon have defaults, so always try them
        if cls in {BlueskyCollector, MastodonCollector} or name in os.environ:
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
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    neo = Neo4jClient.from_env()
    scorer = SentimentScorer()
    collectors = _build_collectors()
    if not collectors:
        log.error("No collectors configured - set at least one platform's env vars")
        return

    books = await neo.read(
        "MATCH (b:Book) WHERE b.description IS NOT NULL "
        "RETURN b.isbn AS isbn, b.title AS title, coalesce(b.author,'') AS author "
        "LIMIT 100"  # cap per run to respect rate limits; extend when comfortable
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
