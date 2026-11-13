from django.contrib import admin

from .models import CollectionItem, Container, ItemPhoto


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

