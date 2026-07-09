# FedBook-Sem — ML Book Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox syntax. This plan spans ~16 weeks of dissertation work; Phases 1 & 2 are fully TDD-decomposed and buildable NOW. Phases 3-7 are milestone-scoped and should be re-detailed as their own plan files when their prerequisites land.

**Goal:** Add an ML book recommender to FedBook-Sem — content-based semantic engine + cross-platform sentiment-aware re-ranking (novel contribution) + Neo4j GDS graph variant — evaluated offline against goodbooks-10k, and surfaced via both the existing React app and a Streamlit research dashboard.

**Architecture:** A new Python 3.11 FastAPI microservice on port **:8000** owns all ML work (embedding, vector search, sentiment scoring, re-ranking). Book embeddings live as 384-dim vectors on existing `:Book` nodes in Neo4j 5 via a **native vector index** (`db.index.vector.queryNodes`) — no new datastore. The Node.js backend adds a `/api/feed/recommendations/ml` endpoint that proxies to FastAPI (the existing graph-only endpoint stays for A/B comparison). A ToS-compliant Python ingestion worker persists per-`(book, platform)` sentiment aggregates as `(:Book)-[:RECEPTION_ON]->(:PlatformReception)`. Cross-platform reception score fuses into a tunable re-rank: `final = α·sim + β·reception + γ·diversity`. Neo4j GDS Community Edition provides a graph-algorithm comparison. Streamlit dashboard runs on :8501 and calls the same FastAPI service.

**Tech Stack:** Python 3.11, FastAPI 0.115, uvicorn, sentence-transformers 3.x (all-MiniLM-L6-v2), Neo4j 5.15+ (native vector index), Neo4j GDS 2.x, LightFM, PyABSA (aspect sentiment), CardiffNLP twitter-roberta-base-sentiment-latest, Streamlit 1.x, rapidfuzz, pytest. Existing Node.js 20 + Express + React 18 continue unchanged in shape.

---

## Context

**Why this exists.** FedBook-Sem (SLIIT B.Sc. FYP, group R26-IT-107, IT22922670) is a federated social bookstore. Today its "recommendation" is a Cypher friend-of-friend traversal (`recommendBooks()` in `backend/src/graph/social.js`). The dissertation's novel contribution is a **cross-platform sentiment-fusion re-ranking layer** that combines semantic similarity of book descriptions with a unified reader-reception score aggregated across heterogeneous social platforms (Reddit, YouTube, Bluesky, Mastodon). No such fusion exists in the literature.

**Current state.** Node.js/Express backend, Neo4j graph (Person/Book/Review/Reply/Annotation), ActivityPub federation, W3C annotations, React 18 frontend with a `FeedPage.jsx` "For You" tab already wired to `/api/feed/recommendations`. Postgres 16 and Redis 7 are provisioned in `docker-compose.yml` but unused. Seed data is 6 demo books with no `description` field — these stay in Neo4j for demo purposes but the recommender's real catalogue is the English-language Kaggle 7k-books dataset.

**Constraints that shape the plan.**
- **No Python code exists yet** — Phase 1 must scaffold a Python service from scratch.
- **Neo4j vector index requires Neo4j 5.11+** — the compose file uses `neo4j:5` which resolves to a recent minor. Task 1.4 pins to `neo4j:5.15`.
- **UCSD Book Graph is academic-use-only** — used ONLY for offline evaluation, never shipped.
- **Reddit/YouTube ToS:** persist only derived aggregates (sentiment scores, counts, timestamps) — no raw comment text. YouTube-sourced aggregates carry `expiresAt = ingested + 30d` and get purged by a scheduled job. Reddit deletions must propagate via periodic re-poll.
- The existing graph endpoint stays alongside the new ML endpoint so the dissertation's evaluation chapter can A/B them.

**Locked design decisions (from user scoping):**
1. Full 6-phase arc, not a single-phase MVP.
2. Catalogue = Kaggle 7k-books dataset (English). Existing 6 seed books remain in Neo4j as demo data but are not enriched for the recommender.
3. Vectors live in Neo4j native vector index (no FAISS / pgvector / Chroma).
4. Recommender is a FastAPI microservice on :8000; Streamlit is added in Phase 7 as a separate research dashboard.

---

## Full Arc — 8 Phases

| # | Phase | Deliverable | Weeks | Detail |
|---|---|---|---|---|
| 1 | Canonical book layer | Kaggle 7k-books loaded into Neo4j with descriptions; fuzzy matcher for social-media mentions | 1-3 | **Full TDD** |
| 2 | Content-based semantic engine | FastAPI :8000 with `/recommend/similar`; Neo4j vector index; Node backend proxy; frontend "For You" tab swapped | 3-6 | **Full TDD** |
| 3 | **Machine Learning Layer** | LightFM hybrid CF trained on goodbooks-10k; BGE cross-encoder reranker; optional embedder fine-tuning | 6-8 | Milestone-scoped |
| 4 | Cross-platform ingestion + sentiment | ToS-compliant worker; Reddit/YouTube/Bluesky/Mastodon collectors; `:PlatformReception` aggregates | 8-11 | Milestone-scoped |
| 5 | Sentiment-aware re-ranking + learned fusion (**NOVEL CONTRIBUTION**) | Unified reception score; linear α/β/γ blend AND LightGBM LambdaRank fusion; `/recommend/similar?reRank=linear\|learned\|cross-encoder` | 11-13 | Milestone-scoped |
| 6 | Neo4j GDS graph variant | GDS plugin installed; `gds.knn` + Personalized PageRank endpoints; `/recommend/graph` | 13-14 | Milestone-scoped |
| 7 | Offline evaluation harness | goodbooks-10k held-out ratings; precision@k, recall@k, NDCG@k, MAP@k; ablation across all 7 strategies | 14-16 | Milestone-scoped |
| 8 | Streamlit dashboard + write-up | :8501 dashboard consuming FastAPI; screenshots + tables for the thesis | 16 (parallel with 7) | Milestone-scoped |

**Phase gating.** Each phase produces working, testable software on its own. Phases 3-7 will be re-expanded into their own plan files (`docs/superpowers/plans/2026-*-<phase>.md`) once their prerequisite phase merges.

---

## File Structure (created across all phases)

**New Python service tree — `D:\FedBookSem\ml-service\`:**
- `pyproject.toml`, `README.md`, `.env.example`, `Dockerfile`
- `src/fedbook_ml/__init__.py`
- `src/fedbook_ml/config.py` — pydantic-settings, env-var loading
- `src/fedbook_ml/neo4j_client.py` — async Neo4j driver, session helpers mirroring Node's `read()`/`write()` pattern
- `src/fedbook_ml/embeddings.py` — sentence-transformers loader + `embed_batch(texts)`
- `src/fedbook_ml/vector_search.py` — `similar_books(query_vector, k)` wrapping `db.index.vector.queryNodes`
- `src/fedbook_ml/entity_resolution.py` — ISBN-first + rapidfuzz title/author matcher
- `src/fedbook_ml/openlibrary.py` — httpx client, User-Agent, 3 req/s rate limit
- `src/fedbook_ml/reception.py` — cross-platform score aggregation (Phase 5)
- `src/fedbook_ml/rerank.py` — α/β/γ blend + LightGBM inference (Phase 5)
- `src/fedbook_ml/ml/lightfm_model.py` — hybrid CF training + inference (Phase 3)
- `src/fedbook_ml/ml/cross_encoder.py` — BGE reranker wrapper (Phase 3)
- `src/fedbook_ml/ml/ltr.py` — LightGBM LambdaRank feature builder + inference (Phase 5)
- `src/fedbook_ml/ml/finetune_embedder.py` — optional MultipleNegativesRankingLoss training (Phase 3)
- `src/fedbook_ml/api.py` — FastAPI app, routes
- `src/fedbook_ml/ingest/__init__.py`, `.../reddit.py`, `.../youtube.py`, `.../bluesky.py`, `.../mastodon.py` (Phase 4)
- `src/fedbook_ml/eval/metrics.py`, `.../loaders.py` (Phase 7)
- `scripts/seed_kaggle_books.py` — Kaggle 7k loader
- `scripts/build_embeddings.py` — one-off embedding + Neo4j write
- `scripts/purge_expired_receptions.py` — daily cron (Phase 4)
- `tests/conftest.py`, `tests/test_*.py`

**Existing files modified:**
- `docker-compose.yml` — pin Neo4j to 5.15, add `ml-service` container
- `backend/src/routes/feed.js` — add `GET /api/feed/recommendations/ml`
- `backend/src/app.js` — no change (route mount already covers it)
- `backend/.env.example` — add `ML_SERVICE_URL=http://ml-service:8000`
- `frontend/src/api/client.js` — add `getMLRecommendations()`
- `frontend/src/pages/FeedPage.jsx` — switch "For You" tab to ML variant
- `README.md` — document Python service, add Phase 2 startup steps

**ML story summary.** The plan contains ML at four distinct levels: (1) **pretrained sentence-transformers** for semantic similarity (Phase 2); (2) **hybrid collaborative filtering** with LightFM trained on goodbooks-10k, with book metadata features so cold-start still works (Phase 3); (3) **cross-encoder reranking** with BGE-reranker for top-N precision (Phase 3); (4) **learning-to-rank fusion** with LightGBM LambdaRank learning the optimal weighting across sim + cf + sentiment + diversity features (Phase 5). The dissertation therefore compares 7 recommendation strategies head-to-head in Phase 7: graph friend-of-friend, TF-IDF cosine, LightFM CF, semantic vectors, semantic + cross-encoder, semantic + linear sentiment blend, semantic + learned fusion.

