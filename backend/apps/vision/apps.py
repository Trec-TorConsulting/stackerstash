from django.apps import AppConfig


class VisionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.vision"
    verbose_name = "Vision Identification"

    def ready(self) -> None:
        from pillow_heif import register_heif_opener

        register_heif_opener()

