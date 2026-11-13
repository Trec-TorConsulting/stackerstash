from django.contrib import admin

from .models import SpotPriceSnapshot, ValuationHistory


@admin.register(SpotPriceSnapshot)
class SpotPriceSnapshotAdmin(admin.ModelAdmin):
    list_display = ("metal_type", "price_usd_per_troy_oz", "source", "fetched_at")
    list_filter = ("metal_type", "source")


@admin.register(ValuationHistory)
class ValuationHistoryAdmin(admin.ModelAdmin):
    list_display = ("item", "market_value_unit", "melt_value_unit", "source", "is_estimate", "recorded_at")
    list_filter = ("source", "is_estimate")

