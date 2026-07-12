FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/src

RUN apt-get update && \
    apt-get install -y --no-install-recommends git build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# Copy dep manifest + source (needed for editable install to succeed at build time)
COPY pyproject.toml ./
COPY src ./src

# Install runtime + dev + ml deps. Editable install keeps egg-info under /app/src,
# but a compose bind-mount will shadow it — PYTHONPATH=/app/src makes import still work.
RUN pip install -e ".[dev,ml]"

COPY . .

# Placeholder command; Phase 2 overrides to `uvicorn fedbook_ml.api:app --host 0.0.0.0 --port 8000`
CMD ["sleep", "infinity"]
