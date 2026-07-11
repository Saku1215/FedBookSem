"""Unit tests for the Hardcover GraphQL client.

Uses pytest-httpx to mock the API - no real network. Covers the happy
path, missing-token disabling, 401 handling, missing edition data, and
malformed responses.
"""

import pytest
from pytest_httpx import HTTPXMock

from fedbook_ml.ml.hardcover import ENDPOINT, HardcoverClient


@pytest.mark.asyncio
async def test_client_disabled_without_token(monkeypatch):
    monkeypatch.delenv("HARDCOVER_API_TOKEN", raising=False)
    client = HardcoverClient()
    assert client.enabled is False
    result = await client.rating_by_isbn("9780002005883")
    assert result is None
    await client.aclose()


@pytest.mark.asyncio
async def test_rating_by_isbn_happy_path(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=ENDPOINT,
        json={
            "data": {
                "editions": [
                    {"book": {"rating": 4.23, "ratings_count": 1857, "reviews_count": 412}},
                ],
            },
        },
    )
    client = HardcoverClient(token="test-token")
    result = await client.rating_by_isbn("9780002005883")
    assert result is not None
    assert result.isbn == "9780002005883"
    assert result.rating == 4.23
    assert result.ratings_count == 1857
    assert result.reviews_count == 412
    await client.aclose()


@pytest.mark.asyncio
async def test_401_disables_client_for_remainder_of_session(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=ENDPOINT, status_code=401, text="unauthorized")
    client = HardcoverClient(token="stale-token")
    assert client.enabled is True
    first = await client.rating_by_isbn("9780002005883")
    assert first is None
    # Second call should now short-circuit without a network request
    assert client.enabled is False
    second = await client.rating_by_isbn("9780061120084")
    assert second is None
    await client.aclose()


@pytest.mark.asyncio
async def test_missing_edition_returns_null_rating(httpx_mock: HTTPXMock):
    """Hardcover returns 200 with an empty editions list for an unknown ISBN."""
    httpx_mock.add_response(
        url=ENDPOINT,
        json={"data": {"editions": []}},
    )
    client = HardcoverClient(token="test-token")
    result = await client.rating_by_isbn("0000000000000")
    assert result is not None
    assert result.rating is None
    assert result.ratings_count is None
    await client.aclose()


@pytest.mark.asyncio
async def test_malformed_response_returns_none(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=ENDPOINT, text="not-json-at-all")
    client = HardcoverClient(token="test-token")
    result = await client.rating_by_isbn("9780002005883")
    assert result is None
    await client.aclose()


@pytest.mark.asyncio
async def test_ratings_for_isbns_batches_concurrently(httpx_mock: HTTPXMock):
    for i, isbn in enumerate(["9780002005883", "9780061120084", "9780141026282"]):
        httpx_mock.add_response(
            url=ENDPOINT,
            json={"data": {"editions": [{"book": {"rating": 3.0 + i, "ratings_count": 100 * (i + 1)}}]}},
        )
    client = HardcoverClient(token="test-token")
    results = await client.ratings_for_isbns([
        "9780002005883", "9780061120084", "9780141026282",
    ])
    assert len(results) == 3
    assert results["9780002005883"].rating == 3.0
    assert results["9780141026282"].ratings_count == 300
    await client.aclose()
