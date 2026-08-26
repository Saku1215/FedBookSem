# FedBook-Sem — ML Backend + Dashboard Setup (No Frontend)

> Sets up the Python **ml-service** (FastAPI :8000) + **Streamlit
> dashboard** (:8501) + **Neo4j 5.15 with the GDS plugin** — no React
> frontend, no Node backend. Sufficient to demo:
>
> - Semantic recommendations
> - Cross-platform reception (mock or live)
> - Hardcover ★ ratings + Open Library subjects
> - LightFM collaborative filtering
> - Neo4j GDS graph strategies

---

## 1. Prerequisites

| Tool | Minimum | Notes |
|---|---|---|
| **Docker Desktop** | v4.20+ | Windows/macOS/Linux. Give it ≥ 6 GB RAM (`Settings → Resources`). |
| **Git** | any recent version | for `git clone`. |
| **~15 GB free disk** | | Container images (~5 GB) + models (~2 GB) + Kaggle data (~150 MB) + margins. |
| **A GitHub account** | (only if you plan to push changes) | |

You do **NOT** need Node.js, npm, Python locally, or a React setup. Everything runs inside Docker.

---

## 2. Clone

```powershell
cd D:\
git clone https://github.com/SanjayaWeerasinghe/FedBookSem.git
cd FedBookSem
git checkout feature/dashboard-and-ingestion
```

*(`feature/dashboard-and-ingestion` is the branch that has the ml-service + dashboard work but not the React frontend integration.)*

---

## 3. Environment configuration

The ml-service reads credentials and settings from `ml-service/.env`. Copy the example:

```powershell
Copy-Item ml-service\.env.example ml-service\.env
```

Then edit `ml-service\.env` in a text editor. The **minimum** needed to run:

```env
NEO4J_PASSWORD=fedbooksem123
OPENLIBRARY_USER_AGENT=FedBook-Sem/0.1 (your.email@example.com)
```

**Optional but recommended** — for live enrichment and social ingestion:

```env
# Hardcover ★ ratings — get a token at https://hardcover.app/account/api
HARDCOVER_API_TOKEN=eyJhbGciOiJ...

# YouTube (comment ingestion) — get an API key at
# https://console.cloud.google.com → APIs → YouTube Data API v3
YOUTUBE_API_KEY=AIzaSy...

# Bluesky (post ingestion) — create an app password at
# https://bsky.app/settings/app-passwords
BSKY_HANDLE=yourhandle.bsky.social
BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Mastodon (bookstodon hashtag polling) — no credentials needed
MASTODON_INSTANCES=mastodon.social,ohai.social

# Reddit — currently requires Nov 2025 Responsible Builder Policy
# approval. Leave blank unless you have pre-existing OAuth creds.
# REDDIT_CLIENT_ID=
# REDDIT_CLIENT_SECRET=
```

---

## 4. Bring up Neo4j

```powershell
docker compose up -d neo4j
```

Neo4j 5.15 + APOC + GDS plugins will download and start (~30 s first time). Wait for readiness:

```powershell
# PowerShell wait loop
do {
  Start-Sleep -Seconds 3
  docker exec fedbooksem-neo4j cypher-shell -u neo4j -p fedbooksem123 "RETURN 1" 2>$null
} until ($LASTEXITCODE -eq 0)
Write-Host "Neo4j ready"
```

Neo4j Browser: **http://localhost:7474**  (user: `neo4j`, pass: `fedbooksem123`)

---

## 5. Apply the schema

Vector index + PlatformReception indexes. Copy-paste this into Neo4j Browser or run via cypher-shell:

```cypher
// Uniqueness constraints
CREATE CONSTRAINT book_isbn IF NOT EXISTS FOR (b:Book) REQUIRE b.isbn IS UNIQUE;
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;

// Book lookup indexes
CREATE INDEX book_title IF NOT EXISTS FOR (b:Book) ON (b.title);
CREATE INDEX book_openlibrary_id IF NOT EXISTS FOR (b:Book) ON (b.openLibraryWorkId);
CREATE INDEX book_goodbooks IF NOT EXISTS FOR (b:Book) ON (b.goodbooksBookId);

// PlatformReception (ingestion aggregates)
CREATE INDEX platform_reception_book_isbn IF NOT EXISTS
  FOR (r:PlatformReception) ON (r.book_isbn);
CREATE INDEX platform_reception_expires IF NOT EXISTS
  FOR (r:PlatformReception) ON (r.expires_at);

// Vector index for semantic search (all-MiniLM-L6-v2 = 384 dims)
CREATE VECTOR INDEX bookEmbedding IF NOT EXISTS
FOR (b:Book) ON (b.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 384,
    `vector.similarity_function`: 'cosine'
  }
};
```

Verify:

