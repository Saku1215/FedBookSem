"""Neo4j GDS graph-based recommender wrappers - k-NN and Personalized PageRank.

Requires the graph-data-science plugin to be enabled on the Neo4j container.
"""

from .neo4j_client import Neo4jClient

GRAPH_NAME = "bookGraph"


class GraphSearcher:
    def __init__(self, client: Neo4jClient) -> None:
        self._client = client

    async def knn_similar(self, isbn: str, k: int = 10) -> list[dict]:
        # Project (or reuse) the book graph with embeddings as node property
        await self._ensure_projection()
        rows = await self._client.read(
            f"""
            MATCH (seed:Book {{isbn:$isbn}})
            CALL gds.knn.stream('{GRAPH_NAME}', {{
                topK: $k,
                nodeProperties: ['embedding'],
                similarityCutoff: 0.0
            }})
            YIELD node1, node2, similarity
            WITH seed, gds.util.asNode(node1) AS n1, gds.util.asNode(node2) AS n2, similarity
            WHERE n1 = seed AND n2 <> seed
            RETURN n2.isbn AS isbn, coalesce(n2.title,'') AS title,
                   coalesce(n2.author,'') AS author, n2.thumbnail AS thumbnail,
                   similarity AS score
            ORDER BY similarity DESC
            LIMIT $k
            """,
            {"isbn": isbn, "k": k},
        )
        return rows

    async def personalised_pagerank(self, seed_isbns: list[str], k: int = 10) -> list[dict]:
        await self._ensure_projection()
        rows = await self._client.read(
            f"""
            MATCH (seed:Book) WHERE seed.isbn IN $isbns
            WITH collect(id(seed)) AS sources
            CALL gds.pageRank.stream('{GRAPH_NAME}', {{
                sourceNodes: sources,
                maxIterations: 20,
                dampingFactor: 0.85
            }})
            YIELD nodeId, score
            WITH gds.util.asNode(nodeId) AS n, score
            WHERE 'Book' IN labels(n) AND NOT n.isbn IN $isbns
            RETURN n.isbn AS isbn, coalesce(n.title,'') AS title,
                   coalesce(n.author,'') AS author, n.thumbnail AS thumbnail,
                   score
            ORDER BY score DESC
            LIMIT $k
            """,
            {"isbns": seed_isbns, "k": k},
        )
        return rows

    async def _ensure_projection(self) -> None:
        exists = await self._client.read(
            "CALL gds.graph.exists($name) YIELD exists RETURN exists",
            {"name": GRAPH_NAME},
        )
        if exists and exists[0]["exists"]:
            return

        # Discover which relationship types actually exist. GDS refuses to
        # project a declared type if no edges of that type live in the graph,
        # so we build the projection dict on the fly.
        rel_types = await self._client.read("CALL db.relationshipTypes()")
        existing = {r["relationshipType"] for r in rel_types}
        rel_projection: dict[str, dict] = {}
        for t in ("REVIEWS", "LIKES", "REVIEWED", "BOOSTED"):
            if t in existing:
                rel_projection[t] = {"orientation": "UNDIRECTED"}

        # Fall back: if none of the interaction rels exist yet, project a
        # relationship-less graph (still valid for gds.knn which uses node
        # properties only).
        if not rel_projection:
            rel_projection = {"*": {"orientation": "UNDIRECTED"}} if False else "*"

        params: dict = {
            "name": GRAPH_NAME,
            "nodes": {"Book": {"properties": ["embedding"]}},
            "rels": rel_projection,
        }
        await self._client.write(
            "CALL gds.graph.project($name, $nodes, $rels)",
            params,
        )
