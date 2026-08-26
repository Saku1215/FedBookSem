# fedbook-ml

Python ML service for FedBook-Sem. Runs entirely inside a Docker container — no local Python needed.

## Quick start

```powershell
# From repo root
docker compose up -d --build ml-service

# Run tests
docker compose exec ml-service pytest -v

# Run a script
docker compose exec ml-service python scripts/seed_kaggle_books.py

# Drop into a shell
docker compose exec ml-service bash
```

## Layout

- `src/fedbook_ml/` — package source
- `scripts/` — one-shot data + training scripts
- `tests/` — pytest suite
- `data/` — gitignored: downloaded datasets
- `models/` — gitignored: trained artefacts (`lightfm.pkl`, `ltr.pkl`, fine-tuned embedder)

## Environment

Configured via `.env` (see `.env.example`). When running under compose, the `ml-service` service inherits Neo4j credentials from the compose file.