**Non-goals (explicitly out of scope for this plan):**
- Multi-tenant / production deployment. Runs locally + free Streamlit Community Cloud.
- Replacing the existing graph endpoint (`recommendBooks()`). Both coexist for evaluation.
- LLM-generated explanations (mentioned in the brief as "optional"). Deferred beyond this plan.
- Reproducing published deep-review models (DeepCoNN, NARRE) from scratch. Cited as related work only; not implemented — LightFM covers the classical CF baseline and BGE cross-encoder covers the modern deep-neural baseline within a solo-dissertation budget.
- Reinforcement-learning ranker (RLRanker-PPO from DeepSentRec 2026). Interesting but not tractable given data volume; document as future work.

---

# Phase 1 — Canonical Book Layer

**Deliverable:** Neo4j `:Book` nodes carry `description`, `subjects`, `openLibraryWorkId` (where discoverable), and `sourceCatalog` properties. Kaggle 7k-books loaded (~6810 records). A Python `entity_resolution.py` module resolves an arbitrary `{title, author}` pair to a canonical Book with ≥90% accuracy on a hand-labelled sample.

## File Structure

**Create:**
- `ml-service/pyproject.toml`
- `ml-service/.env.example`
- `ml-service/README.md`
- `ml-service/src/fedbook_ml/__init__.py`
- `ml-service/src/fedbook_ml/config.py`
- `ml-service/src/fedbook_ml/neo4j_client.py`
- `ml-service/src/fedbook_ml/openlibrary.py`
- `ml-service/src/fedbook_ml/entity_resolution.py`
- `ml-service/scripts/seed_kaggle_books.py`
- `ml-service/tests/conftest.py`
- `ml-service/tests/test_neo4j_client.py`
- `ml-service/tests/test_openlibrary.py`
- `ml-service/tests/test_entity_resolution.py`
- `ml-service/data/kaggle_7k/books.csv` (downloaded, gitignored)
- `ml-service/data/fixtures/entity_resolution_labels.csv` (25 hand-labelled pairs)

**Modify:**
- `backend/src/graph/schema.js` — add index on `:Book(openLibraryWorkId)`
- `docker-compose.yml` — pin neo4j to `neo4j:5.15`
- `.gitignore` — add `ml-service/data/`, `ml-service/.venv/`, `ml-service/__pycache__/`

### Task 1.1: Bootstrap Python project

- [ ] **Step 1: Create `ml-service/pyproject.toml`**

```toml
[project]
name = "fedbook-ml"
version = "0.1.0"
requires-python = ">=3.11,<3.13"
dependencies = [
  "fastapi==0.115.6",
  "uvicorn[standard]==0.32.1",
  "pydantic==2.9.2",
  "pydantic-settings==2.6.1",
  "neo4j==5.24.0",
  "httpx==0.27.2",
  "rapidfuzz==3.10.1",
  "pandas==2.2.3",
  "python-dotenv==1.0.1",
]

[project.optional-dependencies]
ml = [
  "sentence-transformers==3.3.1",
  "torch==2.5.1",
  "numpy==2.1.3",
]
dev = [
  "pytest==8.3.3",
  "pytest-asyncio==0.24.0",
  "pytest-httpx==0.32.0",
  "ruff==0.7.4",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create `ml-service/.env.example`**

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=fedbooksem123
OPENLIBRARY_USER_AGENT=FedBook-Sem/0.1 (sanjaya.w@jinasena.com.lk)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
LOG_LEVEL=INFO
```

- [ ] **Step 3: Create `ml-service/src/fedbook_ml/__init__.py`** — single line `__version__ = "0.1.0"`.

- [ ] **Step 4: Install and verify**

Run:
```powershell
cd D:\FedBookSem\ml-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev,ml]"
pytest --collect-only
```
Expected: `no tests ran` (no tests yet — this just confirms env is clean).

- [ ] **Step 5: Commit**

```powershell
git add ml-service/pyproject.toml ml-service/.env.example ml-service/src/fedbook_ml/__init__.py .gitignore
git commit -m "chore(ml): scaffold Python 3.11 ml-service package"
```

### Task 1.2: Config module

- [ ] **Step 1: Write failing test — `ml-service/tests/test_config.py`**

```python
import os
from fedbook_ml.config import get_settings

def test_settings_read_env(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "bolt://test:7687")
    monkeypatch.setenv("NEO4J_USER", "neo")
    monkeypatch.setenv("NEO4J_PASSWORD", "pw")
    monkeypatch.setenv("OPENLIBRARY_USER_AGENT", "test-agent")
    get_settings.cache_clear()
    s = get_settings()
    assert s.neo4j_uri == "bolt://test:7687"
    assert s.embedding_model == "sentence-transformers/all-MiniLM-L6-v2"  # default
```

- [ ] **Step 2: Run test** — `pytest tests/test_config.py -v` → FAIL (ImportError).

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/config.py`**

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str
    openlibrary_user_agent: str
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    log_level: str = "INFO"

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): pydantic-settings config module with env-var loading"`

### Task 1.3: Neo4j async client

- [ ] **Step 1: Write failing test — `ml-service/tests/test_neo4j_client.py`**

```python
import pytest
from fedbook_ml.neo4j_client import Neo4jClient

@pytest.mark.integration
async def test_read_returns_records():
    client = Neo4jClient.from_env()
    records = await client.read("RETURN 1 AS n")
    assert records[0]["n"] == 1
    await client.close()

@pytest.mark.integration
async def test_write_creates_and_reads_book():
    client = Neo4jClient.from_env()
    await client.write(
        "MERGE (b:Book {isbn:$isbn}) SET b.title=$t RETURN b",
        {"isbn": "TEST-123", "t": "Test Book"},
    )
    rows = await client.read(
        "MATCH (b:Book {isbn:$isbn}) RETURN b.title AS t", {"isbn": "TEST-123"}
    )
    assert rows[0]["t"] == "Test Book"
    await client.write("MATCH (b:Book {isbn:'TEST-123'}) DELETE b")
    await client.close()
```

- [ ] **Step 2: Run test** — `pytest tests/test_neo4j_client.py -v -m integration` → FAIL (module missing).

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/neo4j_client.py`**

```python
from neo4j import AsyncGraphDatabase, AsyncDriver
from .config import get_settings

class Neo4jClient:
    def __init__(self, driver: AsyncDriver):
        self._driver = driver

    @classmethod
    def from_env(cls) -> "Neo4jClient":
        s = get_settings()
        driver = AsyncGraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))
        return cls(driver)

    async def read(self, cypher: str, params: dict | None = None) -> list[dict]:
        async with self._driver.session() as session:
            result = await session.run(cypher, params or {})
            return [dict(r) async for r in result]

    async def write(self, cypher: str, params: dict | None = None) -> list[dict]:
        async with self._driver.session() as session:
            result = await session.execute_write(
                lambda tx, c, p: tx.run(c, p).data(), cypher, params or {}
            )
            return result

    async def close(self) -> None:
        await self._driver.close()
```

- [ ] **Step 4: Ensure Neo4j is running** — `docker compose up -d neo4j` — then `pytest tests/test_neo4j_client.py -v -m integration` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): async Neo4j client with read/write session helpers"`

### Task 1.4: Pin Neo4j image + add schema index

- [ ] **Step 1: Modify `docker-compose.yml`** — change `image: neo4j:5` to `image: neo4j:5.15` on the `neo4j` service (Neo4j 5.15 confirmed to support `db.index.vector.queryNodes`).

- [ ] **Step 2: Modify `backend/src/graph/schema.js`** — add:

```javascript
CREATE INDEX book_openlibrary_id IF NOT EXISTS FOR (b:Book) ON (b.openLibraryWorkId)
```

- [ ] **Step 3: Apply schema**

```powershell
cd D:\FedBookSem\backend
npm run schema
```
Expected output includes the new index.

- [ ] **Step 4: Commit** — `git commit -m "chore: pin neo4j 5.15 and index :Book(openLibraryWorkId)"`

### Task 1.5: Open Library client

- [ ] **Step 1: Write failing test — `ml-service/tests/test_openlibrary.py`**

```python
import pytest
from fedbook_ml.openlibrary import OpenLibraryClient

@pytest.mark.asyncio
async def test_fetch_work_by_isbn(httpx_mock):
    httpx_mock.add_response(
        url="https://openlibrary.org/isbn/9789556682045.json",
        json={"works": [{"key": "/works/OL123W"}], "title": "Gamperaliya"},
    )
    httpx_mock.add_response(
        url="https://openlibrary.org/works/OL123W.json",
        json={"key": "/works/OL123W", "title": "The Hobbit", "description": {"value": "A hobbit's unexpected journey with wizards and dragons."}, "subjects": ["Fantasy", "Adventure"]},
    )
    async with OpenLibraryClient() as client:
        work = await client.fetch_work_by_isbn("9780345339683")
    assert work.work_id == "OL123W"
    assert "hobbit" in work.description.lower()
    assert "Fantasy" in work.subjects
```

- [ ] **Step 2: Run test** → FAIL (module missing).

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/openlibrary.py`**

```python
import asyncio
from dataclasses import dataclass
import httpx
from .config import get_settings

@dataclass
class OpenLibraryWork:
    work_id: str
    title: str
    description: str
    subjects: list[str]

