"""Mock cross-platform reception seeder — demo data ONLY.

Writes plausible :PlatformReception nodes for N books that already have
embeddings, so the frontend can render per-platform reception badges
before real Phase 4 ingestion runs.

WARNING: The counts are random. Do NOT cite these in the evaluation
chapter — they are for UI demo purposes only. Each node is tagged
`demo: true` so the eventual real-ingestion path can distinguish them.

Usage:
    docker compose exec ml-service python scripts/seed_mock_receptions.py
    docker compose exec ml-service python scripts/seed_mock_receptions.py --drop --count 50
"""

import argparse
import asyncio
import random
from datetime import datetime, timedelta, timezone

from fedbook_ml.neo4j_client import Neo4jClient

PLATFORMS = ["reddit", "youtube", "bluesky", "mastodon"]


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--drop", action="store_true", help="drop existing PlatformReception before seeding")
    ap.add_argument("--count", type=int, default=30, help="how many books to seed")
    args = ap.parse_args()

    random.seed(42)  # reproducible demo output
    now = datetime.now(timezone.utc)
    youtube_expiry = (now + timedelta(days=30)).isoformat()
    now_iso = now.isoformat()

    neo = Neo4jClient.from_env()

    if args.drop:
        result = await neo.write(
            "MATCH (r:PlatformReception) DETACH DELETE r RETURN count(*) AS n"
        )
        print(f"Dropped {result[0]['n']} existing PlatformReception nodes")

    books = await neo.read(
        "MATCH (b:Book) WHERE b.embedding IS NOT NULL "
        "RETURN b.isbn AS isbn, coalesce(b.title,'') AS title LIMIT $n",
        {"n": args.count},
    )
    if not books:
        print("No embedded books found - run build_embeddings.py first")
        await neo.close()
        return

    seeded = 0
    for book in books:
        isbn = book["isbn"]
        for platform in PLATFORMS:
            # Bias toward positive so demo data actually shifts the reception score
            # away from the neutral 0.5 baseline (which is the whole point).
            mentions = random.randint(10, 250)
            pos_share = random.uniform(0.40, 0.80)
            neg_share = random.uniform(0.05, 0.25)
            pos = int(mentions * pos_share)
            neg = int(mentions * neg_share)
            neu = max(0, mentions - pos - neg)

            ext_ids = [f"mock-{platform}-{isbn}-{i}" for i in range(min(mentions, 20))]
            expires = youtube_expiry if platform == "youtube" else None

            await neo.write(
                """
                MATCH (b:Book {isbn:$isbn})
                MERGE (b)-[:RECEPTION_ON]->(r:PlatformReception {book_isbn:$isbn, platform:$platform})
                SET r.positive = $pos,
                    r.neutral = $neu,
                    r.negative = $neg,
                    r.mentions = $mentions,
                    r.external_ids = $ext_ids,
                    r.ingested_at = $now,
                    r.expires_at = $expires,
                    r.demo = true
                """,
                {
                    "isbn": isbn, "platform": platform,
                    "pos": pos, "neu": neu, "neg": neg, "mentions": mentions,
                    "ext_ids": ext_ids, "now": now_iso, "expires": expires,
                },
            )
            seeded += 1

    print(f"Seeded {seeded} PlatformReception nodes across {len(books)} books")
    print("Demo data - not for evaluation. To remove:")
    print("    docker compose exec ml-service python scripts/seed_mock_receptions.py --drop --count 0")
    await neo.close()


if __name__ == "__main__":
    asyncio.run(main())
