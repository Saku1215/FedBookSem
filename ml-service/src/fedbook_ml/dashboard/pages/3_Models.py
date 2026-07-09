"""Model registry page: which trained artefacts is the ml-service currently
loading, and how big are they?
"""

import os
from pathlib import Path

import httpx
import streamlit as st

ML_API = os.environ.get("ML_API_URL", "http://ml-service:8000")
MODELS_DIR = Path("models")

st.title("Model registry")

# ---- Live service health ----
st.header("Live service state")
try:
    r = httpx.get(f"{ML_API}/health", timeout=5.0)
    r.raise_for_status()
    health = r.json()
except Exception as exc:
    st.error(f"ml-service unreachable: {exc}")
    health = {}

if health:
    col1, col2, col3 = st.columns(3)
    col1.metric("service", health.get("service", "?"))
    col2.metric("LightFM loaded", "yes" if health.get("lightfm_loaded") else "no")
    col3.metric("LTR loaded", "yes" if health.get("ltr_loaded") else "no")

# ---- Artefacts on disk ----
st.header("Artefacts on disk")

if not MODELS_DIR.exists():
    st.info("No models/ directory yet. Train externally and drop artefacts here.")
else:
    rows = []
    for p in sorted(MODELS_DIR.glob("**/*")):
        if p.is_file():
            rows.append({
                "path": str(p.relative_to(MODELS_DIR)),
                "size_MB": round(p.stat().st_size / 1024 / 1024, 2),
            })
    if rows:
        st.dataframe(rows, use_container_width=True)
    else:
        st.info("models/ is empty - nothing trained yet.")

st.header("Expected artefacts")
st.markdown(
    """
    | Artefact                        | Produced by                              | Consumed by                                |
    |---------------------------------|------------------------------------------|--------------------------------------------|
    | `models/lightfm.pkl`            | `scripts/train_lightfm.py` (off-machine) | `/recommend/cf`                            |
    | `models/ltr.pkl`                | `scripts/train_ltr.py` (off-machine)     | `/recommend/similar?reRank=learned`        |
    | `models/finetuned-minilm/`      | `scripts/finetune_embedder.py` (off-machine) | optional `?model=finetuned`             |

    Training scripts are intentionally NOT run on the development laptop -
    build these artefacts on Colab / cloud GPU and drop them into the
    `ml-service/models/` directory (bind-mounted into the container).
    """
)
