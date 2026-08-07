# Backend (FastAPI + LangGraph) image for Fly.io.
FROM python:3.12-slim

# uv for fast, locked dependency installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Install dependencies first (cached layer). --no-install-project: we run from src/
# directly, so the app doesn't need to be pip-installed as a package.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# App code.
COPY src ./src

ENV PORT=8080 \
    PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uv", "run", "--no-sync", "python", "src/run_service.py"]
