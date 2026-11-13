from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from .api import api
from .health import healthz, readyz

admin.site.site_header = "Stacker Stash Admin"
admin.site.site_title = "Stacker Stash Operator Portal"

urlpatterns = [
    path("super-admin/", admin.site.urls),
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("api/v1/", api.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

