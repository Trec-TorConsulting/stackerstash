from django.db import migrations
from django.utils import timezone


def backfill_auto_sort(apps, schema_editor):
    from apps.catalog.auto_sort import classify_item_deterministic

    CollectionItem = apps.get_model("catalog", "CollectionItem")
    now = timezone.now()
    to_update = []
    for item in CollectionItem.objects.filter(sort_override=False):
        res = classify_item_deterministic(item)
        item.sort_category = res.sort_category
        item.sort_subcategory = res.sort_subcategory
        item.sort_updated_at = now
        to_update.append(item)

    if to_update:
        CollectionItem.objects.bulk_update(
            to_update, ["sort_category", "sort_subcategory", "sort_updated_at"], batch_size=250
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0006_collectionitem_sort_category_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_auto_sort, noop),
    ]