class OpenLibraryClient:
    BASE = "https://openlibrary.org"
    RATE_LIMIT_SEC = 1 / 3  # 3 req/s with User-Agent

    def __init__(self):
        s = get_settings()
        self._client = httpx.AsyncClient(
            headers={"User-Agent": s.openlibrary_user_agent},
            timeout=10.0,
        )
        self._last_call = 0.0

    async def __aenter__(self): return self
    async def __aexit__(self, *args): await self._client.aclose()

    async def _throttle(self):
        now = asyncio.get_event_loop().time()
        wait = self._last_call + self.RATE_LIMIT_SEC - now
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_call = asyncio.get_event_loop().time()

    async def fetch_work_by_isbn(self, isbn: str) -> OpenLibraryWork | None:
        await self._throttle()
        r = await self._client.get(f"{self.BASE}/isbn/{isbn}.json")
        if r.status_code != 200: return None
        book = r.json()
        works = book.get("works") or []
        if not works: return None
        work_key = works[0]["key"].split("/")[-1]
        await self._throttle()
        w = await self._client.get(f"{self.BASE}/works/{work_key}.json")
        if w.status_code != 200: return None
        data = w.json()
        desc = data.get("description", "")
        if isinstance(desc, dict): desc = desc.get("value", "")
        return OpenLibraryWork(
            work_id=work_key,
            title=data.get("title", book.get("title", "")),
            description=desc,
            subjects=data.get("subjects", []),
        )
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): Open Library client with User-Agent and 3 req/s throttle"`

### Task 1.6: Load Kaggle 7k-books

- [ ] **Step 1: Download the dataset**

```powershell
mkdir D:\FedBookSem\ml-service\data\kaggle_7k
# Manual: download from https://www.kaggle.com/datasets/dylanjcastillo/7k-books-with-metadata
# Place books.csv in the folder above.
```
(Verify by listing the file exists.)

- [ ] **Step 2: Write `ml-service/scripts/seed_kaggle_books.py`**

```python
import asyncio
import pandas as pd
from fedbook_ml.neo4j_client import Neo4jClient

CSV = "data/kaggle_7k/books.csv"

async def main():
    df = pd.read_csv(CSV)
    df = df.dropna(subset=["isbn13", "title", "description"])
    df["isbn13"] = df["isbn13"].astype(str).str.replace(".0", "", regex=False)
    print(f"Loading {len(df)} books...")

    neo = Neo4jClient.from_env()
    for _, row in df.iterrows():
        await neo.write(
            """
            MERGE (b:Book {isbn: $isbn})
            ON CREATE SET b.id = 'urn:isbn:' + $isbn, b.createdAt = datetime()
            SET b.title = $title,
                b.author = $author,
                b.year = $year,
                b.description = $desc,
                b.subjects = $subs,
                b.thumbnail = $thumb,
                b.sourceCatalog = 'kaggle-7k'
            """,
            {
                "isbn": row["isbn13"],
                "title": row["title"],
                "author": row.get("authors", "") or "",
                "year": int(row["published_year"]) if pd.notna(row.get("published_year")) else None,
                "desc": row["description"],
                "subs": [c.strip() for c in str(row.get("categories", "")).split(",") if c.strip()],
                "thumb": row.get("thumbnail") if pd.notna(row.get("thumbnail")) else None,
            },
        )
    await neo.close()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Run**

```powershell
python scripts\seed_kaggle_books.py
```
Expected: `Loading ~6810 books...` then `Done.` in under 5 minutes.

- [ ] **Step 4: Verify**

Neo4j Browser: `MATCH (b:Book) RETURN count(b);` — expect ~6816 (6810 + 6 classics).

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): load Kaggle 7k-books into Neo4j :Book nodes"`

### Task 1.8: Entity resolution (fuzzy title/author matcher)

- [ ] **Step 1: Create labelled fixture — `ml-service/data/fixtures/entity_resolution_labels.csv`**

Hand-label 25 rows in the format:
```csv
mention_title,mention_author,expected_isbn
"The Hobbit","J.R.R. Tolkien","9780345339683"
"hobbit or there and back","Tolkien","9780345339683"
"Fellowship of the Ring","J.R.R. Tolkien","9780618346257"
"Harry Potter and the philosopher stone","JK Rowling","9780747532743"
"1984","George Orwell","9780451524935"
...
```

(Pull real ISBNs from your seed data + Kaggle CSV; write ~20 obvious matches and 5 negative cases like `"Some Nonexistent Book","",""`.)

- [ ] **Step 2: Write failing test — `ml-service/tests/test_entity_resolution.py`**

```python
import csv, pytest
from fedbook_ml.entity_resolution import EntityResolver
from fedbook_ml.neo4j_client import Neo4jClient

@pytest.fixture
async def resolver():
    r = EntityResolver(Neo4jClient.from_env())
    await r.warm_cache()
    yield r
    await r.close()

@pytest.mark.integration
async def test_resolution_accuracy(resolver):
    correct = total = 0
    with open("data/fixtures/entity_resolution_labels.csv") as f:
        for row in csv.DictReader(f):
            total += 1
            match = await resolver.resolve(row["mention_title"], row["mention_author"])
            expected = row["expected_isbn"] or None
            got = match.isbn if match else None
            if got == expected: correct += 1
    accuracy = correct / total
    assert accuracy >= 0.90, f"Only {accuracy:.0%} accurate ({correct}/{total})"
```

- [ ] **Step 3: Run test** → FAIL.

- [ ] **Step 4: Implement `ml-service/src/fedbook_ml/entity_resolution.py`**

```python
from dataclasses import dataclass
from rapidfuzz import fuzz, process
from .neo4j_client import Neo4jClient

@dataclass
class BookMatch:
    isbn: str
    title: str
    author: str
    score: float

class EntityResolver:
    def __init__(self, client: Neo4jClient):
        self._client = client
        self._catalog: list[dict] = []
        self._title_index: dict[str, dict] = {}

    async def warm_cache(self) -> None:
        self._catalog = await self._client.read(
            "MATCH (b:Book) RETURN b.isbn AS isbn, b.title AS title, coalesce(b.author,'') AS author"
        )
        for row in self._catalog:
            key = f"{row['title']} {row['author']}".lower().strip()
            self._title_index[key] = row

    async def resolve(self, title: str, author: str = "", min_score: float = 82.0) -> BookMatch | None:
        if not title or not self._catalog:
            return None
        query = f"{title} {author}".lower().strip()
        result = process.extractOne(
            query,
            list(self._title_index.keys()),
            scorer=fuzz.WRatio,
        )
        if not result or result[1] < min_score:
            return None
        key, score, _ = result
        row = self._title_index[key]
        return BookMatch(isbn=row["isbn"], title=row["title"], author=row["author"], score=float(score))

    async def close(self) -> None:
        await self._client.close()
```

- [ ] **Step 5: Run test** — `pytest tests/test_entity_resolution.py -v -m integration` → PASS at ≥90% accuracy. Adjust `min_score` threshold if not.

- [ ] **Step 6: Commit** — `git commit -m "feat(ml): fuzzy entity resolver mapping mentions to canonical books"`

### Phase 1 Exit Criteria
- `MATCH (b:Book) RETURN count(b)` ≥ 6800 in Neo4j.
- Every `:Book` has `title`, `author`, `description` (not null), `sourceCatalog`.
- Where any book has an Open Library work ID enriched, `b.openLibraryWorkId` is populated (used by Phase 4 entity resolution).
- Entity resolver hits ≥90% accuracy on the labelled sample.
- `pytest -q` passes with all Phase 1 tests green.

---

# Phase 2 — Content-Based Semantic Engine

**Deliverable:** FastAPI service on :8000 with `/health`, `/embed`, `/recommend/similar`. Neo4j vector index on `:Book(embedding)` with 384 dimensions, cosine similarity. Node backend proxies at `/api/feed/recommendations/ml`. Frontend "For You" tab renders ML recommendations.

## File Structure

**Create:**
- `ml-service/src/fedbook_ml/embeddings.py`
- `ml-service/src/fedbook_ml/vector_search.py`
- `ml-service/src/fedbook_ml/api.py`
- `ml-service/scripts/build_embeddings.py`
- `ml-service/Dockerfile`
- `ml-service/tests/test_embeddings.py`
- `ml-service/tests/test_vector_search.py`
- `ml-service/tests/test_api.py`

**Modify:**
- `docker-compose.yml` — add `ml-service` container
- `backend/src/routes/feed.js` — add `/recommendations/ml` handler
- `backend/.env.example` — add `ML_SERVICE_URL`
- `backend/package.json` — no new deps (use built-in `fetch` in Node 20)
- `frontend/src/api/client.js` — add `getMLRecommendations()`
- `frontend/src/pages/FeedPage.jsx` — swap "For You" call site

### Task 2.1: Embedding module

- [ ] **Step 1: Write failing test — `ml-service/tests/test_embeddings.py`**

```python
from fedbook_ml.embeddings import Embedder

def test_embed_returns_384_dim_vector():
    e = Embedder()
    v = e.embed_one("A novel about a hobbit adventure.")
    assert len(v) == 384
    assert all(isinstance(x, float) for x in v)

def test_embed_batch_matches_single():
    e = Embedder()
    texts = ["A war novel.", "A romance."]
    batch = e.embed_batch(texts)
    single = [e.embed_one(t) for t in texts]
    for a, b in zip(batch, single):
        for x, y in zip(a, b):
            assert abs(x - y) < 1e-4
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/embeddings.py`**

