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

    Path("logs").mkdir(exist_ok=True)

    try:
        yield
    finally:
        await state["neo"].close()


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

    rows = rows[:k]
    _log_recommend({
        "endpoint": "/recommend/similar",
        "isbn": isbn, "text": text, "k": k,
        "strategy": strategy,
        "alpha": alpha, "beta": beta, "gamma": gamma,
        "results": [{"isbn": r["isbn"], "final": r.get("final_score") or r["score"]} for r in rows],
    })
    return {"strategy": strategy, "results": rows}


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
