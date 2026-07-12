from fedbook_ml.config import get_settings


def test_settings_read_env(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "bolt://test:7687")
    monkeypatch.setenv("NEO4J_USER", "neo")
    monkeypatch.setenv("NEO4J_PASSWORD", "pw")
    monkeypatch.setenv("OPENLIBRARY_USER_AGENT", "test-agent")
    get_settings.cache_clear()
    s = get_settings()
    assert s.neo4j_uri == "bolt://test:7687"
    assert s.neo4j_user == "neo"
    assert s.neo4j_password == "pw"
    assert s.openlibrary_user_agent == "test-agent"
    assert s.embedding_model == "sentence-transformers/all-MiniLM-L6-v2"
    assert s.log_level == "INFO"


def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("NEO4J_PASSWORD", "x")
    monkeypatch.setenv("OPENLIBRARY_USER_AGENT", "x")
    get_settings.cache_clear()
    s = get_settings()
    assert s.neo4j_uri == "bolt://localhost:7687"
    assert s.neo4j_user == "neo4j"