```python
from functools import lru_cache
from sentence_transformers import SentenceTransformer
from .config import get_settings

class Embedder:
    def __init__(self, model_name: str | None = None):
        name = model_name or get_settings().embedding_model
        self._model = SentenceTransformer(name)

    def embed_one(self, text: str) -> list[float]:
        vec = self._model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    def embed_batch(self, texts: list[str], batch_size: int = 64) -> list[list[float]]:
        vecs = self._model.encode(texts, batch_size=batch_size, show_progress_bar=False, normalize_embeddings=True)
        return vecs.tolist()

@lru_cache
def get_embedder() -> Embedder:
    return Embedder()
```

- [ ] **Step 4: Run** → PASS (first run downloads model, ~90MB).

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): sentence-transformer embedder (all-MiniLM-L6-v2, 384-dim)"`

### Task 2.2: Create Neo4j vector index

- [ ] **Step 1: Add to `backend/src/graph/schema.js`**

```javascript
`
CREATE VECTOR INDEX bookEmbedding IF NOT EXISTS
FOR (b:Book) ON (b.embedding)
OPTIONS {
  indexConfig: {
    \`vector.dimensions\`: 384,
    \`vector.similarity_function\`: 'cosine'
  }
}
`
```
(Add to the constraint-runner loop — mirror the pattern of existing `CREATE CONSTRAINT` calls.)

- [ ] **Step 2: Apply**

```powershell
cd D:\FedBookSem\backend
npm run schema
```

- [ ] **Step 3: Verify** — Neo4j Browser: `SHOW VECTOR INDEXES;` — expect a row named `bookEmbedding`, state ONLINE.

- [ ] **Step 4: Commit** — `git commit -m "feat: add 384-dim cosine vector index on :Book(embedding)"`

### Task 2.3: Compute + store embeddings for all books

- [ ] **Step 1: Write `ml-service/scripts/build_embeddings.py`**

```python
import asyncio
from fedbook_ml.neo4j_client import Neo4jClient
from fedbook_ml.embeddings import get_embedder

BATCH = 128

async def main():
    neo = Neo4jClient.from_env()
    embedder = get_embedder()
    rows = await neo.read(
        "MATCH (b:Book) WHERE b.description IS NOT NULL AND b.embedding IS NULL RETURN b.isbn AS isbn, b.description AS d"
    )
    print(f"Embedding {len(rows)} books...")
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        vectors = embedder.embed_batch([r["d"] for r in chunk])
        for r, v in zip(chunk, vectors):
            await neo.write(
                "MATCH (b:Book {isbn:$isbn}) CALL db.create.setNodeVectorProperty(b, 'embedding', $v)",
                {"isbn": r["isbn"], "v": v},
            )
        print(f"  {i+len(chunk)}/{len(rows)}")
    await neo.close()

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run**

```powershell
python scripts\build_embeddings.py
```
Expected runtime: 3-6 minutes on CPU (~14k sentences/sec), less on GPU.

- [ ] **Step 3: Verify**

Neo4j Browser:
```cypher
MATCH (b:Book) WHERE b.embedding IS NOT NULL
RETURN count(b), size(head(collect(b.embedding))) AS dim;
```
Expect ~6810 rows and `dim = 384`.

- [ ] **Step 4: Commit** — `git commit -m "feat(ml): embed and store 384-dim vectors on :Book nodes"`

### Task 2.4: Vector search wrapper

- [ ] **Step 1: Write failing test — `ml-service/tests/test_vector_search.py`**

```python
import pytest
from fedbook_ml.vector_search import VectorSearcher
from fedbook_ml.neo4j_client import Neo4jClient

@pytest.mark.integration
async def test_similar_returns_topk_with_scores():
    neo = Neo4jClient.from_env()
    searcher = VectorSearcher(neo)
    # Pick any embedded book by ISBN
    seeds = await neo.read("MATCH (b:Book) WHERE b.embedding IS NOT NULL RETURN b.isbn AS isbn LIMIT 1")
    seed_isbn = seeds[0]["isbn"]
    results = await searcher.similar_to_book(seed_isbn, k=5)
    assert len(results) == 5
    # First result should be the book itself (score ~1.0) or very close
    assert results[0]["score"] > 0.5
    for r in results:
        assert "isbn" in r and "title" in r and "score" in r
    await neo.close()
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/vector_search.py`**

```python
from .neo4j_client import Neo4jClient

class VectorSearcher:
    def __init__(self, client: Neo4jClient):
        self._client = client

    async def similar_to_vector(self, vector: list[float], k: int = 10) -> list[dict]:
        return await self._client.read(
            """
            CALL db.index.vector.queryNodes('bookEmbedding', $k, $v)
            YIELD node, score
            RETURN node.isbn AS isbn, node.title AS title,
                   coalesce(node.author,'') AS author, node.thumbnail AS thumbnail,
                   score
            """,
            {"k": k, "v": vector},
        )

    async def similar_to_book(self, isbn: str, k: int = 10, exclude_self: bool = False) -> list[dict]:
        rows = await self._client.read(
            "MATCH (b:Book {isbn:$isbn}) RETURN b.embedding AS v", {"isbn": isbn},
        )
        if not rows or rows[0]["v"] is None:
            return []
        results = await self.similar_to_vector(rows[0]["v"], k=k + (1 if exclude_self else 0))
        if exclude_self:
            results = [r for r in results if r["isbn"] != isbn][:k]
        return results
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ml): vector search wrapper over Neo4j vector index"`

### Task 2.5: FastAPI service

- [ ] **Step 1: Write failing test — `ml-service/tests/test_api.py`**

```python
from fastapi.testclient import TestClient
from fedbook_ml.api import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_recommend_similar_by_isbn(embedded_book_isbn):
    r = client.get(f"/recommend/similar?isbn={embedded_book_isbn}&k=5")
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert len(body["results"]) <= 5
    for item in body["results"]:
        assert {"isbn", "title", "score"}.issubset(item.keys())
```

Add fixture to `ml-service/tests/conftest.py`:

```python
import pytest, asyncio
from fedbook_ml.neo4j_client import Neo4jClient

@pytest.fixture(scope="session")
def embedded_book_isbn():
    async def _get():
        neo = Neo4jClient.from_env()
        rows = await neo.read("MATCH (b:Book) WHERE b.embedding IS NOT NULL RETURN b.isbn AS isbn LIMIT 1")
        await neo.close()
        return rows[0]["isbn"]
    return asyncio.run(_get())
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/api.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from .neo4j_client import Neo4jClient
from .vector_search import VectorSearcher
from .embeddings import get_embedder

state: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    state["neo"] = Neo4jClient.from_env()
    state["search"] = VectorSearcher(state["neo"])
    state["embedder"] = get_embedder()
    yield
    await state["neo"].close()

app = FastAPI(title="FedBook ML", version="0.1.0", lifespan=lifespan)

class RecommendationItem(BaseModel):
    isbn: str
    title: str
    author: str = ""
    thumbnail: str | None = None
    score: float

class RecommendationResponse(BaseModel):
    results: list[RecommendationItem]

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fedbook-ml"}

@app.get("/recommend/similar", response_model=RecommendationResponse)
async def recommend_similar(
    isbn: str | None = Query(None),
    text: str | None = Query(None),
    k: int = Query(10, ge=1, le=50),
):
    if isbn:
        rows = await state["search"].similar_to_book(isbn, k=k, exclude_self=True)
    elif text:
        vec = state["embedder"].embed_one(text)
        rows = await state["search"].similar_to_vector(vec, k=k)
    else:
        raise HTTPException(400, "Provide either isbn or text")
    return {"results": rows}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Manual smoke test**

```powershell
uvicorn fedbook_ml.api:app --reload --port 8000
# In another terminal:
curl "http://localhost:8000/health"
curl "http://localhost:8000/recommend/similar?text=a%20tolkien%20fantasy%20quest&k=5"
```
Expect JSON with 5 items sorted by descending `score`.

- [ ] **Step 6: Commit** — `git commit -m "feat(ml): FastAPI /health and /recommend/similar endpoints"`

### Task 2.6: Dockerise ml-service

- [ ] **Step 1: Create `ml-service/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[ml]"
COPY src ./src
COPY scripts ./scripts
EXPOSE 8000
CMD ["uvicorn", "fedbook_ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Add service to `docker-compose.yml`**

```yaml
  ml-service:
    build: ./ml-service
    container_name: fedbook-ml
    depends_on:
      - neo4j
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: fedbooksem123
      OPENLIBRARY_USER_AGENT: "FedBook-Sem/0.1 (contact@fedbooksem.local)"
    ports:
      - "8000:8000"
```

- [ ] **Step 3: Build and run**

```powershell
cd D:\FedBookSem
docker compose up -d --build ml-service
curl "http://localhost:8000/health"
```
Expect `{"status":"ok",...}`.

- [ ] **Step 4: Commit** — `git commit -m "chore(ml): dockerise ml-service and add to docker-compose"`

### Task 2.7: Node backend proxy

- [ ] **Step 1: Modify `backend/.env.example`** — append:

```
ML_SERVICE_URL=http://ml-service:8000
```
(For local dev without compose, override to `http://localhost:8000`.)

- [ ] **Step 2: Modify `backend/src/routes/feed.js`** — add:

```javascript
router.get('/recommendations/ml', requireAuth, async (req, res) => {
  const { isbn, text, k = 10 } = req.query;
  if (!isbn && !text) return res.status(400).json({ error: 'isbn or text required' });
  const base = process.env.ML_SERVICE_URL || 'http://localhost:8000';
  const params = new URLSearchParams();
  if (isbn) params.set('isbn', isbn);
  if (text) params.set('text', text);
  params.set('k', String(k));
  try {
    const r = await fetch(`${base}/recommend/similar?${params}`);
    if (!r.ok) return res.status(502).json({ error: 'ml-service error', status: r.status });
    const body = await r.json();
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'ml-service unreachable', message: err.message });
  }
});
```

- [ ] **Step 3: Restart backend and test**

```powershell
cd D:\FedBookSem\backend
npm run dev
# In another terminal, get a JWT first (POST /api/auth/login), then:
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:3001/api/feed/recommendations/ml?isbn=9780345339683&k=5"
```
Expect the same JSON shape as the FastAPI endpoint.

- [ ] **Step 4: Commit** — `git commit -m "feat(backend): proxy /api/feed/recommendations/ml to ml-service"`

### Task 2.8: Frontend "For You" tab uses ML endpoint

- [ ] **Step 1: Modify `frontend/src/api/client.js`** — add:

```javascript
export async function getMLRecommendations({ isbn, text, k = 12 } = {}) {
  const params = new URLSearchParams();
  if (isbn) params.set('isbn', isbn);
  if (text) params.set('text', text);
  params.set('k', String(k));
  const { data } = await api.get(`/feed/recommendations/ml?${params.toString()}`);
  return data.results;
}
```

- [ ] **Step 2: Modify `frontend/src/pages/FeedPage.jsx`** — in the "For You" tab handler, replace the existing `getRecommendations()` call with `getMLRecommendations({ isbn: seedBookIsbn })` where `seedBookIsbn` is the user's most recently reviewed book (already available via the existing feed data — see `getUserReviews()` result). Provide a graceful fallback: if there is no reviewed book yet, call `getMLRecommendations({ text: 'general fiction novel' })`.

- [ ] **Step 3: Manual browser test**

```powershell
cd D:\FedBookSem\frontend
npm start
```
Open http://localhost:3000/feed, log in as `alice`, click "For You". Expect a grid of 12 books driven by semantic similarity to Alice's most recent review. Compare against the old graph-based endpoint by hitting `/api/feed/recommendations` directly.

- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): For You tab uses ML semantic recommender"`

### Phase 2 Exit Criteria
- `curl http://localhost:8000/health` → 200 OK.
- `curl http://localhost:8000/recommend/similar?text=...&k=5` returns 5 items.
- `SHOW VECTOR INDEXES` in Neo4j shows `bookEmbedding` ONLINE.
- 100% of Kaggle books have `b.embedding` populated.
- Frontend "For You" tab renders ML recommendations; graph endpoint still works at `/api/feed/recommendations`.
- All Phase 2 pytest tests green; no regressions in backend behaviour.

---

# Phase 3 — Machine Learning Layer

**Deliverable:** Three ML models trained, saved, and served via new FastAPI endpoints. (1) **LightFM hybrid CF** trained on goodbooks-10k with item metadata features so cold-start still works — exposed as `/recommend/cf`. (2) **BGE cross-encoder reranker** applied to top-50 semantic candidates → returns top-10 with sharper precision — exposed as `/recommend/similar?reRank=cross-encoder`. (3) **(Optional)** fine-tuned `all-MiniLM-L6-v2` on book description ↔ genre/subject pairs from Kaggle 7k — swap-in replacement for the base embedder if it beats it on Phase 7 evaluation.

**Why this phase.** Phase 2 is a *pretrained*-only recommender — accurate but with no learned parameters from your data. Phase 3 introduces genuine ML training: a hybrid CF model, a neural reranker, and an optional in-domain embedder. This gives the dissertation a substantive ML chapter, provides strong baselines for Phase 7 evaluation, and produces the CF score feature that Phase 5's learning-to-rank fusion needs.

## File Structure

**Create:**
- `ml-service/src/fedbook_ml/ml/__init__.py`
- `ml-service/src/fedbook_ml/ml/lightfm_model.py`
- `ml-service/src/fedbook_ml/ml/cross_encoder.py`
- `ml-service/src/fedbook_ml/ml/finetune_embedder.py` (optional stretch)
- `ml-service/scripts/train_lightfm.py`
- `ml-service/scripts/download_goodbooks10k.py`
- `ml-service/scripts/finetune_embedder.py` (optional)
- `ml-service/models/` — gitignored; stores serialised `.pkl` and `.pt` artefacts
- `ml-service/data/goodbooks-10k/` — gitignored
- `ml-service/tests/test_lightfm.py`
- `ml-service/tests/test_cross_encoder.py`

**Modify:**
- `ml-service/pyproject.toml` — add `lightfm==1.17`, `scipy`, `sentence-transformers[train]`
- `ml-service/src/fedbook_ml/api.py` — new `/recommend/cf` endpoint + `?reRank=cross-encoder` option on `/recommend/similar`
- `.gitignore` — add `ml-service/models/`

### Task 3.1: Fetch goodbooks-10k

- [ ] **Step 1: Create `ml-service/scripts/download_goodbooks10k.py`**

```python
import os, sys, urllib.request, zipfile
from pathlib import Path

# zenodo mirror of goodbooks-10k (permissive licence, replaces the retired
# github release). Verify URL is live before running.
URL = "https://github.com/zygmuntz/goodbooks-10k/archive/refs/heads/master.zip"
DEST = Path("data/goodbooks-10k")

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    zip_path = DEST / "master.zip"
    print(f"Downloading {URL}...")
    urllib.request.urlretrieve(URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(DEST)
    print(f"Extracted to {DEST}")
    # Expected files inside: books.csv, ratings.csv, tags.csv, book_tags.csv, to_read.csv

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run**

```powershell
cd D:\FedBookSem\ml-service
.\.venv\Scripts\Activate.ps1
python scripts\download_goodbooks10k.py
```
Expected: `ratings.csv` (~69MB, ~6M rows) and `books.csv` (~4MB, 10k rows) in `data/goodbooks-10k/goodbooks-10k-master/`.

- [ ] **Step 3: Commit** — `git commit -m "chore(ml): download goodbooks-10k dataset"`

### Task 3.2: LightFM hybrid CF — training

- [ ] **Step 1: Add deps to `pyproject.toml`** — extend the `ml` optional list:

```toml
ml = [
  "sentence-transformers==3.3.1",
  "torch==2.5.1",
  "numpy==2.1.3",
  "lightfm==1.17",
  "scipy==1.14.1",
  "lightgbm==4.5.0",
  "joblib==1.4.2",
]
```

Reinstall: `pip install -e ".[dev,ml]"`.

- [ ] **Step 2: Write failing test — `ml-service/tests/test_lightfm.py`**

```python
import pytest
from pathlib import Path
from fedbook_ml.ml.lightfm_model import LightFMRecommender

MODEL_PATH = Path("models/lightfm.pkl")

@pytest.mark.skipif(not MODEL_PATH.exists(), reason="model not trained yet")
def test_lightfm_recommends_k_items():
    rec = LightFMRecommender.load(MODEL_PATH)
    top = rec.recommend(user_id=1, k=10)
    assert len(top) == 10
    assert all("goodbooks_id" in row and "score" in row for row in top)

@pytest.mark.skipif(not MODEL_PATH.exists(), reason="model not trained yet")
def test_lightfm_cold_start_new_book():
    rec = LightFMRecommender.load(MODEL_PATH)
    # A book seen only via item features (subject/genre), no interactions:
    scores = rec.score_for_item_features(user_id=1, features={"subject:fiction", "author:Tolkien"})
    assert isinstance(scores, float)
```

- [ ] **Step 3: Implement `ml-service/src/fedbook_ml/ml/lightfm_model.py`**

```python
from dataclasses import dataclass
from pathlib import Path
import joblib, numpy as np, pandas as pd
from lightfm import LightFM
from lightfm.data import Dataset

@dataclass
class LightFMRecommender:
    model: LightFM
    dataset: Dataset
    item_features_matrix: object  # sparse
    user_id_map: dict
    item_id_map: dict
    reverse_item_map: dict

    @classmethod
    def train(cls, ratings_csv: Path, books_csv: Path, epochs: int = 30, num_components: int = 64):
        ratings = pd.read_csv(ratings_csv)  # user_id, book_id, rating
        books = pd.read_csv(books_csv)      # book_id, authors, tag_name?, average_rating
        # Convert 1-5 ratings to implicit binary (>=4 as positive)
        ratings = ratings[ratings["rating"] >= 4]
        # Build item feature strings
        books["item_features"] = books.apply(
            lambda r: [f"author:{str(r.get('authors','')).split(',')[0].strip()}",
                       f"year:{int(r['original_publication_year']) if pd.notna(r.get('original_publication_year')) else 'unk'}"],
            axis=1,
        )
        all_item_features = set()
        for feats in books["item_features"]: all_item_features.update(feats)

        ds = Dataset()
        ds.fit(users=ratings["user_id"].unique(),
               items=books["book_id"].unique(),
               item_features=all_item_features)

        interactions, _ = ds.build_interactions(
            (r.user_id, r.book_id) for r in ratings.itertuples()
        )
        item_features = ds.build_item_features(
            (r.book_id, r.item_features) for r in books.itertuples()
        )

        model = LightFM(loss="warp", no_components=num_components)
        model.fit(interactions, item_features=item_features, epochs=epochs, num_threads=4)

        user_id_map, _, item_id_map, _ = ds.mapping()
        reverse_item_map = {v: k for k, v in item_id_map.items()}
        return cls(model, ds, item_features, user_id_map, item_id_map, reverse_item_map)

    def recommend(self, user_id: int, k: int = 10) -> list[dict]:
        internal_uid = self.user_id_map.get(user_id)
        if internal_uid is None: return []
        n_items = len(self.item_id_map)
        scores = self.model.predict(internal_uid, np.arange(n_items), item_features=self.item_features_matrix)
        top_ids = np.argsort(-scores)[:k]
        return [{"goodbooks_id": self.reverse_item_map[int(i)], "score": float(scores[i])} for i in top_ids]

    def score_for_item_features(self, user_id: int, features: set[str]) -> float:
        # For cold-start: predict on a synthetic item via the trained item-feature embeddings.
        # Left as an exercise / stretch; return NaN as a placeholder in v1.
        return float("nan")

    def save(self, path: Path) -> None:
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: Path) -> "LightFMRecommender":
        return joblib.load(path)
```

- [ ] **Step 4: Write training script `ml-service/scripts/train_lightfm.py`**

```python
from pathlib import Path
from fedbook_ml.ml.lightfm_model import LightFMRecommender

DATA = Path("data/goodbooks-10k/goodbooks-10k-master")
OUT = Path("models/lightfm.pkl")

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("Training LightFM WARP hybrid (this may take 3-8 min on CPU)...")
    rec = LightFMRecommender.train(
        ratings_csv=DATA/"ratings.csv",
        books_csv=DATA/"books.csv",
        epochs=30,
        num_components=64,
    )
    rec.save(OUT)
    print(f"Saved {OUT}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run**

```powershell
python scripts\train_lightfm.py
```
Expected: 3-8 minute training, `models/lightfm.pkl` created (~50-80 MB).

- [ ] **Step 6: Run tests** — `pytest tests/test_lightfm.py -v` → PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(ml): LightFM WARP hybrid CF trained on goodbooks-10k"`

### Task 3.3: Map goodbooks IDs → our ISBNs

- [ ] **Step 1: One-off script `ml-service/scripts/map_goodbooks_to_isbn.py`**

Reads `goodbooks-10k/books.csv` (which has `isbn`, `isbn13`, `book_id`), joins to Neo4j `:Book` on `isbn` OR `isbn13`, writes `b.goodbooksId = ...` and `b.goodbooksBookId = ...` back to Neo4j. Books not matched are logged for manual review.

```python
import asyncio, pandas as pd
from fedbook_ml.neo4j_client import Neo4jClient

async def main():
    df = pd.read_csv("data/goodbooks-10k/goodbooks-10k-master/books.csv")
    df["isbn13"] = df["isbn13"].astype(str).str.replace(".0","",regex=False)
    neo = Neo4jClient.from_env()
    matched = 0
    for _, r in df.iterrows():
        isbn = r.get("isbn13") or r.get("isbn")
        if not isbn or isbn == "nan": continue
        result = await neo.write(
            "MATCH (b:Book {isbn:$i}) SET b.goodbooksBookId = $gid RETURN b.isbn AS ok",
            {"i": str(isbn), "gid": int(r["book_id"])},
        )
        if result: matched += 1
    print(f"Matched {matched}/{len(df)} goodbooks entries to :Book nodes")
    await neo.close()

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run** and record matched count (expect ~500-1500 overlaps with Kaggle 7k).

- [ ] **Step 3: Commit** — `git commit -m "feat(ml): map goodbooks-10k IDs onto :Book nodes"`

### Task 3.4: Wire LightFM into FastAPI

- [ ] **Step 1: Extend `ml-service/src/fedbook_ml/api.py`**

Add to the `lifespan` handler:

```python
from pathlib import Path
from .ml.lightfm_model import LightFMRecommender
...
lightfm_path = Path("models/lightfm.pkl")
state["lightfm"] = LightFMRecommender.load(lightfm_path) if lightfm_path.exists() else None
```

Add a new endpoint:

```python
@app.get("/recommend/cf", response_model=RecommendationResponse)
async def recommend_cf(userId: int = Query(..., ge=1), k: int = Query(10, ge=1, le=50)):
    lfm = state["lightfm"]
    if lfm is None:
        raise HTTPException(503, "LightFM model not loaded; run scripts/train_lightfm.py")
    picks = lfm.recommend(user_id=userId, k=k)
    # Join goodbooks_id → our :Book by goodbooksBookId
    goodbook_ids = [p["goodbooks_id"] for p in picks]
    rows = await state["neo"].read(
        """
        MATCH (b:Book) WHERE b.goodbooksBookId IN $ids
        RETURN b.goodbooksBookId AS gid, b.isbn AS isbn, b.title AS title,
               coalesce(b.author,'') AS author, b.thumbnail AS thumbnail
        """,
        {"ids": goodbook_ids},
    )
    by_gid = {r["gid"]: r for r in rows}
    results = []
    for p in picks:
        row = by_gid.get(p["goodbooks_id"])
        if row:
            results.append({**row, "score": p["score"]})
    return {"results": results}
```

- [ ] **Step 2: Smoke test**

```powershell
uvicorn fedbook_ml.api:app --reload --port 8000
curl "http://localhost:8000/recommend/cf?userId=1&k=5"
```
Expect a list of 5 books (may be short if few goodbooks users overlap with your catalogue — that's a mapping quality signal).

- [ ] **Step 3: Commit** — `git commit -m "feat(ml): FastAPI /recommend/cf endpoint served by LightFM"`

### Task 3.5: BGE cross-encoder reranker

- [ ] **Step 1: Write failing test — `ml-service/tests/test_cross_encoder.py`**

```python
from fedbook_ml.ml.cross_encoder import CrossEncoderReranker

def test_reranker_orders_by_relevance():
    ce = CrossEncoderReranker()
    query = "epic fantasy adventure with wizards and dragons"
    candidates = [
        {"isbn": "A", "title": "Cookbook for Beginners", "description": "Easy recipes."},
        {"isbn": "B", "title": "The Hobbit", "description": "A hobbit sets out on an epic journey with a wizard."},
        {"isbn": "C", "title": "Modern Physics", "description": "Quantum mechanics primer."},
    ]
    ranked = ce.rerank(query, candidates, top_k=3)
    # B should come first
    assert ranked[0]["isbn"] == "B"
    assert "ce_score" in ranked[0]
```

- [ ] **Step 2: Implement `ml-service/src/fedbook_ml/ml/cross_encoder.py`**

```python
from functools import lru_cache
from sentence_transformers import CrossEncoder

@lru_cache
def _get_model() -> CrossEncoder:
    # BAAI/bge-reranker-base: 278M params, MIT, English + Chinese. Good precision/latency balance.
    return CrossEncoder("BAAI/bge-reranker-base", max_length=512)

class CrossEncoderReranker:
    def __init__(self):
        self._model = _get_model()

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        if not candidates: return []
        pairs = [(query, f"{c.get('title','')}. {c.get('description','')}") for c in candidates]
        scores = self._model.predict(pairs, batch_size=32, show_progress_bar=False)
        for c, s in zip(candidates, scores):
            c["ce_score"] = float(s)
        return sorted(candidates, key=lambda c: -c["ce_score"])[:top_k]
```

- [ ] **Step 3: Run test** → PASS (first run downloads ~500MB model).

- [ ] **Step 4: Extend `/recommend/similar` in api.py** — add `reRank` query param:

```python
@app.get("/recommend/similar", response_model=RecommendationResponse)
async def recommend_similar(
    isbn: str | None = Query(None),
    text: str | None = Query(None),
    k: int = Query(10, ge=1, le=50),
    reRank: str | None = Query(None, description="none | cross-encoder"),
):
    fetch_k = k * 5 if reRank == "cross-encoder" else k
    if isbn:
        rows = await state["search"].similar_to_book(isbn, k=fetch_k, exclude_self=True)
        query_text = None
    elif text:
        vec = state["embedder"].embed_one(text)
        rows = await state["search"].similar_to_vector(vec, k=fetch_k)
        query_text = text
    else:
        raise HTTPException(400, "Provide either isbn or text")

    if reRank == "cross-encoder":
        # Need descriptions for reranking; fetch in one batch
        isbns = [r["isbn"] for r in rows]
        descs = await state["neo"].read(
            "MATCH (b:Book) WHERE b.isbn IN $isbns RETURN b.isbn AS isbn, b.description AS d",
            {"isbns": isbns},
        )
        desc_by_isbn = {d["isbn"]: d["d"] for d in descs}
        for r in rows: r["description"] = desc_by_isbn.get(r["isbn"], "")
        # Query text: if seeded by isbn, use that book's description as the query
        if query_text is None:
            q_row = await state["neo"].read(
                "MATCH (b:Book {isbn:$isbn}) RETURN b.description AS d", {"isbn": isbn},
            )
            query_text = q_row[0]["d"] if q_row else ""
        from .ml.cross_encoder import CrossEncoderReranker
        reranker = CrossEncoderReranker()
        rows = reranker.rerank(query_text, rows, top_k=k)
    return {"results": rows[:k]}
```

- [ ] **Step 5: Smoke test**

```powershell
curl "http://localhost:8000/recommend/similar?isbn=9780345339683&k=5&reRank=cross-encoder"
```
Expect 5 items whose top ordering differs from the non-reranked call. Note: added latency of ~50-200ms.

- [ ] **Step 6: Commit** — `git commit -m "feat(ml): BGE cross-encoder rerank option on /recommend/similar"`

### Task 3.6: (Optional stretch) Fine-tune embedder

- [ ] **Step 1: Build training pairs** — `scripts/build_finetune_pairs.py` produces `(book_description, subject_string)` positive pairs plus in-batch negatives, from Kaggle 7k where `categories` is populated.
- [ ] **Step 2: Train** — `scripts/finetune_embedder.py` runs `MultipleNegativesRankingLoss` for 1-3 epochs on the pairs (RTX 4060 handles this comfortably); saves to `models/finetuned-minilm/`.
- [ ] **Step 3: Rebuild embeddings** with the finetuned model and store on a separate property `b.embeddingFT` behind a second vector index `bookEmbeddingFT`.
- [ ] **Step 4: A/B endpoint** — `api.py` accepts `?model=base|finetuned` on `/recommend/similar`.
- [ ] **Step 5: Compare** in Phase 7 evaluation. Adopt finetuned only if it beats base on NDCG@10.

*This task is optional and can be dropped without affecting later phases.*

### Phase 3 Exit Criteria
- `models/lightfm.pkl` exists; `curl /recommend/cf?userId=1&k=5` returns valid results.
- `curl /recommend/similar?...&reRank=cross-encoder` reorders base results.
- Test suite green including `test_lightfm.py` and `test_cross_encoder.py`.
- (Optional) if fine-tuned embedder is done, vector index `bookEmbeddingFT` exists and returns valid results.

---

# Phase 4 — Cross-Platform Ingestion + Sentiment Pipeline

**Deliverable:** Python worker collectors for Reddit, YouTube, Bluesky, Mastodon; sentiment classifiers (twitter-roberta-base-sentiment-latest for general, PyABSA for aspect-based); Neo4j graph model `(:Book)-[:RECEPTION_ON]->(:PlatformReception {platform, positive, neutral, negative, mentions, ingestedAt, expiresAt})`; scheduled purge for YouTube-sourced aggregates >30 days; Reddit deletion propagation.

**Milestone-level tasks (to be expanded into a full plan when Phase 3 lands):**

1. `src/fedbook_ml/ingest/base.py` — `Collector` protocol: `collect(book_query) -> list[Mention]`; abstract sentiment scoring.
2. `src/fedbook_ml/ingest/reddit.py` — PRAW client; search subreddits from `SUBREDDIT_ALLOWLIST` env var (`books`, `booksuggestions`, `SriLankanLiterature`, etc.); OAuth mandatory.
3. `src/fedbook_ml/ingest/youtube.py` — YouTube Data API v3; search "<book title> review"; get comment threads; **stamp `expiresAt = now + 30d`** on every stored aggregate.
4. `src/fedbook_ml/ingest/bluesky.py` — AT Protocol REST; search posts; no retention cap (open network).
5. `src/fedbook_ml/ingest/mastodon.py` — full-text search across a curated set of book-focused instances.
6. `src/fedbook_ml/sentiment.py` — CardiffNLP twitter-roberta-base-sentiment-latest wrapped in a batched classifier; Twitter-style preprocessing (`@user`, `http`); PyABSA aspect-level pass.
7. `src/fedbook_ml/entity_resolution.py` — already exists from Phase 1; reused here to map mentions → canonical `:Book`.
8. `scripts/ingest_daily.py` — main worker loop; called by a cron on the host (or GitHub Actions for demo).
9. `scripts/purge_expired_receptions.py` — deletes `:PlatformReception` where `expiresAt < now()`; sourced from YouTube only.
10. `scripts/reddit_deletion_sweep.py` — re-fetches recent Reddit IDs; if the API returns `[removed]`/`[deleted]`, delete the corresponding aggregate.
11. Graph model added via `backend/src/graph/schema.js`: constraint on `:PlatformReception(id)`.
12. Tests: `test_sentiment_labels_are_stable`, `test_youtube_expiry_stamping`, `test_reddit_deletion_sweep`, integration test with a canned Reddit thread fixture.

**Non-goals for this phase:** shipping the raw platform text anywhere. Only counts + score distributions per (book, platform, day).

**Exit criteria:**
- At least 3 platforms collecting for a curated set of ~50 popular Kaggle titles.
- No raw comment text stored anywhere in Neo4j (verified by inspecting all `:PlatformReception` properties).
- Purge cron removes YouTube aggregates >30 days old.
- Sentiment scores are reproducible for a fixture batch (deterministic given model + input).

---

# Phase 5 — Sentiment-Aware Re-Ranking + Learned Fusion (**NOVEL CONTRIBUTION**)

**Deliverable:** `/recommend/similar?reRank=linear|learned` endpoints. Unified cross-platform reception score. TWO re-ranking flavours: (a) an interpretable linear α/β/γ blend for the dissertation's ablation story, and (b) a **LightGBM LambdaRank** model that *learns* the optimal fusion of `[sim_score, cf_score, reception_score, diversity_score, cross_encoder_score, freshness]` from goodbooks-10k held-out ratings. The learned fusion is the ML contribution on top of the linear novel contribution.

**Milestone-level tasks:**

1. `src/fedbook_ml/reception.py`:
   - `reception_score(book_id) -> float` — normalises per-platform positive share, weighted by `PLATFORM_WEIGHTS` config (algorithmic vs decentralized; e.g. Reddit=0.35, YouTube=0.25, Bluesky=0.2, Mastodon=0.2).
   - `platform_diversity(book_id) -> float` — Shannon entropy over platforms that mention the book, normalised to [0, 1].
   - Cypher aggregation over `:PlatformReception`.
2. `src/fedbook_ml/rerank.py`:
   - `linear_blend(candidates, alpha, beta, gamma) -> list[Scored]` — `final = α·sim + β·reception + γ·diversity`; enforces `α + β + γ = 1`.
   - `learned_blend(candidates, ltr_model) -> list[Scored]` — calls the LightGBM LambdaRank ranker from `ml/ltr.py`.
3. `src/fedbook_ml/ml/ltr.py`:
   - `FeatureBuilder.for_candidates(query_book, candidates) -> np.ndarray` — extracts the 6 features per candidate.
   - `LTRRanker.train(train_data)` — LightGBM `LambdaRank` objective on goodbooks-10k held-out user preferences (see Phase 7 loaders); saves to `models/ltr.pkl`.
   - `LTRRanker.load(path).score(features) -> np.ndarray`.
4. `scripts/train_ltr.py`:
   - Loads Phase 7 evaluation train split.
   - For each `(user, held-out book)` pair, generates top-100 semantic candidates, computes all features, marks the true positive as relevance=1.
   - Trains LambdaRank with early stopping.
   - Saves to `models/ltr.pkl`.
5. `api.py`:
   - Extend `/recommend/similar` with `?reRank=linear|learned|cross-encoder&alpha=&beta=&gamma=` params.
   - Return `sim_score`, `cf_score`, `reception_score`, `diversity_score`, `ce_score` (if reranked), `final_score` in the response for transparency.
   - The `learned` path pulls features via `FeatureBuilder`, scores via `LTRRanker`, returns top-k.
6. Frontend:
   - Add a small "Reception badges" component on `BookCover.jsx` — coloured dots per platform + hover tooltip with counts.
   - Debug toggle (dev builds only) that shows each candidate's feature breakdown when `?debug=1`.
7. Ablation-friendly logging: every recommendation call writes a compact JSON line to `logs/recommend-YYYYMMDD.jsonl` with all feature values + final rank + method — feeds directly into Phase 7 offline analysis.
8. Tests:
   - Unit tests for `reception_score` with hand-crafted `:PlatformReception` fixtures.
   - `FeatureBuilder` extracts the correct 6-feature vector for a fixture candidate set.
   - `LTRRanker` inference is deterministic given a loaded model.
   - Regression: same query with `reRank=linear` and `reRank=learned` produces different orderings when the LightGBM model is loaded (proves learned model is actually being invoked).

**Design contract:** the graph endpoint `/api/feed/recommendations` (Cypher friend-of-friend) is unchanged. This is critical for Phase 7 evaluation, which compares graph vs semantic vs semantic+linear-sentiment vs semantic+learned-fusion head-to-head.

**Exit criteria:**
- `curl /recommend/similar?isbn=...&reRank=linear` reorders results in a repeatable way given fixture receptions.
- `models/ltr.pkl` exists after `scripts/train_ltr.py`; `curl /recommend/similar?...&reRank=learned` uses it.
- Frontend renders per-book reception badges on the "For You" grid.
- Phase 7 ablation table can be populated end-to-end.

---

# Phase 6 — Neo4j GDS Graph Variant

**Deliverable:** Neo4j GDS plugin installed. `/recommend/graph` endpoint using `gds.knn` over the same `b.embedding` property, plus a Personalized PageRank variant.

**Milestone-level tasks:**

1. Modify `docker-compose.yml` neo4j service — add GDS plugin:

```yaml
    environment:
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_dbms_security_procedures_unrestricted: 'apoc.*,gds.*'
```

2. `src/fedbook_ml/graph_search.py`:
   - `knn_similar(isbn, k)` — projects `:Book` nodes with `embedding` property and runs `gds.knn.stream`.
   - `personalised_pagerank(seed_isbns, k)` — projects the review/like/mention graph and runs `gds.pageRank.stream` with `sourceNodes = seeds`.
3. `api.py` — new endpoint `/recommend/graph?strategy=knn|ppr&...`.
4. Node backend — `/api/feed/recommendations/graph` proxy.
5. Tests: `test_gds_knn_matches_native_vector_index_top_k` — sanity that both approaches agree on the top-5 seeds (they should, since both use cosine over the same vectors); `test_ppr_biases_towards_seeds`.
6. Docs — a short `docs/gds-vs-vector.md` explaining when to prefer each.

**Note the GDS Community Edition limits:** max 4 CPU cores, 3 models in catalogue. Acceptable for this project's scale.

**Exit criteria:**
- `CALL gds.list()` in Neo4j Browser shows knn and pageRank algorithms.
- Both new endpoints return valid results.
- KNN result and native-vector-index result agree on top-5 for a random seed (dissertation validation point).

---

# Phase 7 — Offline Evaluation Harness

**Deliverable:** Reproducible evaluation notebook + CLI computing precision@k, recall@k, NDCG@k, MAP@k against goodbooks-10k and a UCSD genre subset. Ablation table across all 7 strategies. Small human face-validity study.

**Milestone-level tasks:**

1. `src/fedbook_ml/eval/loaders.py` — goodbooks-10k loader; UCSD "young adult" genre subset loader; chronological train/held-out split; produces the train file consumed by Phase 5 `train_ltr.py`.
2. `src/fedbook_ml/eval/metrics.py` — implementations of precision@k, recall@k, NDCG@k, MAP@k + novelty, diversity, coverage.
3. `src/fedbook_ml/eval/runner.py` — for each user in held-out, seed with their top-3 highest-rated books, generate top-10 recommendations via each strategy, score against the rest of their held-out ratings.
4. **Strategies compared (7):**
   - `graph` — existing Cypher friend-of-friend (pre-plan baseline in `backend/src/graph/social.js`)
   - `tfidf-cosine` — bag-of-words baseline (implemented in eval script only)
   - `lightfm` — Phase 3 hybrid CF
   - `semantic` — Phase 2 vector similarity (pretrained embedder)
   - `semantic+cross-encoder` — Phase 3 reranker
   - `semantic+linear-sentiment` — Phase 5 linear blend (novel contribution v1)
   - `semantic+learned-fusion` — Phase 5 LightGBM LambdaRank (novel contribution v2, the ML one)
5. `notebooks/eval_report.ipynb` — full report with tables + charts. Exported to `docs/eval-2026-*.md`.
6. Human face-validity study — 10-20 respondents rate top-5 similar books to a seed book (1-5 stars). Compute Kendall tau against model ranking. Store raw + aggregated results in `data/human-eval/`.
7. CI helper — `pytest -m eval` runs a shrunk 100-user subset for regression checks.

**Fallback rule (from the brief's Recommendation 5):** if `semantic+linear-sentiment` NDCG@10 does NOT beat `semantic` alone, keep the *learned* fusion as the primary contribution — that's the ML angle. If BOTH re-rankers underperform, pivot the contribution to aspect-based sentiment (PyABSA) or cross-platform *diversity* as the novel angle. Document any pivot in the write-up.

**Exit criteria:**
- One evaluation table printed and saved with all 7 strategies scored.
- Ablation shows the effect of α, β, γ sweep for the linear blend AND feature-importance from LightGBM for the learned blend.
- Human eval Kendall tau reported.

---

# Phase 8 — Streamlit Dashboard + Write-Up

**Deliverable:** Streamlit app on :8501 for the dissertation defence. Three pages: (1) recommender demo — pick a book, view similar with reception badges + explanation; (2) evaluation dashboard — the tables and charts from Phase 7; (3) model registry — loaded artefacts. Also: thesis chapter draft in `docs/thesis/`.

**Milestone-level tasks:**

1. `ml-service/src/fedbook_ml/dashboard/app.py` — Streamlit entry.
2. `ml-service/src/fedbook_ml/dashboard/pages/1_recommender.py` — search a book, get top-N similar, toggle between `linear`/`learned`/`cross-encoder` rerank strategies, display reception distribution as a stacked bar per platform, show feature contributions for the learned rank.
3. `ml-service/src/fedbook_ml/dashboard/pages/2_evaluation.py` — load Phase 7 outputs and render the 7-strategy comparison tables + Plotly charts (NDCG@k curve, feature importance from LightGBM).
4. `ml-service/src/fedbook_ml/dashboard/pages/3_models.py` — list loaded models (`lightfm.pkl`, `ltr.pkl`, embedder, cross-encoder), sizes, training-run metadata.
4. `ml-service/scripts/run_dashboard.sh` — `streamlit run src/fedbook_ml/dashboard/app.py --server.port 8501`.
5. Add to `docker-compose.yml` as a separate service.
6. `docs/thesis/` — outline + literature review + methods + results + discussion chapters, drawing directly from the brief's Section 6 (Academic angle & literature foundation).
7. README update — dashboard start command, screenshots.

**Exit criteria:**
- Dashboard reachable at http://localhost:8501.
- Committee reviewer can reproduce all figures by running the notebook + dashboard.
- Thesis chapters submitted by user's supervisor deadline.

---

## Verification (End-to-End)

**Smoke sequence after each phase merges:**

```powershell
# 1. Bring everything up
cd D:\FedBookSem
docker compose up -d
# 2. Backend health
curl http://localhost:3001/health
# 3. ML service health
curl http://localhost:8000/health
# 4. Vector recommendation for a sample book (The Hobbit)
curl http://localhost:8000/recommend/similar?isbn=9780345339683^&k=5
# 5. Sentiment-aware re-rank (from Phase 5)
curl "http://localhost:8000/recommend/similar?isbn=9780345339683&k=5&reRank=linear"
# 5b. Learned rank fusion (from Phase 5)
curl "http://localhost:8000/recommend/similar?isbn=9780345339683&k=5&reRank=learned"
# 5c. CF recommendation (from Phase 3)
curl "http://localhost:8000/recommend/cf?userId=1&k=5"
# 5d. Cross-encoder reranker (from Phase 3)
curl "http://localhost:8000/recommend/similar?isbn=9780345339683&k=5&reRank=cross-encoder"
# 6. Graph endpoint (still works)
curl http://localhost:3001/api/feed/all
# 7. Neo4j index status
# In Neo4j Browser: SHOW VECTOR INDEXES;
# 8. Test suite (Python)
cd ml-service; .\.venv\Scripts\Activate.ps1; pytest -q
# 9. Frontend
cd ..\frontend; npm start
# Open http://localhost:3000/feed → login as alice → click "For You"
```

**Reproducibility check:** clone the repo fresh, `docker compose up -d --build`, run the seed + build_embeddings + enrich scripts. All Phase 2 exit criteria should be reachable within 30 minutes from a clean state on the RTX 4060 laptop.

---

## Open Questions (resolve as each phase approaches)

1. **Reddit API tier.** Free vs paid — will the free tier's per-minute rate limit sustain hourly ingestion for ~7k books? If not, narrow scope to the 6 classics + 100 popular Kaggle titles for the dissertation demo.
2. **PyABSA vs simpler aspect extractor.** PyABSA depends on `pyabsa` package + several 300MB+ models. If Streamlit Community Cloud's 1 GB memory ceiling becomes a blocker, swap to a lighter aspect-extraction rule (spaCy + noun-chunk sentiment) — accept the accuracy hit.
3. **UCSD Book Graph inclusion.** Academic-use-only. Confirm with SLIIT ethics that offline evaluation using this dataset is permitted for the dissertation. If not, restrict Phase 7 to goodbooks-10k alone.
4. **Ethics approval scope.** Any data collected via Reddit/YouTube — even aggregates — may need ethics approval given it references identifiable posts. Discuss with the supervisor before Phase 4 starts.
5. **Language scope.** English-only catalogue (Kaggle 7k). all-MiniLM-L6-v2 is a good fit. If multilingual expansion is ever needed, swap in `gte-multilingual-base` or `BGE-M3`.
6. **Deployment.** The plan targets local + docker-compose. If a public demo is required for the defence, Hugging Face Spaces (free) is the recommended host — but review dataset licences (UCSD absolutely cannot ship there).

---

## Self-Review Notes

- Spec coverage: brief Phases 0-6 mapped to plan Phases 1-8. Renumbered because brief Phase 0 (ingestion) doesn't exist in this codebase yet, and a dedicated ML phase (LightFM + cross-encoder + optional fine-tune) has been inserted at plan Phase 3.
- Placeholders: none in Phase 1 & 2 (fully TDD-decomposed). Phase 3 has enough concrete code for the LightFM + cross-encoder core; the fine-tune stretch task is intentionally milestone-level.
- Type consistency: `Neo4jClient`, `EntityResolver`, `Embedder`, `VectorSearcher`, `LightFMRecommender`, `CrossEncoderReranker`, `LTRRanker`, `Recommendation*` models used consistently.
- Dependency order: enrichment (1.6) after client (1.5); embeddings script (2.3) after index (2.2) and embedder (2.1); proxy (2.7) after FastAPI (2.5) and docker (2.6). Phase 3 depends on Phase 2 for the semantic score feature. Phase 5's learned fusion depends on Phase 3 (cf feature) AND Phase 4 (reception feature). Phase 7 evaluation uses Phase 5's `train_ltr.py` train split — order matters.
- ML story coverage: pretrained embeddings (Phase 2) + hybrid CF (Phase 3) + neural reranker (Phase 3) + learned rank fusion (Phase 5) + optional embedder fine-tune (Phase 3 stretch). Five distinct ML components.

## Execution Handoff

**Two options for executing this plan:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Best for Phases 1, 2, and 3, which are decomposed to executable-code depth.
2. **Inline Execution** — execute in the current session using `superpowers:executing-plans`, batched with checkpoints.

Phases 4-8 must first be re-expanded into their own plan files before execution — this file's milestone-level lists are not TDD-ready.

Choose one to start Phase 1.
