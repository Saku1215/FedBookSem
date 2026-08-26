"""Vector search wrapper over the Neo4j native vector index on :Book(embedding)."""

from .neo4j_client import Neo4jClient


class VectorSearcher:
    INDEX_NAME = "bookEmbedding"

    def __init__(self, client: Neo4jClient) -> None:
        self._client = client

    async def similar_to_vector(
        self, vector: list[float], k: int = 10
    ) -> list[dict]:
        return await self._client.read(
            """
            CALL db.index.vector.queryNodes($idx, $k, $v)
            YIELD node, score
            RETURN node.isbn AS isbn,
                   coalesce(node.title,'') AS title,
                   coalesce(node.author,'') AS author,
                   node.thumbnail AS thumbnail,
                   score
            """,
            {"idx": self.INDEX_NAME, "k": k, "v": vector},
        )

    async def similar_to_book(
        self, isbn: str, k: int = 10, exclude_self: bool = True
    ) -> list[dict]:
        rows = await self._client.read(
            "MATCH (b:Book {isbn:$isbn}) RETURN b.embedding AS v",
            {"isbn": isbn},
        )
        if not rows or rows[0]["v"] is None:
            return []
        fetch_k = k + (1 if exclude_self else 0)
        results = await self.similar_to_vector(rows[0]["v"], k=fetch_k)
        if exclude_self:
            results = [r for r in results if r["isbn"] != isbn][:k]
        return results
