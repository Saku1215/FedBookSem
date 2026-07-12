import pytest


@pytest.mark.integration
async def test_read_returns_records(neo4j_client):
    records = await neo4j_client.read("RETURN 1 AS n")
    assert records[0]["n"] == 1


@pytest.mark.integration
async def test_write_creates_and_reads_book(neo4j_client):
    await neo4j_client.write(
        "MERGE (b:Book {isbn:$isbn}) SET b.title=$t RETURN b",
        {"isbn": "TEST-CLIENT-123", "t": "Test Client Book"},
    )
    try:
        rows = await neo4j_client.read(
            "MATCH (b:Book {isbn:$isbn}) RETURN b.title AS t",
            {"isbn": "TEST-CLIENT-123"},
        )
        assert rows[0]["t"] == "Test Client Book"
    finally:
        await neo4j_client.write("MATCH (b:Book {isbn:'TEST-CLIENT-123'}) DELETE b")
