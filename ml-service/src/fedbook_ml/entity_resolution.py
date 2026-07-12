from dataclasses import dataclass

from rapidfuzz import fuzz, process

from .neo4j_client import Neo4jClient


@dataclass
class BookMatch:
    isbn: str
    title: str
    author: str
    score: float


class EntityResolver:
    def __init__(self, client: Neo4jClient):
        self._client = client
        self._catalog: list[dict] = []
        self._title_index: dict[str, dict] = {}

    async def warm_cache(self) -> None:
        self._catalog = await self._client.read(
            "MATCH (b:Book) "
            "RETURN b.isbn AS isbn, coalesce(b.title,'') AS title, "
            "coalesce(b.author,'') AS author"
        )
        for row in self._catalog:
            key = f"{row['title']} {row['author']}".lower().strip()
            if key:
                self._title_index[key] = row

    async def resolve(
        self, title: str, author: str = "", min_score: float = 82.0
    ) -> BookMatch | None:
        if not title or not self._title_index:
            return None
        query = f"{title} {author}".lower().strip()
        result = process.extractOne(
            query,
            list(self._title_index.keys()),
            scorer=fuzz.WRatio,
        )
        if not result or result[1] < min_score:
            return None
        key, score, _ = result
        row = self._title_index[key]
        return BookMatch(
            isbn=row["isbn"],
            title=row["title"],
            author=row["author"],
            score=float(score),
        )

    async def close(self) -> None:
        await self._client.close()
