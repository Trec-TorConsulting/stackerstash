from __future__ import annotations

from django.conf import settings
from django.db import connection
from django.http import HttpRequest, JsonResponse


def check_db_health() -> tuple[bool, str | None]:
    """Return (healthy, error_detail) for the primary database connection."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True, None
    except Exception as exc:
        return False, str(exc)


def check_redis_health() -> tuple[bool, str | None]:
    """Return (healthy, error_detail) by pinging the configured Redis instance."""
    redis_url = getattr(settings, "REDIS_URL", "")
    if not redis_url:
        return False, "REDIS_URL is not configured."
    try:
        import redis

        client = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
        try:
            client.ping()
        finally:
            client.close()
        return True, None
    except Exception as exc:
        return False, str(exc)


def healthz(request: HttpRequest) -> JsonResponse:
    """Liveness probe: confirms the Django process is responsive."""
    return JsonResponse({"status": "ok"})


def readyz(request: HttpRequest) -> JsonResponse:
    """Readiness probe: confirms database and configured Redis connectivity."""
    db_ok, db_err = check_db_health()
    if not db_ok:
        return JsonResponse({"status": "error", "detail": db_err or "db unavailable"}, status=503)

    if getattr(settings, "READY_CHECK_REDIS", False):
        redis_ok, redis_err = check_redis_health()
        if not redis_ok:
            return JsonResponse(
                {"status": "error", "detail": redis_err or "redis unavailable"}, status=503
            )

    return JsonResponse({"status": "ready"})
