from django.contrib import admin

from .models import (
    CollectionItem,
    Container,
    ItemPhoto,
    ReferenceSyncLog,
    StaticBanknoteSpec,
    StaticCardSpec,
    StaticGradingReference,
    StaticMarketBaseline,
    StaticNumismaticSpec,
)


class ItemPhotoInline(admin.TabularInline):
    model = ItemPhoto
    extra = 0
    readonly_fields = ("width", "height", "created_at")


@admin.register(Container)
class ContainerAdmin(admin.ModelAdmin):
    list_display = ("name", "container_type", "workspace", "parent", "created_at")
    list_filter = ("container_type", "workspace")
    search_fields = ("name", "location_notes")


@admin.register(CollectionItem)
class CollectionItemAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "status",
        "metal_type",
        "quantity",
        "market_value_unit",
        "workspace",
    )
    list_filter = ("category", "status", "metal_type", "grading_service", "is_estimate")
    search_fields = ("title", "cert_number", "serial_number", "mint_or_refiner")
    inlines = [ItemPhotoInline]


@admin.register(ItemPhoto)
class ItemPhotoAdmin(admin.ModelAdmin):
    list_display = ("item", "label", "is_primary", "sort_order", "created_at")
    list_filter = ("label", "is_primary")


@admin.register(StaticNumismaticSpec)
class StaticNumismaticSpecAdmin(admin.ModelAdmin):
    list_display = ("ref_key", "title", "item_kind", "country", "series", "metal_type", "is_key_date")
    list_filter = ("item_kind", "metal_type", "is_key_date", "is_high_counterfeit_risk", "country")
    search_fields = ("ref_key", "title", "series", "denomination")


@admin.register(StaticBanknoteSpec)
class StaticBanknoteSpecAdmin(admin.ModelAdmin):
    list_display = ("ref_key", "title", "record_kind", "denomination", "friedberg_number", "is_scarce_run")
    list_filter = ("record_kind", "denomination", "is_scarce_run", "seal_color")
    search_fields = ("ref_key", "title", "friedberg_number", "charter_number")


@admin.register(StaticCardSpec)
class StaticCardSpecAdmin(admin.ModelAdmin):
    list_display = ("ref_key", "card_game", "set_name", "card_number", "card_name", "rarity")
    list_filter = ("card_game", "set_name", "rarity")
    search_fields = ("ref_key", "card_name", "set_code", "card_number")


@admin.register(StaticGradingReference)
class StaticGradingReferenceAdmin(admin.ModelAdmin):
    list_display = ("ref_key", "grading_service", "record_kind", "asset_class", "tier_name", "fee_usd")
    list_filter = ("grading_service", "record_kind", "asset_class")
    search_fields = ("ref_key", "tier_name", "catalog_ref_key")


@admin.register(StaticMarketBaseline)
class StaticMarketBaselineAdmin(admin.ModelAdmin):
    list_display = ("ref_key", "metric_kind", "symbol", "as_of_date", "value", "last_synced_at")
    list_filter = ("metric_kind", "symbol")
    search_fields = ("ref_key", "symbol")


@admin.register(ReferenceSyncLog)
class ReferenceSyncLogAdmin(admin.ModelAdmin):
    list_display = ("source_name", "sync_tier", "status", "records_upserted", "records_skipped", "started_at")
    list_filter = ("sync_tier", "status")
    search_fields = ("source_name", "error_message")

