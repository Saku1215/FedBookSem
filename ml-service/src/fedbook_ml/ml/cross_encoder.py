"""BGE cross-encoder reranker (pretrained - no training in this repo).

Model: BAAI/bge-reranker-base (~278M params, MIT licence, ~500MB download).
Used to sharpen the top-N ordering after semantic vector search.
"""

from functools import lru_cache

from sentence_transformers import CrossEncoder


@lru_cache
def _get_model() -> CrossEncoder:
    return CrossEncoder("BAAI/bge-reranker-base", max_length=512)


class CrossEncoderReranker:
    def __init__(self) -> None:
        self._model = _get_model()

    def rerank(
        self, query: str, candidates: list[dict], top_k: int
    ) -> list[dict]:
        if not candidates:
            return []
        pairs = [
            (query, f"{c.get('title','')}. {c.get('description','')}")
            for c in candidates
        ]
        scores = self._model.predict(pairs, batch_size=32, show_progress_bar=False)
        for c, s in zip(candidates, scores, strict=True):
            c["ce_score"] = float(s)
        return sorted(candidates, key=lambda c: -c["ce_score"])[:top_k]
