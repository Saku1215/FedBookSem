import pytest

from fedbook_ml.vector_search import VectorSearcher


@pytest.mark.integration
async def test_similar_returns_topk_with_scores(neo4j_client):
    searcher = VectorSearcher(neo4j_client)
    seeds = await neo4j_client.read(
        "MATCH (b:Book) WHERE b.embedding IS NOT NULL "
        "RETURN b.isbn AS isbn LIMIT 1"
    )
    if not seeds:
        pytest.skip("no embedded books - run scripts/build_embeddings.py first")

    results = await searcher.similar_to_book(seeds[0]["isbn"], k=5, exclude_self=True)
    assert len(results) == 5
    for r in results:
        assert {"isbn", "title", "score"}.issubset(r.keys())
