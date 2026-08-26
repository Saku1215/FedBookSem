import pytest

from fedbook_ml.openlibrary import OpenLibraryClient


@pytest.mark.asyncio
async def test_fetch_work_by_isbn(httpx_mock, monkeypatch):
    monkeypatch.setenv("NEO4J_PASSWORD", "x")
    monkeypatch.setenv("OPENLIBRARY_USER_AGENT", "test-agent")
    from fedbook_ml.config import get_settings
    get_settings.cache_clear()

    httpx_mock.add_response(
        url="https://openlibrary.org/isbn/9780345339683.json",
        json={"works": [{"key": "/works/OL123W"}], "title": "The Hobbit"},
    )
    httpx_mock.add_response(
        url="https://openlibrary.org/works/OL123W.json",
        json={
            "key": "/works/OL123W",
            "title": "The Hobbit",
            "description": {
                "value": "A hobbit's unexpected journey with wizards and dragons."
            },
            "subjects": ["Fantasy", "Adventure"],
        },
    )
    async with OpenLibraryClient() as client:
        work = await client.fetch_work_by_isbn("9780345339683")
    assert work is not None
    assert work.work_id == "OL123W"
    assert "hobbit" in work.description.lower()
    assert "Fantasy" in work.subjects


@pytest.mark.asyncio
async def test_fetch_returns_none_when_isbn_missing(httpx_mock, monkeypatch):
    monkeypatch.setenv("NEO4J_PASSWORD", "x")
    monkeypatch.setenv("OPENLIBRARY_USER_AGENT", "test-agent")
    from fedbook_ml.config import get_settings
    get_settings.cache_clear()

    httpx_mock.add_response(
        url="https://openlibrary.org/isbn/0000000000000.json",
        status_code=404,
    )
    async with OpenLibraryClient() as client:
        work = await client.fetch_work_by_isbn("0000000000000")
    assert work is None
