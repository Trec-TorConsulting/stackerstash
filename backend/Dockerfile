FROM python:3.12-slim AS builder

WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv venv /app/.venv && uv pip install --python /app/.venv/bin/python -r pyproject.toml

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

RUN groupadd -r app && useradd -r -g app -d /app app
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY . .

RUN mkdir -p /app/media /app/staticfiles && chown -R app:app /app

USER app
EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "60"]

