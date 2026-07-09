"""Unit tests for reception scoring + linear rerank (no external services)."""

from types import SimpleNamespace

import pytest

from fedbook_ml.reception import _shannon
from fedbook_ml.rerank import RerankStrategy, rerank_candidates


class _FakeReception:
    def __init__(self, scores: dict[str, dict]):
        self._scores = scores

    async def scores_for_isbns(self, isbns):
        return {i: self._scores.get(i, {}) for i in isbns}


def test_shannon_empty_zero():
    assert _shannon([]) == 0.0
    assert _shannon([0, 0, 0]) == 0.0
    assert _shannon([5]) == 0.0  # single platform => no diversity


def test_shannon_positive_for_spread():
    # Even split across 4 platforms should approach 1.0 (normalised)
    assert _shannon([1, 1, 1, 1]) > 0.9


@pytest.mark.asyncio
async def test_linear_blend_prefers_high_reception_when_beta_dominates():
    candidates = [
        {"isbn": "A", "title": "A", "score": 0.6, "sim_score": 0.6},
        {"isbn": "B", "title": "B", "score": 0.7, "sim_score": 0.7},
    ]
    fake_reception = _FakeReception({
        "A": {"reception_score": 0.95, "diversity_score": 0.5, "mentions_by_platform": {"reddit": 30}},
        "B": {"reception_score": 0.10, "diversity_score": 0.5, "mentions_by_platform": {"reddit": 5}},
    })
    ranked = await rerank_candidates(
        candidates=candidates,
        strategy=RerankStrategy.LINEAR,
        reception=fake_reception,
        alpha=0.1, beta=0.9, gamma=0.0,
    )
    # With reception weight dominating, A should now beat B
    assert ranked[0]["isbn"] == "A"
    assert ranked[0]["final_score"] > ranked[1]["final_score"]


@pytest.mark.asyncio
async def test_linear_blend_falls_back_to_neutral_reception_when_absent():
    candidates = [
        {"isbn": "X", "title": "X", "score": 0.9, "sim_score": 0.9},
        {"isbn": "Y", "title": "Y", "score": 0.4, "sim_score": 0.4},
    ]
    # No reception data at all - should preserve sim ordering
    ranked = await rerank_candidates(
        candidates=candidates,
        strategy=RerankStrategy.LINEAR,
        reception=_FakeReception({}),
        alpha=0.7, beta=0.25, gamma=0.05,
    )
    assert ranked[0]["isbn"] == "X"


@pytest.mark.asyncio
async def test_learned_falls_back_to_linear_when_no_model():
    candidates = [
        {"isbn": "A", "title": "A", "score": 0.5, "sim_score": 0.5},
    ]
    ranked = await rerank_candidates(
        candidates=candidates,
        strategy=RerankStrategy.LEARNED,
        reception=_FakeReception({}),
        ltr_model=None,  # no model loaded
    )
    assert "final_score" in ranked[0]
