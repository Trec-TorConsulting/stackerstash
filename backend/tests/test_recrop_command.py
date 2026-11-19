import io
from pathlib import Path

import numpy as np
import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from PIL import Image, ImageDraw

from apps.accounts.models import Workspace
from apps.catalog.models import CollectionItem, ItemPhoto


def _uncropped_coin_bytes() -> bytes:
    yy, xx = np.mgrid[0:600, 0:600]
    weave = ((xx // 4 + yy // 4) % 2) * 12 + 28
    arr = np.stack([weave, weave + 1, weave + 3], axis=-1).astype(np.uint8)
    img = Image.fromarray(arr, mode="RGB")
    draw = ImageDraw.Draw(img)
    draw.ellipse((180, 180, 420, 420), fill=(212, 214, 218), outline=(140, 142, 148), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _blank_mat_bytes() -> bytes:
    img = Image.new("RGB", (400, 400), (30, 32, 36))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


@pytest.mark.django_db
def test_recrop_collection_photos_dry_run_apply_backup_and_idempotency(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path / "media")

    user = get_user_model().objects.create_user(email="recrop@example.com", password="pw")
    ws = Workspace.objects.create(name="Recrop Vault", slug="recrop-vault", owner=user)
    item = CollectionItem.objects.create(
        workspace=ws,
        title="2023 Silver Round",
        category=CollectionItem.Category.COIN,
        metal_type=CollectionItem.MetalType.SILVER,
    )

    uncropped_bytes = _uncropped_coin_bytes()
    photo = ItemPhoto.objects.create(
        workspace=ws,
        item=item,
        label=ItemPhoto.Label.OBVERSE,
        is_primary=True,
        width=600,
        height=600,
    )
    photo.image.save("uncropped.jpg", ContentFile(uncropped_bytes), save=True)

    blank_photo = ItemPhoto.objects.create(
        workspace=ws,
        item=item,
        label=ItemPhoto.Label.OTHER,
        is_primary=False,
        width=400,
        height=400,
    )
    blank_photo.image.save("blank.jpg", ContentFile(_blank_mat_bytes()), save=True)

    # 1. Dry run leaves DB and files untouched
    dry_out = io.StringIO()
    call_command("recrop_collection_photos", "--dry-run", "--workspace", "recrop-vault", stdout=dry_out)
    assert "DRY-RUN" in dry_out.getvalue()
    assert "Updated: 1, Skipped: 1" in dry_out.getvalue()
    photo.refresh_from_db()
    assert photo.width == 600
    assert photo.height == 600

    # 2. Apply with backup directory
    backup_dir = tmp_path / "backups"
    apply_out = io.StringIO()
    call_command(
        "recrop_collection_photos",
        "--workspace",
        "recrop-vault",
        "--backup-dir",
        str(backup_dir),
        stdout=apply_out,
    )
    assert "APPLIED" in apply_out.getvalue()
    assert "Updated: 1, Skipped: 1, Errors: 0" in apply_out.getvalue()

    photo.refresh_from_db()
    assert photo.width is not None and photo.width < 420
    assert photo.height is not None and photo.height < 420

    backup_files = list(Path(backup_dir).glob(f"{photo.id}_*"))
    assert len(backup_files) == 1
    assert backup_files[0].read_bytes() == uncropped_bytes

    # 3. Second run is idempotent (already-tight photo is skipped)
    second_out = io.StringIO()
    call_command("recrop_collection_photos", "--workspace", "recrop-vault", stdout=second_out)
    assert "Updated: 0, Skipped: 2, Errors: 0" in second_out.getvalue()

    # 4. UUID workspace filter, --item-id, --limit, empty image skip, document label shape hint,
    # deskew-only path (box=None), old_name delete failure, and image open error path
    from unittest.mock import patch

    no_file_photo = ItemPhoto.objects.create(
        workspace=ws, item=item, label=ItemPhoto.Label.OTHER, is_primary=False
    )
    doc_item = CollectionItem.objects.create(workspace=ws, title="Misc Box", category="OTHER")
    doc_photo = ItemPhoto.objects.create(
        workspace=ws, item=doc_item, label=ItemPhoto.Label.SLAB_LABEL, is_primary=True
    )
    doc_photo.image.save("label.jpg", ContentFile(_blank_mat_bytes()), save=True)
    bad_file_photo = ItemPhoto.objects.create(
        workspace=ws, item=doc_item, label=ItemPhoto.Label.OBVERSE, is_primary=False
    )
    bad_file_photo.image.name = "missing/does_not_exist.jpg"
    bad_file_photo.save(update_fields=["image"])

    # Hit UUID filter (68), missing-image skip (94-95), and --limit (74)
    limit_out = io.StringIO()
    call_command(
        "recrop_collection_photos",
        "--dry-run",
        "--workspace",
        str(ws.id),
        "--limit",
        "10",
        stdout=limit_out,
    )
    assert "Inspected:" in limit_out.getvalue()
    assert no_file_photo.id is not None

    # Hit --item-id (72), SLAB_LABEL shape_hint='rect' (106), deskew-only box=None (127),
    # storage.delete warning (149-150), and missing-file ERROR (157-159)
    item_out = io.StringIO()
    item_err = io.StringIO()
    with patch(
        "apps.catalog.management.commands.recrop_collection_photos.deskew_tilted_rectangle",
        return_value=(Image.new("RGB", (200, 120), (220, 220, 220)), 4.0),
    ), patch(
        "apps.catalog.management.commands.recrop_collection_photos.detect_subject_crop_box",
        return_value=None,
    ), patch(
        "django.core.files.storage.FileSystemStorage.delete",
        side_effect=OSError("delete blocked"),
    ):
        call_command(
            "recrop_collection_photos",
            "--item-id",
            str(doc_item.id),
            "--backup-dir",
            str(tmp_path / "b2"),
            stdout=item_out,
            stderr=item_err,
        )
    assert "Updated: 1, Skipped: 0, Errors: 1" in item_out.getvalue()
    assert "WARN delete old" in item_err.getvalue()
    assert "ERROR" in item_err.getvalue()

