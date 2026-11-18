from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from PIL import Image, ImageOps

from apps.catalog.api import _RECTANGULAR_DOCUMENT_LABELS, _item_shape_hint
from apps.catalog.image_processing import (
    deskew_tilted_rectangle,
    detect_subject_crop_box,
    process_item_image,
)
from apps.catalog.models import ItemPhoto


class Command(BaseCommand):
    help = "Idempotently deskew and re-crop existing ItemPhoto assets with consistent 6% padding."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Audit photos and report planned changes without modifying files or database rows.",
        )
        parser.add_argument(
            "--workspace",
            type=str,
            default=None,
            help="Filter by workspace slug or UUID.",
        )
        parser.add_argument(
            "--item-id",
            type=str,
            default=None,
            help="Filter by CollectionItem UUID.",
        )
        parser.add_argument(
            "--backup-dir",
            type=str,
            default=None,
            help="Directory to store backups of original photos before overwriting.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of ItemPhoto records to inspect.",
        )

    def handle(self, *args, **options) -> None:
        dry_run: bool = bool(options["dry_run"])
        workspace_filter: str | None = options["workspace"]
        item_id: str | None = options["item_id"]
        backup_dir_opt: str | None = options["backup_dir"]
        limit: int | None = options["limit"]

        qs = ItemPhoto.objects.select_related("item", "workspace").order_by("created_at", "id")
        if workspace_filter:
            try:
                ws_uuid = uuid.UUID(workspace_filter)
                qs = qs.filter(workspace_id=ws_uuid)
            except ValueError:
                qs = qs.filter(workspace__slug=workspace_filter)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if limit is not None and limit > 0:
            qs = qs[:limit]

        backup_dir: Path | None = None
        if not dry_run:
            if backup_dir_opt:
                backup_dir = Path(backup_dir_opt)
            else:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                media_root = Path(getattr(settings, "MEDIA_ROOT", "") or ".")
                backup_dir = media_root / "recrop_backups" / stamp
            backup_dir.mkdir(parents=True, exist_ok=True)

        inspected = 0
        updated = 0
        skipped = 0
        errors = 0

        for photo in qs:
            inspected += 1
            if not photo.image:
                skipped += 1
                continue

            try:
                with photo.image.open("rb") as fh:
                    raw_bytes = fh.read()
                with Image.open(io.BytesIO(raw_bytes)) as opened:
                    img = ImageOps.exif_transpose(opened)
                    orig_w, orig_h = img.size

                shape_hint = _item_shape_hint(photo.item, photo.label)
                if shape_hint is None and photo.label in _RECTANGULAR_DOCUMENT_LABELS:
                    shape_hint = "rect"

                deskewed, applied_deg = deskew_tilted_rectangle(img, shape_hint=shape_hint)
                box = detect_subject_crop_box(deskewed, shape_hint=shape_hint)

                if applied_deg == 0.0 and box is None:
                    skipped += 1
                    self.stdout.write(
                        f"SKIP {photo.id} ({photo.item.title} [{photo.label}]): already tight or low confidence"
                    )
                    continue

                if dry_run:
                    updated += 1
                    self.stdout.write(
                        f"WOULD UPDATE {photo.id} ({photo.item.title} [{photo.label}]): "
                        f"orig={orig_w}x{orig_h} deskew={applied_deg}deg crop_box={box}"
                    )
                    continue

                assert backup_dir is not None
                orig_name = os.path.basename(photo.image.name) or f"{photo.id}.jpg"
                backup_path = backup_dir / f"{photo.id}_{orig_name}"
                backup_path.write_bytes(raw_bytes)

                processed_bytes, new_w, new_h, ext = process_item_image(
                    raw_bytes,
                    remove_background=False,
                    enhance=False,
                    shape_hint=shape_hint,
                    auto_crop=True,
                )
                old_name = photo.image.name
                new_filename = f"photo-{photo.label.lower()}-recrop.{ext}"
                photo.image.save(new_filename, ContentFile(processed_bytes), save=False)
                photo.width = new_w
                photo.height = new_h
                photo.save(update_fields=["image", "width", "height"])

                if old_name and old_name != photo.image.name:
                    try:
                        photo.image.storage.delete(old_name)
                    except Exception:
                        pass

                updated += 1
                self.stdout.write(
                    f"UPDATED {photo.id} ({photo.item.title} [{photo.label}]): "
                    f"{orig_w}x{orig_h} -> {new_w}x{new_h} (deskew={applied_deg}deg)"
                )
            except Exception as exc:
                errors += 1
                self.stderr.write(f"ERROR {photo.id}: {exc}")

        mode_label = "DRY-RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.SUCCESS(
                f"[{mode_label}] Inspected: {inspected}, Updated: {updated}, Skipped: {skipped}, Errors: {errors}"
            )
        )
