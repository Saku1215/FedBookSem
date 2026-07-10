"""Sentiment-aware re-ranking - the dissertation's novel contribution.

Two flavours:
    linear   -> final = alpha*sim + beta*reception + gamma*diversity
    learned  -> LightGBM LambdaRank scores the same feature vector

Both flavours share the same feature-attachment step so the API responses
carry sim_score / reception_score / diversity_score / final_score for
transparency in the frontend.
"""

from enum import Enum

from .reception import ReceptionScorer


class RerankStrategy(str, Enum):
    LINEAR = "linear"
    LEARNED = "learned"


async def rerank_candidates(
    candidates: list[dict],
    strategy: RerankStrategy,
    reception: ReceptionScorer,
    ltr_model=None,
    alpha: float = 0.7,
    beta: float = 0.25,
    gamma: float = 0.05,
) -> list[dict]:
    if not candidates:
        return []

    isbns = [c["isbn"] for c in candidates]
    scores = await reception.scores_for_isbns(isbns)

    for c in candidates:
        rec = scores.get(c["isbn"], {})
        c["reception_score"] = rec.get("reception_score", 0.5)
        c["diversity_score"] = rec.get("diversity_score", 0.0)
        c["mentions_by_platform"] = rec.get("mentions_by_platform", {})
        c["platform_breakdown"] = rec.get("platform_breakdown", {})

    if strategy == RerankStrategy.LEARNED and ltr_model is not None:
        learned = ltr_model.score(candidates)
        for c, s in zip(candidates, learned, strict=True):
            c["final_score"] = float(s)
    else:
        # Linear blend - also the fallback path when learned model isn't loaded
        weight_sum = alpha + beta + gamma
        if weight_sum <= 0:
            weight_sum = 1.0
        a, b, g = alpha / weight_sum, beta / weight_sum, gamma / weight_sum
        for c in candidates:
            c["final_score"] = (
                a * c["sim_score"]
                + b * c["reception_score"]
                + g * c["diversity_score"]
            )

    return sorted(candidates, key=lambda c: -c["final_score"])
