"""FastAPI application exposing the ML recommender endpoints.

Routes:
    GET /health
    GET /recommend/similar    - semantic + optional cross-encoder or sentiment re-rank
    GET /recommend/cf         - LightFM CF (returns 503 if model not loaded)
    GET /recommend/graph      - Neo4j GDS graph strategies (Phase 6)
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .config import get_settings
from .embeddings import get_embedder
from .neo4j_client import Neo4jClient
from .reception import ReceptionScorer
from .rerank import RerankStrategy, rerank_candidates
from .vector_search import VectorSearcher

log = logging.getLogger("fedbook_ml.api")

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    state["neo"] = Neo4jClient.from_env()
    state["search"] = VectorSearcher(state["neo"])
    state["embedder"] = get_embedder()
    state["reception"] = ReceptionScorer(state["neo"])

    # Optional trained-model loading with graceful fallback
    state["lightfm"] = _load_lightfm()
    state["cross_encoder"] = None  # lazy-loaded on first use
    state["ltr"] = _load_ltr()

    # Live-enrichment clients (Open Library + Hardcover). Both are lazy and
    # fail gracefully - Open Library needs no credentials; Hardcover works
    # only when HARDCOVER_API_TOKEN is set.
    from .openlibrary import OpenLibraryClient
    from .ml.hardcover import HardcoverClient
    state["openlibrary"] = OpenLibraryClient()
    state["hardcover"] = HardcoverClient()
    log.info("Hardcover enrichment %s", "enabled" if state["hardcover"].enabled else "disabled (no token)")

    Path("logs").mkdir(exist_ok=True)

    try:
        yield
    finally:
        await state["neo"].close()
        await state["openlibrary"]._client.aclose()
        await state["hardcover"].aclose()


def _load_lightfm():
    try:
        from .ml.lightfm_model import LightFMRecommender
        path = Path("models/lightfm.pkl")
        if path.exists():
            log.info("Loading LightFM model from %s", path)
            return LightFMRecommender.load(path)
        log.info("LightFM model not found at %s - /recommend/cf will 503", path)
    except Exception as exc:  # noqa: BLE001
        log.warning("LightFM load failed: %s", exc)
    return None


def _load_ltr():
    try:
        from .ml.ltr import LTRRanker
        path = Path("models/ltr.pkl")
        if path.exists():
            log.info("Loading LTR model from %s", path)
            return LTRRanker.load(path)
        log.info("LTR model not found at %s - reRank=learned will fall back to linear", path)
    except Exception as exc:  # noqa: BLE001
        log.warning("LTR load failed: %s", exc)
    return None


app = FastAPI(title="FedBook ML", version="0.1.0", lifespan=lifespan)


# ---------- Models ----------

class RecommendationItem(BaseModel):
    isbn: str
    title: str
    author: str = ""
    thumbnail: str | None = None
    score: float
    sim_score: float | None = None
    reception_score: float | None = None
    diversity_score: float | None = None
    ce_score: float | None = None
    final_score: float | None = None
    # Per-platform breakdown - populated whenever :PlatformReception exists
    # for the book. Empty dicts when Phase 4 ingestion hasn't run yet.
    mentions_by_platform: dict[str, int] | None = None
    platform_breakdown: dict[str, dict[str, float]] | None = None
    # Live-enrichment fields, populated when ?enrichLive=true
    subjects: list[str] | None = None
    openlibrary_work_id: str | None = None
    hardcover_rating: float | None = None
    hardcover_ratings_count: int | None = None


class RecommendationResponse(BaseModel):
    strategy: str
    results: list[RecommendationItem]


# ---------- Helpers ----------

def _log_recommend(payload: dict) -> None:
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    with open(f"logs/recommend-{day}.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, default=str) + "\n")


# ---------- Endpoints ----------

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "fedbook-ml",
        "lightfm_loaded": state.get("lightfm") is not None,
        "ltr_loaded": state.get("ltr") is not None,
    }


class BookMatch(BaseModel):
    isbn: str
    title: str
    author: str = ""
    thumbnail: str | None = None


@app.get("/books/search")
async def books_search(
    q: str = Query(..., min_length=1, description="title or author substring"),
    k: int = Query(5, ge=1, le=20),
) -> dict:
    """Case-insensitive fuzzy-ish lookup on the catalogue.

    Matches the query against `title` first, then `author` as a fallback.
    Ordered by title-length ASC so shorter matches ("Cash") rank above
    long-title accidental substring hits. Kaggle catalogue only (books
    with a Google-Books thumbnail).
    """
    rows = await state["neo"].read(
        """
        MATCH (b:Book)
        WHERE b.thumbnail IS NOT NULL
          AND (toLower(b.title) CONTAINS toLower($q)
               OR toLower(coalesce(b.author,'')) CONTAINS toLower($q))
        RETURN b.isbn AS isbn,
               coalesce(b.title,'') AS title,
               coalesce(b.author,'') AS author,
               b.thumbnail AS thumbnail,
               size(b.title) AS title_len,
               CASE WHEN toLower(b.title) CONTAINS toLower($q) THEN 0 ELSE 1 END AS title_priority
        ORDER BY title_priority ASC, title_len ASC
        LIMIT $k
        """,
        {"q": q, "k": k},
    )
    return {"query": q, "matches": [
        {k: r[k] for k in ("isbn", "title", "author", "thumbnail")} for r in rows
    ]}


@app.get("/books/details")
async def books_details(
    isbn: str = Query(..., description="ISBN-13 of the book to fetch"),
    enrichLive: bool = Query(True, description="fan out to Open Library + Hardcover"),
) -> dict:
    """Return everything we know about one book: catalogue row, reception
    aggregates, and (opt-in) live Open Library + Hardcover enrichment.

    Powers the dashboard's 'Book title' lookup - when a user picks a
    match from the search dropdown, we render the seed book itself
    alongside its neighbours.
    """
    rows = await state["neo"].read(
        """
        MATCH (b:Book {isbn:$isbn})
        RETURN b.isbn AS isbn,
               coalesce(b.title,'') AS title,
               coalesce(b.author,'') AS author,
               b.thumbnail AS thumbnail,
               coalesce(b.description,'') AS description
        """,
        {"isbn": isbn},
    )
    if not rows:
        raise HTTPException(404, f"Book not found: {isbn}")

    row = dict(rows[0])
    row["score"] = 1.0
    row["sim_score"] = 1.0

    # Reception attachment - reuse the same helper used by /recommend/similar.
    await _attach_reception_only([row])

    if enrichLive:
        await _enrich_live([row])

    return row


@app.get("/recommend/similar", response_model=RecommendationResponse)
async def recommend_similar(
    isbn: str | None = Query(None),
    text: str | None = Query(None),
    k: int = Query(10, ge=1, le=50),
    reRank: str | None = Query(
        None,
        description="none | cross-encoder | linear | learned",
    ),
    alpha: float = Query(0.7, ge=0, le=1, description="linear blend: semantic weight"),
    beta: float = Query(0.25, ge=0, le=1, description="linear blend: reception weight"),
    gamma: float = Query(0.05, ge=0, le=1, description="linear blend: diversity weight"),
    enrichLive: bool = Query(
        False,
        description="Fan out to Open Library (subjects, work_id) + Hardcover (rating) for the top-k results",
    ),
) -> dict:
    fetch_k = k * 5 if reRank in {"cross-encoder", "linear", "learned"} else k

    if isbn:
        rows = await state["search"].similar_to_book(isbn, k=fetch_k, exclude_self=True)
        query_text_hint = None
    elif text:
        vec = state["embedder"].embed_one(text)
        rows = await state["search"].similar_to_vector(vec, k=fetch_k)
        query_text_hint = text
    else:
        raise HTTPException(400, "Provide either isbn or text")

    for r in rows:
        r["sim_score"] = float(r["score"])

    strategy = reRank or "semantic"

    if reRank == "cross-encoder":
        rows = await _apply_cross_encoder(rows, isbn, query_text_hint)
    elif reRank in {"linear", "learned"}:
        rows = await rerank_candidates(
            candidates=rows,
            strategy=RerankStrategy(reRank),
            reception=state["reception"],
            ltr_model=state["ltr"] if reRank == "learned" else None,
            alpha=alpha, beta=beta, gamma=gamma,
        )
    else:
        # semantic (no rerank): reception is not part of ranking, but we still
        # attach the per-platform breakdown so the UI can render reception
        # badges regardless of strategy.
        await _attach_reception_only(rows)

    rows = rows[:k]
    if enrichLive:
        await _enrich_live(rows)
    _log_recommend({
        "endpoint": "/recommend/similar",
        "isbn": isbn, "text": text, "k": k,
        "strategy": strategy,
        "alpha": alpha, "beta": beta, "gamma": gamma,
        "enrichLive": enrichLive,
        "results": [{"isbn": r["isbn"], "final": r.get("final_score") or r["score"]} for r in rows],
    })
    return {"strategy": strategy, "results": rows}


async def _enrich_live(rows: list[dict]) -> None:
    """Fan out to Open Library and Hardcover concurrently for the given rows.

    Both sources are best-effort. Missing / failed lookups leave the fields
    as None on the response - the frontend already handles both cases.
    """
    if not rows:
        return

    ol = state["openlibrary"]
    hc = state["hardcover"]
    isbns = [r["isbn"] for r in rows]

    # Run both fan-outs concurrently
    ol_task = asyncio.gather(*(ol.fetch_work_by_isbn(i) for i in isbns), return_exceptions=True)
    hc_task = hc.ratings_for_isbns(isbns) if hc.enabled else asyncio.sleep(0, result={})
    ol_results, hc_results = await asyncio.gather(ol_task, hc_task)

    for r, ol_work in zip(rows, ol_results, strict=True):
        if isinstance(ol_work, Exception) or ol_work is None:
            continue
        r["subjects"] = ol_work.subjects[:8] if ol_work.subjects else []
        r["openlibrary_work_id"] = ol_work.work_id

    for r in rows:
        hit = hc_results.get(r["isbn"]) if hc_results else None
        if hit is not None:
            r["hardcover_rating"] = hit.rating
            r["hardcover_ratings_count"] = hit.ratings_count


async def _attach_reception_only(rows: list[dict]) -> None:
    """Attach reception fields without affecting ordering. Used for the semantic
    strategy so book cards can still show per-platform badges."""
    if not rows:
        return
    isbns = [r["isbn"] for r in rows]
    scores = await state["reception"].scores_for_isbns(isbns)
    for r in rows:
        rec = scores.get(r["isbn"], {})
        r["reception_score"] = rec.get("reception_score", 0.5)
        r["diversity_score"] = rec.get("diversity_score", 0.0)
        r["mentions_by_platform"] = rec.get("mentions_by_platform", {})
        r["platform_breakdown"] = rec.get("platform_breakdown", {})


async def _apply_cross_encoder(
    rows: list[dict], seed_isbn: str | None, seed_text: str | None
) -> list[dict]:
    if not rows:
        return rows

    # Init the reranker in a worker thread the first time - the constructor
    # downloads ~500MB (BAAI/bge-reranker-base) synchronously, which would
    # otherwise block uvicorn's event loop and hang every concurrent request.
    if state["cross_encoder"] is None:
        from .ml.cross_encoder import CrossEncoderReranker
        state["cross_encoder"] = await asyncio.to_thread(CrossEncoderReranker)

    # Fetch descriptions for candidates
    isbns = [r["isbn"] for r in rows]
    descs = await state["neo"].read(
        "MATCH (b:Book) WHERE b.isbn IN $isbns RETURN b.isbn AS isbn, coalesce(b.description,'') AS d",
        {"isbns": isbns},
    )
    d_by_isbn = {d["isbn"]: d["d"] for d in descs}
    for r in rows:
        r["description"] = d_by_isbn.get(r["isbn"], "")

    if seed_text:
        query_text = seed_text
    elif seed_isbn:
        q_rows = await state["neo"].read(
            "MATCH (b:Book {isbn:$isbn}) RETURN coalesce(b.description,'') AS d",
            {"isbn": seed_isbn},
        )
        query_text = q_rows[0]["d"] if q_rows else ""
    else:
        query_text = ""

    # Inference is also CPU-bound - keep it off the event loop
    reranker = state["cross_encoder"]
    rows = await asyncio.to_thread(reranker.rerank, query_text, rows, len(rows))
    for r in rows:
        r["final_score"] = r.get("ce_score", r["score"])
    # Attach reception so book cards can render platform badges even in
    # cross-encoder mode (ordering is untouched).
    await _attach_reception_only(rows)
    return rows


@app.get("/recommend/cf", response_model=RecommendationResponse)
async def recommend_cf(
    userId: int = Query(..., ge=1),
    k: int = Query(10, ge=1, le=50),
) -> dict:
    lfm = state.get("lightfm")
    if lfm is None:
        raise HTTPException(
            503,
            "LightFM model not loaded. Train on a GPU/Colab machine and drop "
            "models/lightfm.pkl into the ml-service volume, then restart the service.",
        )
    picks = lfm.recommend(user_id=userId, k=k)
    goodbook_ids = [p["goodbooks_id"] for p in picks]
    rows = await state["neo"].read(
        """
        MATCH (b:Book) WHERE b.goodbooksBookId IN $ids
        RETURN b.goodbooksBookId AS gid, b.isbn AS isbn,
               coalesce(b.title,'') AS title, coalesce(b.author,'') AS author,
               b.thumbnail AS thumbnail
        """,
        {"ids": goodbook_ids},
    )
    by_gid = {r["gid"]: r for r in rows}
    results = []
    for p in picks:
        row = by_gid.get(p["goodbooks_id"])
        if row:
            results.append({**row, "score": p["score"], "sim_score": p["score"]})
    return {"strategy": "lightfm-cf", "results": results}


@app.get("/recommend/graph", response_model=RecommendationResponse)
async def recommend_graph(
    isbn: str = Query(..., description="seed book ISBN"),
    strategy: str = Query("knn", description="knn | ppr"),
    k: int = Query(10, ge=1, le=50),
) -> dict:
    from .graph_search import GraphSearcher

    searcher = GraphSearcher(state["neo"])
    if strategy == "knn":
        rows = await searcher.knn_similar(isbn, k=k)
    elif strategy == "ppr":
        rows = await searcher.personalised_pagerank([isbn], k=k)
    else:
        raise HTTPException(400, "strategy must be knn or ppr")
    return {"strategy": f"gds-{strategy}", "results": rows}
