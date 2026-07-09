"""Recommender demo page: choose a book, view similar recommendations under
several re-ranking strategies, inspect per-candidate feature breakdowns.
"""

import os

import httpx
import streamlit as st

ML_API = os.environ.get("ML_API_URL", "http://ml-service:8000")

st.title("Recommender demo")

col_query, col_strategy = st.columns([2, 1])

with col_query:
    mode = st.radio("Query type", ["ISBN seed", "Free-text seed"], horizontal=True)
    if mode == "ISBN seed":
        seed_isbn = st.text_input("Seed book ISBN", value="9780345339683",
                                  help="Any ISBN from the loaded Kaggle 7k catalogue")
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

if strategy == "linear":
    st.markdown("**Linear blend weights**")
    a = st.slider("alpha (semantic)", 0.0, 1.0, 0.7, 0.05)
    b = st.slider("beta (reception)", 0.0, 1.0, 0.25, 0.05)
    g = st.slider("gamma (diversity)", 0.0, 1.0, 0.05, 0.05)
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

    try:
        r = httpx.get(f"{ML_API}/recommend/similar", params=params, timeout=30.0)
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

            with st.expander("features"):
                for key in ("sim_score", "reception_score", "diversity_score",
                            "ce_score", "final_score"):
                    v = item.get(key)
                    if v is not None:
                        st.write(f"- **{key}**: {v:.3f}")
                mentions = item.get("mentions_by_platform") or {}
                if mentions:
                    st.write("- **mentions_by_platform**:", mentions)
