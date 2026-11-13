import re

from django.conf import settings
from django.contrib import admin
from django.urls import path, re_path
from django.views.static import serve

from .api import api
from .health import healthz, readyz

admin.site.site_header = "Stacker Stash Admin"
admin.site.site_title = "Stacker Stash Operator Portal"

def serve_media(request, path: str):
    """Serve uploaded media files from the configured MEDIA_ROOT."""
    return serve(request, path, document_root=settings.MEDIA_ROOT)


media_prefix = re.escape(settings.MEDIA_URL.lstrip("/"))

urlpatterns = [
    path("super-admin/", admin.site.urls),
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("api/v1/", api.urls),
    re_path(rf"^{media_prefix}(?P<path>.*)$", serve_media),
]

