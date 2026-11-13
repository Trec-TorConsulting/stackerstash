import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("stackerstash")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.conf.imports = ("apps.catalog.auto_sort",)
app.autodiscover_tasks()