```powershell
docker exec fedbooksem-neo4j cypher-shell -u neo4j -p fedbooksem123 "SHOW INDEXES"
```

You should see `bookEmbedding` (VECTOR type, ONLINE) and the two `platform_reception_*` indexes.

---

## 6. Build and start ml-service + dashboard

```powershell
docker compose up -d --build ml-service ml-dashboard
```

First build takes 10-15 min (torch, sentence-transformers, LightFM, LightGBM, streamlit, praw, etc.). Wait for both to be healthy:

```powershell
do {
  Start-Sleep -Seconds 3
  docker exec fedbook-ml curl -sf http://localhost:8000/health 2>$null
} until ($LASTEXITCODE -eq 0)
Write-Host "ml-service ready"

do {
  Start-Sleep -Seconds 3
  docker exec fedbook-ml-dashboard curl -sf http://localhost:8501/_stcore/health 2>$null
} until ($LASTEXITCODE -eq 0)
Write-Host "dashboard ready"
```

---

## 7. Load the book catalogue

**Kaggle 7k books** (~6.5 k English titles, our recommender's real catalogue):

```powershell
# 7.1 Download the CSV (skip if it's already at data/kaggle_7k/books.csv)
docker exec fedbook-ml sh -c "
  mkdir -p data/kaggle_7k &&
  curl -sSL -o data/kaggle_7k/books.csv \
    'https://raw.githubusercontent.com/uchidalab/book-dataset/master/Task2/book32-listing.csv' ||
  echo 'Manual download needed - see docs/BUILD_LOG.md'
"

# 7.2 Seed :Book nodes into Neo4j
docker exec fedbook-ml python scripts/seed_kaggle_books.py
```

*(If step 7.1 fails, download the Kaggle CSV manually from Kaggle's "7k books with metadata" dataset and drop it at `ml-service/data/kaggle_7k/books.csv`, then run step 7.2.)*

Verify:

```powershell
docker exec fedbooksem-neo4j cypher-shell -u neo4j -p fedbooksem123 `
  "MATCH (b:Book) RETURN count(b) AS books"
# Expect ~6548 books
```

---

## 8. Embed every book (~5 min CPU)

```powershell
docker exec fedbook-ml python scripts/build_embeddings.py
```

Writes 384-dim vectors on every `:Book` node with a description via `sentence-transformers/all-MiniLM-L6-v2`. Verify:

```powershell
docker exec fedbooksem-neo4j cypher-shell -u neo4j -p fedbooksem123 `
  "MATCH (b:Book) WHERE b.embedding IS NOT NULL RETURN count(b) AS embedded, size(head(collect(b.embedding))) AS dim"
# Expect: 6548, 384
```

---

## 9. (Optional) LightFM collaborative-filtering baseline

Enables `/recommend/cf?userId=X`. Trains on the public **goodbooks-10k** dataset.

```powershell
# 9.1 Download the goodbooks-10k dataset (~50 MB)
docker exec fedbook-ml python scripts/download_goodbooks10k.py

# 9.2 Train LightFM WARP (~10 min on CPU)
docker exec fedbook-ml python scripts/train_lightfm.py

# 9.3 Map goodbooks IDs → your :Book.isbn (matches ~130 titles)
docker exec fedbook-ml python scripts/map_goodbooks_to_isbn.py

# 9.4 Restart ml-service so it picks up models/lightfm.pkl
docker compose restart ml-service
```

Verify:

```powershell
docker exec fedbook-ml curl -s http://localhost:8000/health
# Expect: {"status":"ok","lightfm_loaded":true,...}
```

---

## 10. First-run verification

### 10.1 — Semantic recommendation

```powershell
docker exec fedbook-ml curl -s `
  "http://localhost:8000/recommend/similar?text=medieval%20fantasy&k=5"
```

Should return 5 books with `sim_score` around 0.75-0.81.

### 10.2 — Live enrichment (subjects + Hardcover ratings)

*(requires `HARDCOVER_API_TOKEN` in `.env` for the ★ chip; subjects always work)*

```powershell
docker exec fedbook-ml curl -s `
  "http://localhost:8000/recommend/similar?text=dystopia&k=3&enrichLive=true"
```

Expect `subjects`, `openlibrary_work_id`, `hardcover_rating`, `hardcover_ratings_count` on every result.

### 10.3 — Dashboard

Open **http://localhost:8501** in a browser.

- Sidebar → **Recommender demo**
- **Query type:** `Book title`
- Type e.g. `Assassin` → pick "Assassin's Apprentice" from the radio list
- Tick **"Enrich live"** to see live Hardcover ratings + Open Library subjects
- Hit **Recommend**

### 10.4 — Neo4j Browser

Open **http://localhost:7474**, log in as `neo4j` / `fedbooksem123`, and run e.g.

```cypher
MATCH (b:Book) RETURN b.title, b.author LIMIT 25
```

---

## 11. (Optional) Populate cross-platform reception

Two paths — start with mock, then swap in real data as credentials come.

### 11.1 — Mock demo data (no credentials needed)

Populates `:PlatformReception` for the whole English catalogue so every book card shows dots + a tooltip:

```powershell
docker exec fedbook-ml python scripts/seed_mock_receptions.py --count 6548
```

This uses `ON CREATE SET` — safe to run after real ingestion, won't clobber real data.

### 11.2 — Real ingestion

For platforms with credentials in `.env`:

```powershell
# Small run: 20 books, YouTube + Bluesky + Mastodon
docker exec fedbook-ml python scripts/ingest_daily.py `
  --platforms bluesky,mastodon,youtube --limit 20

# Bigger run once you're happy: 100 books
docker exec fedbook-ml python scripts/ingest_daily.py `
  --platforms bluesky,mastodon,youtube --limit 100
```

Real ingestion:
- Marks nodes as `demo: false`
- Sets `expires_at = now + 30 days` on YouTube-sourced nodes (retention rule)
- Persists ONLY aggregate counts + external IDs — never raw post text

### 11.3 — Compliance crons (run daily / weekly)

```powershell
# Daily: purge YouTube data past 30-day retention window
docker exec fedbook-ml python scripts/purge_expired_receptions.py

# Weekly: honour Reddit deletions (requires REDDIT_CLIENT_ID)
docker exec fedbook-ml python scripts/reddit_deletion_sweep.py
```

---

## 12. Shut down

Stops containers (data volumes persist):

```powershell
docker compose stop neo4j ml-service ml-dashboard
```

Full teardown (removes containers, keeps volumes — data survives):

```powershell
docker compose down
```

Full wipe (**deletes Neo4j data and all trained models**):

```powershell
docker compose down -v
```

---

## 13. Restart later

Data volumes persist, so a normal restart just brings services back up:

```powershell
docker compose up -d neo4j ml-service ml-dashboard
```

Everything (embeddings, reception, LightFM model) is preserved.

---

## 14. Troubleshooting

### 14.1 Docker Desktop won't start

- Check disk space — Docker needs at least a few GB free on C:.
- If Windows says WSL is unavailable, run PowerShell as admin and execute `wsl --update`.

### 14.2 ml-service `/health` returns `lightfm_loaded: false`

- The `models/lightfm.pkl` file is missing. Run Section 9.
- Or skip CF — semantic recommendations still work.

### 14.3 Cross-encoder mode hangs on first call

- BGE reranker (~500 MB) downloads on first use.
- Set `HF_HUB_OFFLINE=0` temporarily for that one call:
  ```powershell
  docker exec -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 fedbook-ml python -c "from sentence_transformers import CrossEncoder; CrossEncoder('BAAI/bge-reranker-base')"
  ```
- After download, revert the env override.

### 14.4 Sentiment scorer using lexicon fallback

- Expected when the CardiffNLP model (`cardiffnlp/twitter-roberta-base-sentiment-latest`) hasn't been cached yet.
- Trigger the download:
  ```powershell
  docker exec -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 fedbook-ml python -c "from transformers import AutoModelForSequenceClassification; AutoModelForSequenceClassification.from_pretrained('cardiffnlp/twitter-roberta-base-sentiment-latest')"
  ```
- Then re-run ingestion.

### 14.5 Neo4j vector index says "populating" forever

- Wait a few minutes — the index builds asynchronously after `build_embeddings.py`.
- Query status: `SHOW INDEXES YIELD name, state WHERE name = 'bookEmbedding' RETURN state`
- If stuck, restart Neo4j: `docker compose restart neo4j`

### 14.6 Streamlit shows "Request failed: Server error 500"

- Check ml-service logs: `docker logs fedbook-ml --tail 30`.
- Common causes: missing `:PlatformReception` nodes (run Section 11), stale Neo4j pool after Neo4j restart (`docker compose restart ml-service`).

---

## 15. URLs at a glance

| Service | URL | Notes |
|---|---|---|
| Neo4j Browser | http://localhost:7474 | user `neo4j`, pass `fedbooksem123` |
| ml-service API | http://localhost:8000 | `/health`, `/recommend/similar`, `/recommend/cf`, `/recommend/graph`, `/books/search`, `/books/details` |
| Dashboard | http://localhost:8501 | Streamlit demo UI |
| ml-service docs | http://localhost:8000/docs | Auto-generated OpenAPI Swagger |

---

**End of setup.** Everything from this document is reproducible from a clean laptop — total wall-clock time ~45 min (dominated by pip install + embedding pass).
