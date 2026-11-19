import re

from django.conf import settings
from django.contrib import admin
from django.http import HttpResponseForbidden
from django.urls import path, re_path
from django.views.static import serve

from .api import api
from .health import healthz, readyz
from .media_signing import MediaSignatureError, verify_signed_media_path

admin.site.site_header = "Stacker Stash Admin"
admin.site.site_title = "Stacker Stash Operator Portal"


def serve_media(request, path: str):
    """Serve uploaded media files only when presented with a valid HMAC signature."""
    try:
        rel_path = verify_signed_media_path(path)
    except MediaSignatureError as exc:
        return HttpResponseForbidden(str(exc))
    response = serve(request, rel_path, document_root=settings.MEDIA_ROOT)
    response["Cache-Control"] = "private, max-age=3600, no-transform"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; img-src 'self'"
    response["Referrer-Policy"] = "same-origin"
    return response


media_prefix = re.escape(settings.MEDIA_URL.lstrip("/"))

urlpatterns = [
    path("super-admin/", admin.site.urls),
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("api/v1/", api.urls),
    re_path(rf"^{media_prefix}(?P<path>.*)$", serve_media),
]

