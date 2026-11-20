"""Django settings for Stacker Stash."""

from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from celery.schedules import crontab
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() in {"1", "true", "yes"}
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "dev-insecure-secret-key-change-in-production" if DEBUG else "",
)
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")

# Fernet key for encrypting BYOK provider credentials at rest.
_raw_enc_key = os.getenv("FIELD_ENCRYPTION_KEY", "")
if _raw_enc_key:
    FIELD_ENCRYPTION_KEY = _raw_enc_key.encode("utf-8")
elif DEBUG:
    digest = hashlib.sha256(SECRET_KEY.encode("utf-8")).digest()
    FIELD_ENCRYPTION_KEY = base64.urlsafe_b64encode(digest)
else:
    raise RuntimeError("FIELD_ENCRYPTION_KEY must be set when DJANGO_DEBUG is false.")

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0,*").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "apps.accounts",
    "apps.catalog",
    "apps.valuation",
    "apps.vision",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "config.api.api_security_headers_middleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


def _build_databases() -> dict:
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }
    parsed = urlparse(db_url)
    if parsed.scheme in {"postgres", "postgresql"}:
        query_params = parse_qs(parsed.query)
        sslmode = (
            (query_params.get("sslmode") or [""])[0].strip()
            or os.getenv("DB_SSLMODE", "").strip()
        )
        db_cfg: dict = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": parsed.hostname or "localhost",
            "PORT": str(parsed.port or 5432),
            "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        }
        if sslmode:
            db_cfg["OPTIONS"] = {"sslmode": sslmode}
        return {"default": db_cfg}
    raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")


DATABASES = _build_databases()

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", str(BASE_DIR / "media")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS & CSRF
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
    ).split(",")
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [*default_headers, "x-workspace-id"]

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000",
    ).split(",")
    if o.strip()
]

# Security headers for production
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "false").lower() in {"1", "true", "yes"}
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = os.getenv("SECURE_HSTS_PRELOAD", "false").lower() in {"1", "true", "yes"}

READY_CHECK_REDIS = os.getenv("READY_CHECK_REDIS", "false" if DEBUG else "true").lower() in {
    "1",
    "true",
    "yes",
}

# JWT config
JWT_ACCESS_TTL_SECONDS = int(os.getenv("JWT_ACCESS_TTL_SECONDS", "86400"))

# Self-hosted Ollama SSRF allowlist (includes common local/cluster defaults or explicit OLLAMA_ALLOWED_HOSTS)
OLLAMA_ALLOWED_HOSTS = [
    h.strip().lower()
    for h in os.getenv(
        "OLLAMA_ALLOWED_HOSTS",
        "ollama.local,localhost,127.0.0.1,ollama.ollama.svc.cluster.local",
    ).split(",")
    if h.strip()
]

# Subscription Tiers & Stripe Billing
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
BILLING_ENFORCE_TIERS = os.getenv("BILLING_ENFORCE_TIERS", "true").lower() in {
    "1",
    "true",
    "yes",
}
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_PRICE_PLUS = os.getenv("STRIPE_PRICE_PLUS", "").strip()
STRIPE_PRICE_UNLIMITED = os.getenv("STRIPE_PRICE_UNLIMITED", "").strip()
STRIPE_PRICE_DEDICATED = os.getenv("STRIPE_PRICE_DEDICATED", "").strip()

# Celery / Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() in {
    "1",
    "true",
    "yes",
}

CELERY_BEAT_SCHEDULE = {
    "refresh-spot-prices-every-5-minutes": {
        "task": "apps.valuation.tasks.refresh_spot_prices_task",
        "schedule": 300.0,
    },
    "process-deferred-ai-enrichment-every-15-minutes": {
        "task": "apps.valuation.tasks.process_deferred_ai_enrichment_task",
        "schedule": 900.0,
    },
    "sync-weekly-static-catalog": {
        "task": "apps.catalog.tasks.sync_weekly_static_catalog_task",
        "schedule": crontab(minute=0, hour=3, day_of_week=0),
    },
    "sync-daily-reference-baselines": {
        "task": "apps.catalog.tasks.sync_daily_reference_baselines_task",
        "schedule": crontab(minute=0, hour=4),
    },
    "sync-hourly-market-baselines": {
        "task": "apps.catalog.tasks.sync_hourly_market_baselines_task",
        "schedule": crontab(minute=5),
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("LOG_LEVEL", "INFO"),
    },
}

