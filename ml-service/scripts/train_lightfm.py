"""Train the LightFM WARP hybrid CF model on goodbooks-10k.

CPU-only, ~3-8 minutes for 30 epochs at 64 components. Fits comfortably on
a laptop CPU / lightweight GPU. Writes models/lightfm.pkl which the FastAPI
service loads at startup.

Run:
    docker compose exec ml-service python scripts/download_goodbooks10k.py
    docker compose exec ml-service python scripts/train_lightfm.py
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightfm import LightFM
from lightfm.data import Dataset

DATA = Path(__file__).parent.parent / "data" / "goodbooks-10k" / "goodbooks-10k-master"
OUT = Path(__file__).parent.parent / "models" / "lightfm.pkl"

EPOCHS = 30
NUM_COMPONENTS = 64
POSITIVE_RATING_THRESHOLD = 4  # treat 4-5 star as implicit positive


def main() -> None:
    print(f"Loading ratings.csv from {DATA} ...")
    ratings = pd.read_csv(DATA / "ratings.csv")   # user_id, book_id, rating
    books = pd.read_csv(DATA / "books.csv")       # book_id, authors, original_publication_year, ...

    print(f"  ratings rows: {len(ratings)}")
    print(f"  books rows:   {len(books)}")

    ratings = ratings[ratings["rating"] >= POSITIVE_RATING_THRESHOLD]
    print(f"  positive interactions (>= {POSITIVE_RATING_THRESHOLD} stars): {len(ratings)}")

    # Build per-item features (first author + publication year bucket)
    def _feats(row) -> list[str]:
        author = str(row.get("authors", "")).split(",")[0].strip() or "unknown"
        year = row.get("original_publication_year")
        year_bucket = str(int(year)) if pd.notna(year) else "unknown"
        return [f"author:{author}", f"year:{year_bucket}"]

    books["item_features"] = books.apply(_feats, axis=1)
    all_item_features: set[str] = set()
    for feats in books["item_features"]:
        all_item_features.update(feats)

    print(f"  distinct item features: {len(all_item_features)}")

    ds = Dataset()
    ds.fit(
        users=ratings["user_id"].unique(),
        items=books["book_id"].unique(),
        item_features=all_item_features,
    )

    interactions, _weights = ds.build_interactions(
        (r.user_id, r.book_id) for r in ratings.itertuples(index=False)
    )
    item_features = ds.build_item_features(
        (r.book_id, r.item_features) for r in books.itertuples(index=False)
    )

    print(f"Training LightFM WARP for {EPOCHS} epochs at {NUM_COMPONENTS} components ...")
    model = LightFM(loss="warp", no_components=NUM_COMPONENTS, random_state=42)
    model.fit(
        interactions,
        item_features=item_features,
        epochs=EPOCHS,
        num_threads=4,
        verbose=True,
    )

    user_id_map, _, item_id_map, _ = ds.mapping()
    reverse_item_map = {v: k for k, v in item_id_map.items()}

    from fedbook_ml.ml.lightfm_model import LightFMRecommender
    rec = LightFMRecommender(
        model=model,
        item_features_matrix=item_features,
        user_id_map=user_id_map,
        item_id_map=item_id_map,
        reverse_item_map=reverse_item_map,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(rec, OUT)
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"Saved {OUT}  ({size_mb:.1f} MB)")

    # Quick sanity: recommend for a random user
    sample_user = int(ratings["user_id"].iloc[0])
    picks = rec.recommend(user_id=sample_user, k=5)
    print(f"Sanity check for user {sample_user}: top-5 book_ids = "
          f"{[p['goodbooks_id'] for p in picks]}")


if __name__ == "__main__":
    main()
