#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "==> [1/9] Secret scan across tracked files"
PK_START="-----BEGIN "
PK_END="PRIVATE KEY-----"
SECRET_PATTERN="(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9a-zA-Z]{16,}|rk_live_[0-9a-zA-Z]{16,}|ghp_[0-9a-zA-Z]{36}|gho_[0-9a-zA-Z]{36}|xox[baprs]-[0-9a-zA-Z-]{10,}|${PK_START}([A-Z0-9 ]+ )?${PK_END})"
if git -C "$ROOT_DIR" grep -En "$SECRET_PATTERN"; then
  echo "ERROR: Potential hardcoded secret or private key detected in tracked files." >&2
  exit 1
fi
echo "No hardcoded secrets detected."

echo "==> [2/9] Backend lint (ruff)"
cd "$BACKEND_DIR"
.venv/bin/ruff check .

echo "==> [3/9] Backend SAST (bandit)"
.venv/bin/bandit -r apps config -q

echo "==> [4/9] Backend dependency vulnerability audit (pip-audit)"
.venv/bin/pip-audit

echo "==> [5/9] Backend production deployment security check (manage.py check --deploy)"
DJANGO_DEBUG=false \
  DJANGO_SECRET_KEY="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(50))')" \
  DJANGO_ALLOWED_HOSTS=localhost \
  FIELD_ENCRYPTION_KEY="$(.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
  .venv/bin/python manage.py check --deploy

echo "==> [6/9] Backend test suite with 100% coverage gate"
.venv/bin/pytest --cov=apps --cov=config --cov-report=term-missing --cov-fail-under=100

echo "==> [7/9] Frontend dependency audit (npm audit --audit-level=high)"
cd "$FRONTEND_DIR"
npm audit --audit-level=high

echo "==> [8/9] Frontend TypeScript typecheck & 100% coverage gate (vitest)"
npx tsc --noEmit
npm run test:coverage

echo "==> [9/9] Frontend production build"
npm run build

echo "All security, static analysis, and 100% test coverage checks passed."
