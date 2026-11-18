import io

import numpy as np
from PIL import Image, ImageDraw

from apps.catalog.image_processing import (
    AUTO_CROP_PADDING_RATIO,
    MAX_IMAGE_DIMENSION,
    deskew_tilted_rectangle,
    detect_subject_crop_box,
    generate_image_thumbnail,
    process_item_image,
    rotate_item_image,
)


def _carbon_fiber_mat(width: int, height: int) -> Image.Image:
    """Create a synthetic dark carbon-fiber weave mat background."""
    yy, xx = np.mgrid[0:height, 0:width]
    weave = ((xx // 4 + yy // 4) % 2) * 14 + 26
    arr = np.stack([weave, weave + 1, weave + 3], axis=-1).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def test_padding_ratio_is_six_percent():
    assert 0.05 <= AUTO_CROP_PADDING_RATIO <= 0.08


def test_detect_subject_crop_box_coin_with_six_percent_padding():
    img = _carbon_fiber_mat(600, 600)
    draw = ImageDraw.Draw(img)
    # Centered silver coin of radius 140 (diameter 280)
    draw.ellipse((160, 160, 440, 440), fill=(210, 212, 216), outline=(140, 142, 148), width=4)
    draw.ellipse((185, 185, 415, 415), outline=(170, 172, 176), width=2)

    box = detect_subject_crop_box(img, shape_hint="coin")
    assert box is not None
    left, top, right, bottom = box
    # Must include breathing room outside the coin rim (160..440)
    assert left <= 150
    assert top <= 150
    assert right >= 450
    assert bottom >= 450
    # Must still tighten significantly vs 600x600
    assert (right - left) < 420
    assert (bottom - top) < 420


def test_detect_subject_crop_box_dark_slab_on_dark_mat():
    img = _carbon_fiber_mat(600, 800)
    draw = ImageDraw.Draw(img)
    # Dark-framed slab with lighter label at top and coin in center
    draw.rectangle((170, 140, 430, 660), fill=(48, 52, 60), outline=(95, 102, 112), width=3)
    draw.rectangle((186, 156, 414, 240), fill=(230, 232, 236))
    draw.ellipse((220, 320, 380, 480), fill=(195, 198, 204), outline=(130, 134, 140), width=3)

    box = detect_subject_crop_box(img, shape_hint="rect")
    assert box is not None
    left, top, right, bottom = box
    # Should capture the full slab height rather than cropping only the white label
    assert left <= 170
    assert top <= 140
    assert right >= 430
    assert bottom >= 650


def test_detect_subject_crop_box_ignores_small_glare_patch_on_dark_background():
    img = _carbon_fiber_mat(600, 600)
    draw = ImageDraw.Draw(img)
    # Small blown-out glare patch (only ~5% of frame) with no actual collectible border
    draw.ellipse((240, 240, 360, 360), fill=(252, 252, 252))

    box = detect_subject_crop_box(img)
    assert box is None


def test_deskew_tilted_rectangle_straightens_without_clipping_and_skips_coins():
    img = _carbon_fiber_mat(700, 700)
    # Draw a 7-degree tilted banknote/slab rectangle
    card = Image.new("RGB", (320, 180), (218, 204, 165))
    cdraw = ImageDraw.Draw(card)
    cdraw.rectangle((0, 0, 319, 179), outline=(70, 58, 35), width=5)
    cdraw.rectangle((20, 20, 299, 159), outline=(110, 95, 65), width=2)
    tilted = card.rotate(-7.0, expand=True, fillcolor=(28, 29, 31))
    img.paste(tilted, (350 - tilted.width // 2, 350 - tilted.height // 2))

    deskewed, applied_deg = deskew_tilted_rectangle(img, shape_hint="rect")
    assert 3.0 <= abs(applied_deg) <= 11.0

    # End-to-end process_item_image should deskew + crop cleanly around the note
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out_bytes, out_w, out_h, _ = process_item_image(
        buf.getvalue(), enhance=False, auto_crop=True, shape_hint="rect"
    )
    assert out_w < 460
    assert out_h < 320
    assert out_w > out_h

    # Circular coin must never be rotated
    _, coin_deg = deskew_tilted_rectangle(img, shape_hint="coin")
    assert coin_deg == 0.0


def test_webp_encoding_dimension_cap_thumbnail_and_rgba_preservation():
    assert MAX_IMAGE_DIMENSION == 1600

    # Large opaque PNG (>1600px) -> WebP <= 1600px
    big = Image.new("RGB", (2400, 1800), (140, 120, 90))
    buf = io.BytesIO()
    big.save(buf, format="PNG")
    out_bytes, out_w, out_h, out_ext = process_item_image(buf.getvalue(), enhance=False)
    assert out_ext == "webp"
    assert max(out_w, out_h) == 1600

    # Thumbnail <= 480px WebP
    t_bytes, tw, th, t_ext = generate_image_thumbnail(out_bytes)
    assert t_ext == "webp"
    assert max(tw, th) == 480
    assert len(t_bytes) > 0

    # RGBA cutout preserves alpha as PNG
    rgba = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rgba)
    rdraw.ellipse((60, 60, 340, 340), fill=(210, 210, 210, 255))
    rbuf = io.BytesIO()
    rgba.save(rbuf, format="PNG")
    rot_bytes, _, _, rot_ext = rotate_item_image(rbuf.getvalue(), degrees=90)
    assert rot_ext == "png"
    with Image.open(io.BytesIO(rot_bytes)) as checked:
        assert checked.mode == "RGBA"
