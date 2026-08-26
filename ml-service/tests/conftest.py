import pytest


def pytest_collection_modifyitems(config, items):
    """Mark tests using integration fixtures/markers as integration-only."""
    for item in items:
        if "integration" in item.keywords:
            continue
        # Auto-mark tests that use the neo4j fixture as integration
        if any(name in item.fixturenames for name in ("neo4j_client",)):
            item.add_marker(pytest.mark.integration)


@pytest.fixture
async def neo4j_client():
    from fedbook_ml.neo4j_client import Neo4jClient

    client = Neo4jClient.from_env()
    try:
        yield client
    finally:
        await client.close()
