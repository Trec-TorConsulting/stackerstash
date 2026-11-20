from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.catalog"
    verbose_name = "Collection Catalog"

    def ready(self) -> None:
        from pillow_heif import register_heif_opener

        register_heif_opener()

