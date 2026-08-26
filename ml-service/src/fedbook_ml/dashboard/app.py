"""Streamlit research dashboard for the FedBook-Sem ML recommender.

Run:
    docker compose up -d ml-dashboard
    open http://localhost:8501

Two pages:
    1. Recommender demo (search a book, view similar with reception badges)
    2. Model registry (loaded artefacts + sizes + metadata)

Evaluation page is intentionally omitted per project scope.
"""

import streamlit as st

st.set_page_config(
    page_title="FedBook-Sem ML",
    page_icon="[book]",
    layout="wide",
)

st.title("FedBook-Sem  -  ML Recommender Dashboard")

st.markdown(
    """
    Explore the semantic + sentiment-aware book recommender that layers on top
    of the federated social bookstore. Use the pages in the sidebar.

    - **Recommender** - pick a book and see similar titles under different
      re-ranking strategies (semantic only, cross-encoder, linear sentiment
      blend, LightGBM learned fusion).
    - **Models** - inspect which trained artefacts the service currently has
      loaded.
    """
)

with st.sidebar:
    st.markdown("### About")
    st.write(
        "Dissertation project R26-IT-107 / IT22922670. "
        "This dashboard talks to the fedbook-ml FastAPI service on :8000."
    )
