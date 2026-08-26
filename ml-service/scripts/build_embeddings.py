"""Compute embeddings for every :Book with a description and write them back to Neo4j.

Uses the pretrained all-MiniLM-L6-v2 model - no training. Runs on CPU in a
few minutes for the Kaggle 7k catalogue.

Run:
    docker compose exec ml-service python scripts/build_embeddings.py
"""

import asyncio

from fedbook_ml.embeddings import get_embedder
from fedbook_ml.neo4j_client import Neo4jClient

BATCH = 128


async def main() -> None:
    neo = Neo4jClient.from_env()
    embedder = get_embedder()

    rows = await neo.read(
        "MATCH (b:Book) "
        "WHERE b.description IS NOT NULL AND b.embedding IS NULL "
        "RETURN b.isbn AS isbn, b.description AS d"
    )
    print(f"Embedding {len(rows)} books...")

    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        vectors = embedder.embed_batch([r["d"] for r in chunk])
        for r, v in zip(chunk, vectors, strict=True):
            await neo.write(
                "MATCH (b:Book {isbn:$isbn}) "
                "CALL db.create.setNodeVectorProperty(b, 'embedding', $v)",
                {"isbn": r["isbn"], "v": v},
            )
        print(f"  {i + len(chunk)}/{len(rows)}")

    await neo.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
