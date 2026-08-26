"""Sentence-transformer embedder wrapping all-MiniLM-L6-v2 (or configured model).

Pretrained model only - NO fine-tuning is done in this file. The model is
downloaded once (~90MB) and cached in the HuggingFace cache volume mounted
by docker-compose.
"""

from functools import lru_cache

from sentence_transformers import SentenceTransformer

from .config import get_settings


class Embedder:
    def __init__(self, model_name: str | None = None) -> None:
        name = model_name or get_settings().embedding_model
        self._model = SentenceTransformer(name)

    def embed_one(self, text: str) -> list[float]:
        vec = self._model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    def embed_batch(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        vecs = self._model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return vecs.tolist()


@lru_cache
def get_embedder() -> Embedder:
    return Embedder()
