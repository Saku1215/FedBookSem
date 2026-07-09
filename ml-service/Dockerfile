FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=600 \
    PYTHONPATH=/app/src

RUN apt-get update && \
    apt-get install -y --no-install-recommends git build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# Copy dep manifest + source (needed for editable install to succeed at build time)
COPY pyproject.toml ./
COPY src ./src

# Install CPU-only PyTorch first from PyTorch's dedicated index (avoids ~1.5GB of
# CUDA/GPU libraries we don't need on this laptop).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1

# Install everything else from PyPI. Editable install keeps egg-info under
# /app/src, but a compose bind-mount will shadow it - PYTHONPATH=/app/src makes
# import still work.
RUN pip install -e ".[dev,ml,ingest,dashboard]"

COPY . .

# Default command: run the FastAPI service. docker-compose overrides this for
# the ml-dashboard service (Streamlit) and one-shot ingest scripts.
CMD ["uvicorn", "fedbook_ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
