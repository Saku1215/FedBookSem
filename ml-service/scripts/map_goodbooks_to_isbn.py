"""Attach goodbooksBookId to :Book nodes so /recommend/cf can join predictions
back onto our catalogue.

Kaggle 7k and goodbooks-10k share ~500-2000 titles by ISBN.
"""

import asyncio
from pathlib import Path

import pandas as pd

from fedbook_ml.neo4j_client import Neo4jClient

DATA = Path(__file__).parent.parent / "data" / "goodbooks-10k" / "goodbooks-10k-master" / "books.csv"


async def main() -> None:
    if not DATA.exists():
        raise SystemExit(f"Missing {DATA}. Run download_goodbooks10k.py first.")

    df = pd.read_csv(DATA)
    df["isbn13"] = df["isbn13"].astype(str).str.replace(".0", "", regex=False)
    df["isbn10"] = df["isbn"].astype(str)  # goodbooks column is called `isbn`

    neo = Neo4jClient.from_env()
    matched = 0
    for row in df.itertuples(index=False):
        # try 13 then 10
        for isbn in (row.isbn13, row.isbn10):
            if not isbn or isbn == "nan":
                continue
            result = await neo.write(
                "MATCH (b:Book {isbn:$isbn}) "
                "SET b.goodbooksBookId = $gid "
                "RETURN b.isbn AS isbn",
                {"isbn": isbn, "gid": int(row.book_id)},
            )
            if result:
                matched += 1
                break

    print(f"Matched {matched}/{len(df)} goodbooks entries to :Book nodes")
    await neo.close()


if __name__ == "__main__":
    asyncio.run(main())
