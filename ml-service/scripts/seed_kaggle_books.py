"""Load the Kaggle 7k-books dataset into Neo4j :Book nodes.

Prereq: download `books.csv` from
https://www.kaggle.com/datasets/dylanjcastillo/7k-books-with-metadata
and place it at ml-service/data/kaggle_7k/books.csv

Then (from repo root):
    docker compose exec ml-service python scripts/seed_kaggle_books.py
"""

import asyncio
from pathlib import Path

import pandas as pd

from fedbook_ml.neo4j_client import Neo4jClient


CSV = Path(__file__).parent.parent / "data" / "kaggle_7k" / "books.csv"


async def main() -> None:
    if not CSV.exists():
        raise SystemExit(
            f"Kaggle 7k books.csv not found at {CSV}. "
            "Download from Kaggle and place it there."
        )

    df = pd.read_csv(CSV)
    df = df.dropna(subset=["isbn13", "title", "description"])
    df["isbn13"] = df["isbn13"].astype(str).str.replace(".0", "", regex=False)
    print(f"Loading {len(df)} books into Neo4j...")

    neo = Neo4jClient.from_env()
    try:
        for i, row in enumerate(df.itertuples(index=False), start=1):
            await neo.write(
                """
                MERGE (b:Book {isbn: $isbn})
                ON CREATE SET b.id = 'urn:isbn:' + $isbn, b.createdAt = datetime()
                SET b.title = $title,
                    b.author = $author,
                    b.year = $year,
                    b.description = $desc,
                    b.subjects = $subs,
                    b.thumbnail = $thumb,
                    b.sourceCatalog = 'kaggle-7k'
                """,
                {
                    "isbn": row.isbn13,
                    "title": row.title,
                    "author": (getattr(row, "authors", "") or ""),
                    "year": (
                        int(row.published_year)
                        if pd.notna(getattr(row, "published_year", None))
                        else None
                    ),
                    "desc": row.description,
                    "subs": [
                        c.strip()
                        for c in str(getattr(row, "categories", "") or "").split(",")
                        if c.strip()
                    ],
                    "thumb": (
                        getattr(row, "thumbnail", None)
                        if pd.notna(getattr(row, "thumbnail", None))
                        else None
                    ),
                },
            )
            if i % 500 == 0:
                print(f"  {i}/{len(df)}")
    finally:
        await neo.close()

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
