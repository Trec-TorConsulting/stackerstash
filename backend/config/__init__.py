from pillow_heif import register_heif_opener

from .celery import app as celery_app

register_heif_opener()

__all__ = ("celery_app",)

