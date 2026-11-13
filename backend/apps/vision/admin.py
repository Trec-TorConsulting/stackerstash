from django.contrib import admin

from .models import IdentificationJob


@admin.register(IdentificationJob)
class IdentificationJobAdmin(admin.ModelAdmin):
    list_display = ("workspace", "provider_used", "status", "created_at")
    list_filter = ("provider_used", "status")
    readonly_fields = ("created_at",)

