"""Recommender demo page: choose a book, view similar recommendations under
several re-ranking strategies, inspect per-candidate reception badges and
optional live enrichment from Open Library and Hardcover.
"""

import os

import httpx
import streamlit as st

ML_API = os.environ.get("ML_API_URL", "http://ml-service:8000")

PLATFORM_COLOURS = {
    "reddit": "#ff4500",
    "youtube": "#ff0000",
    "bluesky": "#0085ff",
    "mastodon": "#6364ff",
}
PLATFORM_LABELS = {
    "reddit": "Reddit",
    "youtube": "YouTube",
    "bluesky": "Bluesky",
    "mastodon": "Mastodon",
}


def _reception_badges(item: dict) -> None:
    """Render coloured platform dots + Hardcover star chip + subject tags."""
    breakdown = item.get("platform_breakdown") or {}
    mentions = item.get("mentions_by_platform") or {}
    score = item.get("reception_score")
    hc_rating = item.get("hardcover_rating")
    hc_count = item.get("hardcover_ratings_count")
    subjects = item.get("subjects") or []

    parts = []
    for p, colour in PLATFORM_COLOURS.items():
        n = mentions.get(p, 0)
        opacity = "1.0" if n > 0 else "0.25"
        parts.append(
            f'<span title="{PLATFORM_LABELS[p]}: {n} mentions" '
            f'style="display:inline-block;width:10px;height:10px;border-radius:50%;'
            f'background:{colour};opacity:{opacity};margin-right:4px;"></span>'
        )
    if score is not None and any(mentions.values()):
        parts.append(
            f'<span style="font-size:12px;color:#666;margin-left:4px;">{int(score*100)}%</span>'
        )
    if hc_rating is not None:
        count_txt = f" ({hc_count:,})" if hc_count else ""
        parts.append(
            f'<span style="font-size:12px;color:#666;margin-left:10px;">'
            f'<span style="color:#f5a623;">★</span>{hc_rating:.1f}{count_txt}</span>'
        )
    st.markdown("".join(parts), unsafe_allow_html=True)

    if breakdown:
        rows = []
        for p, data in breakdown.items():
            pct = int((data.get("positive_pct") or 0) * 100)
            rows.append(
                f"- **{PLATFORM_LABELS.get(p, p)}**: {pct}% positive "
                f"({int(data.get('mentions', 0))} mentions, "
                f"+{int(data.get('positive', 0))} / "
                f"{int(data.get('neutral', 0))} / "
                f"-{int(data.get('negative', 0))})"
            )
        with st.expander("per-platform breakdown"):
            st.markdown("\n".join(rows))

    if subjects:
        st.caption("Subjects (Open Library): " + ", ".join(subjects[:5]))


st.title("Recommender demo")

col_query, col_strategy = st.columns([2, 1])

with col_query:
    mode = st.radio("Query type", ["ISBN seed", "Free-text seed"], horizontal=True)
    if mode == "ISBN seed":
        seed_isbn = st.text_input(
            "Seed book ISBN",
            value="9780006480099",
            help="Try 9780006480099 (Assassin's Apprentice - has real reception data)",
        )
        seed_text = None
    else:
        seed_text = st.text_area(
            "Seed text",
            value="an epic fantasy adventure with wizards and dragons",
            height=80,
        )
        seed_isbn = None

with col_strategy:
    strategy = st.selectbox(
        "Re-rank strategy",
        options=["semantic", "cross-encoder", "linear", "learned"],
        index=0,
    )
    k = st.slider("Top-k", 3, 30, 12)
    enrich = st.checkbox(
        "Enrich live (Open Library + Hardcover)",
        value=True,
        help="Fetch subjects, work_id, and ★ ratings on demand. Adds ~1-3 s.",
    )

if strategy == "linear":
    st.markdown("**Linear blend weights**")
    a = st.slider("alpha (semantic)", 0.0, 1.0, 0.4, 0.05)
    b = st.slider("beta (reception)", 0.0, 1.0, 0.5, 0.05)
    g = st.slider("gamma (diversity)", 0.0, 1.0, 0.1, 0.05)
else:
    a, b, g = 0.7, 0.25, 0.05

if st.button("Recommend", type="primary"):
    params = {"k": k}
    if seed_isbn:
        params["isbn"] = seed_isbn
    if seed_text:
        params["text"] = seed_text
    if strategy != "semantic":
        params["reRank"] = strategy
    if strategy == "linear":
        params.update({"alpha": a, "beta": b, "gamma": g})
    if enrich:
        params["enrichLive"] = "true"

    try:
        r = httpx.get(f"{ML_API}/recommend/similar", params=params, timeout=60.0)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        st.error(f"Request failed: {exc}")
        st.stop()

    st.subheader(f"Strategy: {data.get('strategy')}   -   {len(data['results'])} results")

    cols = st.columns(4)
    for i, item in enumerate(data["results"]):
        with cols[i % 4]:
            if item.get("thumbnail"):
                st.image(item["thumbnail"], use_container_width=True)
            st.markdown(f"**{item['title']}**")
            st.caption(item.get("author", ""))

            final = item.get("final_score") or item.get("score") or 0.0
            st.metric("score", f"{final:.3f}")

            _reception_badges(item)

            with st.expander("features"):
                for key in ("sim_score", "reception_score", "diversity_score",
                            "ce_score", "final_score"):
                    v = item.get(key)
                    if v is not None:
                        st.write(f"- **{key}**: {v:.3f}")
                if item.get("openlibrary_work_id"):
                    st.write(f"- **openlibrary_work_id**: {item['openlibrary_work_id']}")
