# Stage 1: build deps (gcc/libpq-dev needed for C extensions, stays here)
FROM python:3.12-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: lean runtime (no build tools, non-root user)
FROM python:3.12-slim
WORKDIR /app
RUN useradd -m appuser && mkdir -p /home/appuser/.local && chown -R appuser:appuser /home/appuser
COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appuser ./app ./app
COPY --chown=appuser:appuser alembic.ini ./alembic.ini
COPY --chown=appuser:appuser alembic ./alembic
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONOPTIMIZE=1
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--loop", "uvloop", "--log-level", "warning"]
