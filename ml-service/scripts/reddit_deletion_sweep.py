"""Re-check every Reddit external ID we know about; drop aggregates whose
posts have been deleted or removed since ingestion.

Runs weekly. Honours the Reddit ToS clause that requires stopping display
and use of deleted content.
"""

import asyncio
import logging
import os

from fedbook_ml.neo4j_client import Neo4jClient

log = logging.getLogger("fedbook_ml.reddit_deletion_sweep")


async def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    import praw

    reddit = praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        user_agent=os.environ.get("REDDIT_USER_AGENT", "FedBook-Sem/0.1"),
    )

    neo = Neo4jClient.from_env()
    rows = await neo.read(
        "MATCH (r:PlatformReception {platform:'reddit'}) "
        "RETURN r.book_isbn AS isbn, r.external_ids AS ids"
    )

    for row in rows:
        alive: list[str] = []
        removed = 0
        for eid in row["ids"]:
            try:
                submission = reddit.submission(id=eid)
                # PRAW lazily loads - check for [removed]/[deleted] markers
                if submission.selftext in {"[deleted]", "[removed]"} or submission.author is None:
                    removed += 1
                else:
                    alive.append(eid)
            except Exception:  # noqa: BLE001
                removed += 1
        if removed == 0:
            continue

        # Recompute aggregate counts proportionally (approximation: assume
        # deleted items were representative of the original mix)
        await neo.write(
            """
            MATCH (b:Book {isbn:$isbn})-[:RECEPTION_ON]->(r:PlatformReception {platform:'reddit'})
            WITH r, r.mentions AS old_m
            SET r.external_ids = $alive,
                r.mentions = size($alive),
                r.positive = toInteger(r.positive * size($alive) * 1.0 / CASE WHEN old_m > 0 THEN old_m ELSE 1 END),
                r.neutral  = toInteger(r.neutral  * size($alive) * 1.0 / CASE WHEN old_m > 0 THEN old_m ELSE 1 END),
                r.negative = toInteger(r.negative * size($alive) * 1.0 / CASE WHEN old_m > 0 THEN old_m ELSE 1 END)
            """,
            {"isbn": row["isbn"], "alive": alive},
        )
        log.info("%s: dropped %d deleted reddit items", row["isbn"], removed)

    await neo.close()


if __name__ == "__main__":
    asyncio.run(main())
