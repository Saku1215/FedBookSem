import pytest

from fedbook_ml.embeddings import Embedder


@pytest.mark.slow
def test_embed_returns_384_dim_vector():
    e = Embedder()
    v = e.embed_one("A novel about a hobbit adventure.")
    assert len(v) == 384
    assert all(isinstance(x, float) for x in v)


@pytest.mark.slow
def test_embed_batch_matches_single():
    e = Embedder()
    texts = ["A war novel.", "A romance."]
    batch = e.embed_batch(texts)
    single = [e.embed_one(t) for t in texts]
    for a, b in zip(batch, single, strict=True):
        for x, y in zip(a, b, strict=True):
            assert abs(x - y) < 1e-4
