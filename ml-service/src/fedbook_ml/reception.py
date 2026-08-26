"""Cross-platform reception score aggregation.

Reads :PlatformReception aggregates written by the Phase 4 ingestion pipeline
and combines them into a single per-book reception score plus a Shannon-entropy
platform-diversity signal. These become features fed to Phase 5's re-ranker.
"""

import math

from .neo4j_client import Neo4jClient

# Weights favour decentralised platforms slightly (dissertation narrative)
PLATFORM_WEIGHTS: dict[str, float] = {
    "reddit": 0.35,
    "youtube": 0.25,
    "bluesky": 0.20,
    "mastodon": 0.20,
}


class ReceptionScorer:
    def __init__(self, client: Neo4jClient) -> None:
        self._client = client

    async def scores_for_isbns(self, isbns: list[str]) -> dict[str, dict]:
        """Return per-book reception aggregates.

        Structure per ISBN::

            {
                "reception_score":       float in [0, 1],
                "diversity_score":       float in [0, 1] (Shannon entropy over platforms),
                "mentions_by_platform":  {"reddit": 42, "youtube": 17, ...},
                "platform_breakdown":    {
                    "reddit":  {"positive": 30, "neutral": 8, "negative": 4,
                                "mentions": 42, "positive_pct": 0.71},
                    ...
                },
            }

        Falls back gracefully when no receptions have been ingested yet:
        every book gets reception_score=0.5 (neutral), diversity_score=0,
        empty platform maps. Keeps re-ranking testable end-to-end before
        Phase 4 ingestion lands.
        """
        if not isbns:
            return {}

        rows = await self._client.read(
            """
            MATCH (b:Book)-[:RECEPTION_ON]->(r:PlatformReception)
            WHERE b.isbn IN $isbns
            RETURN b.isbn AS isbn,
                   r.platform AS platform,
                   coalesce(r.positive,0) AS positive,
                   coalesce(r.neutral,0)  AS neutral,
                   coalesce(r.negative,0) AS negative,
                   coalesce(r.mentions,0) AS mentions
            """,
            {"isbns": isbns},
        )

        agg: dict[str, dict[str, dict]] = {i: {} for i in isbns}
        for r in rows:
            agg[r["isbn"]][r["platform"]] = r

        out: dict[str, dict] = {}
        for isbn, per_platform in agg.items():
            if not per_platform:
                out[isbn] = {
                    "reception_score": 0.5,
                    "diversity_score": 0.0,
                    "mentions_by_platform": {},
                    "platform_breakdown": {},
                }
                continue

            weighted_pos = 0.0
            weight_total = 0.0
            mention_totals: dict[str, int] = {}
            breakdown: dict[str, dict] = {}
            for platform, r in per_platform.items():
                w = PLATFORM_WEIGHTS.get(platform, 0.1)
                total = max(1, r["positive"] + r["neutral"] + r["negative"])
                pos_share = r["positive"] / total
                weighted_pos += w * pos_share
                weight_total += w
                mention_totals[platform] = r["mentions"]
                breakdown[platform] = {
                    "positive": r["positive"],
                    "neutral": r["neutral"],
                    "negative": r["negative"],
                    "mentions": r["mentions"],
                    "positive_pct": round(pos_share, 3),
                }

            reception = weighted_pos / weight_total if weight_total else 0.5
            out[isbn] = {
                "reception_score": reception,
                "diversity_score": _shannon(list(mention_totals.values())),
                "mentions_by_platform": mention_totals,
                "platform_breakdown": breakdown,
            }
        return out


def _shannon(counts: list[int]) -> float:
    counts = [c for c in counts if c > 0]
    if len(counts) <= 1:
        return 0.0
    total = sum(counts)
    entropy = -sum((c / total) * math.log2(c / total) for c in counts)
    # Normalise by log2 of number of platforms in weight table -> [0, 1]
    return min(1.0, entropy / math.log2(len(PLATFORM_WEIGHTS)))
