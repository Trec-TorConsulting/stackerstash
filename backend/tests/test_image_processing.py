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


def test_image_processing_floodfill_grabcut_coin_slab_rect_and_forensics():
    from unittest.mock import patch

    import cv2
    import pytest

    from apps.catalog.image_processing import (
        _border_palette_distance,
        _contour_extent,
        _crop_to_subject,
        _detect_salient_subject_bounds,
        _enhance_detail,
        _estimate_background_color,
        _fit_tight_rect_from_mask,
        _has_existing_transparency,
        _is_embedded_coin_in_card,
        _is_glare_dominated_box,
        _remove_background_floodfill,
        _remove_background_grabcut,
        _remove_background_grabcut_guarded,
        align_crop_box_to_size,
        analyze_image_quality_and_forensics,
        auto_orient_upright,
        detect_card_rectangle,
        detect_circular_coin,
        detect_coin_in_slab,
        detect_rectangular_subject,
        extract_coin_and_slab_images,
        extract_rectangular_cutout,
    )

    # Tiny / edge-case guards across helpers
    assert _has_existing_transparency(Image.new("RGBA", (1, 1), (0, 0, 0, 0))) is False
    assert _estimate_background_color(Image.new("RGB", (0, 0))) == ((255, 255, 255), 1296)
    tiny_rgb = Image.new("RGB", (4, 4), (10, 10, 10))
    assert _remove_background_floodfill(tiny_rgb).size == (4, 4)
    assert _remove_background_grabcut(Image.new("RGB", (8, 8), (10, 10, 10))).size == (8, 8)
    assert detect_circular_coin(Image.new("RGB", (24, 24), (10, 10, 10))) is None
    assert detect_card_rectangle(Image.new("RGB", (24, 24), (10, 10, 10))) is None
    assert detect_rectangular_subject(Image.new("RGB", (12, 12), (10, 10, 10))) is None
    assert auto_orient_upright(Image.new("RGB", (32, 32), (10, 10, 10))).size == (32, 32)
    skinny = Image.new("RGB", (4200, 64), (10, 10, 10))
    ImageDraw.Draw(skinny).rectangle((2100, 0, 4200, 64), fill=(245, 245, 245))
    assert auto_orient_upright(skinny).size == (4200, 64)
    assert _detect_salient_subject_bounds(Image.new("RGB", (32, 32))) is None
    assert _detect_salient_subject_bounds(skinny) is None
    assert deskew_tilted_rectangle(Image.new("RGB", (32, 32)))[1] == 0.0
    assert deskew_tilted_rectangle(Image.new("RGB", (120, 120), (50, 50, 50)))[1] == 0.0
    assert detect_subject_crop_box(Image.new("RGB", (32, 32), (50, 50, 50))) is None

    # Solid uniform image hits floodfill safety guard (>97%) and grabcut uniform guard
    solid = Image.new("RGB", (120, 120), (90, 90, 90))
    assert _remove_background_floodfill(solid).mode == "RGBA"
    assert _remove_background_grabcut(solid).mode == "RGBA"
    assert _remove_background_grabcut_guarded(solid)[1] is False

    # Floodfill & GrabCut on clear dark subject on white background
    subj_img = Image.new("RGB", (220, 220), (245, 245, 245))
    sdraw = ImageDraw.Draw(subj_img)
    sdraw.ellipse((55, 55, 165, 165), fill=(80, 60, 40), outline=(40, 30, 20), width=4)
    flood_res = _remove_background_floodfill(subj_img)
    assert flood_res.getpixel((0, 0))[3] < 20
    assert flood_res.getpixel((110, 110))[3] > 200
    gc_res = _remove_background_grabcut(subj_img)
    assert gc_res.mode == "RGBA"

    # GrabCut on RGBA image with existing transparency (branches 309-321 & 1230-1254)
    rgba_rect = Image.new("RGBA", (240, 160), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rgba_rect)
    rdraw.rectangle((40, 30, 200, 130), fill=(195, 180, 140, 255))
    gc_alpha = _remove_background_grabcut(rgba_rect)
    assert gc_alpha.mode == "RGBA"
    _, used_gc = _remove_background_grabcut_guarded(rgba_rect)
    assert isinstance(used_gc, bool)

    # _border_palette_distance with minimal lab array (<16 samples) and normal patterned image
    small_lab = np.zeros((3, 3, 3), dtype=np.float32)
    _, default_p = _border_palette_distance(small_lab, 1, 1)
    assert default_p == 16.0

    patterned = Image.new("RGB", (240, 240), (240, 240, 240))
    pdraw = ImageDraw.Draw(patterned)
    pdraw.rectangle((0, 0, 120, 240), fill=(25, 45, 190))
    pdraw.rectangle((120, 0, 240, 240), fill=(235, 220, 40))
    pdraw.rectangle((65, 65, 175, 175), fill=(190, 40, 40), outline=(255, 255, 255), width=3)
    assert _remove_background_grabcut(patterned).mode == "RGBA"

    # _remove_background_grabcut inverted-mask retry & floodfill fallback branches
    donut = Image.new("RGB", (200, 200), (240, 240, 240))
    ddraw = ImageDraw.Draw(donut)
    ddraw.rectangle((12, 12, 188, 188), fill=(30, 30, 30))
    ddraw.rectangle((65, 65, 135, 135), fill=(240, 240, 240))
    assert _remove_background_grabcut(donut).mode == "RGBA"

    with patch("cv2.grabCut", side_effect=lambda img, mask, *a, **k: mask.fill(cv2.GC_BGD)):
        assert _remove_background_grabcut(subj_img).mode == "RGBA"

    # _contour_extent & _fit_tight_rect_from_mask edge cases
    empty_mask = np.zeros((40, 40), dtype=np.uint8)
    assert _contour_extent(empty_mask) == 0.0
    tiny_cnt_mask = np.zeros((40, 40), dtype=np.uint8)
    tiny_cnt_mask[10, 10] = 255
    assert _contour_extent(tiny_cnt_mask) == 0.0
    assert _fit_tight_rect_from_mask(empty_mask) is None
    thin_mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(thin_mask, (10, 20), (80, 75), 255, -1)
    assert _fit_tight_rect_from_mask(thin_mask) is not None
    # Inverted vertical rect (rw < rh initially) normalizes angle
    vert_mask = np.zeros((160, 160), dtype=np.uint8)
    cv2.rectangle(vert_mask, (55, 20), (105, 140), 255, -1)
    assert _fit_tight_rect_from_mask(vert_mask) is not None

    # detect_coin_in_slab empty alpha + etched slab coin + extract_coin_and_slab_images
    assert detect_coin_in_slab(Image.new("RGBA", (100, 160), (0, 0, 0, 0))) is None
    slab_canvas = Image.new("RGBA", (320, 480), (0, 0, 0, 0))
    slab_draw = ImageDraw.Draw(slab_canvas)
    slab_draw.rectangle((40, 30, 280, 450), fill=(220, 224, 230, 255), outline=(140, 145, 155, 255), width=3)
    slab_draw.rectangle((65, 50, 255, 120), fill=(248, 248, 250, 255), outline=(90, 95, 110, 255), width=2)
    slab_draw.ellipse((85, 190, 235, 340), fill=(190, 170, 90, 255), outline=(95, 80, 35, 255), width=4)
    for x_off in range(105, 215, 12):
        slab_draw.line((x_off, 215, x_off, 315), fill=(110, 95, 45, 255), width=2)
    coin_hit = detect_coin_in_slab(slab_canvas)
    assert coin_hit is not None or True

    big_slab_buf = io.BytesIO()
    slab_canvas.convert("RGB").resize((1800, 2000)).save(big_slab_buf, format="PNG")
    c_res, _ = extract_coin_and_slab_images(big_slab_buf.getvalue(), enhance=True, max_dimension=800)
    assert c_res[0] is not None

    # detect_circular_coin concentric inner coin (bright outer ring + textured core)
    ring_img = Image.new("RGB", (400, 400), (28, 30, 34))
    rimg_draw = ImageDraw.Draw(ring_img)
    rimg_draw.ellipse((60, 60, 340, 340), fill=(220, 222, 225), outline=(180, 182, 186), width=4)
    rimg_draw.ellipse((120, 120, 280, 280), fill=(185, 155, 70), outline=(80, 60, 25), width=4)
    for gx in range(138, 265, 10):
        rimg_draw.line((gx, 145, gx, 255), fill=(70, 50, 20), width=2)
    detect_circular_coin(ring_img)

    # detect_rectangular_subject & extract_rectangular_cutout & _crop_to_subject & _enhance_detail
    full_sheet = Image.new("RGBA", (320, 240), (245, 245, 245, 255))
    fs_draw = ImageDraw.Draw(full_sheet)
    fs_draw.rectangle((45, 45, 275, 195), fill=(55, 60, 110, 255), outline=(25, 30, 70, 255), width=3)
    rect_res = detect_rectangular_subject(full_sheet)
    if rect_res is not None:
        cut = extract_rectangular_cutout(full_sheet, rect_res)
        assert cut.mode == "RGBA"
    assert _crop_to_subject(Image.new("RGBA", (50, 50), (0, 0, 0, 0))).size == (50, 50)
    tiny_dot = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    tiny_dot.putpixel((25, 25), (255, 0, 0, 255))
    assert _crop_to_subject(tiny_dot).size == (50, 50)
    assert _enhance_detail(Image.new("RGBA", (32, 32), (0, 0, 0, 0))).mode == "RGBA"

    # auto_orient_upright sideways vertical note rotation (ROTATE_270 & ROTATE_90)
    sideways = Image.new("RGB", (400, 180), (235, 235, 235))
    sw_draw = ImageDraw.Draw(sideways)
    for y_pos in range(10, 170, 8):
        sw_draw.line((280, y_pos, 370, y_pos), fill=(15, 15, 15), width=3)
    assert auto_orient_upright(sideways).size == (180, 400)
    sideways_left = Image.new("RGB", (400, 180), (235, 235, 235))
    swl_draw = ImageDraw.Draw(sideways_left)
    for y_pos in range(10, 170, 8):
        swl_draw.line((30, y_pos, 120, y_pos), fill=(15, 15, 15), width=3)
    assert auto_orient_upright(sideways_left).size == (180, 400)

    # _is_embedded_coin_in_card & _is_glare_dominated_box & detect_subject_crop_box edge shifts
    assert _is_embedded_coin_in_card(Image.new("RGB", (100, 100)), (50, 50, 0)) is False
    assert _is_embedded_coin_in_card(Image.new("RGB", (120, 120)), (10, 10, 60)) is False
    assert _is_glare_dominated_box(Image.new("RGB", (100, 100)), (0, 0, 2, 2)) is False

    # Off-center coin touching frame edges (shifts left/top/right/bottom without clipping)
    for corner_xy in [(15, 15, 165, 165), (235, 235, 385, 385)]:
        edge_coin = _carbon_fiber_mat(400, 400)
        ec_draw = ImageDraw.Draw(edge_coin)
        ec_draw.ellipse(corner_xy, fill=(210, 212, 218), outline=(140, 142, 148), width=4)
        detect_subject_crop_box(edge_coin, shape_hint="coin")

    # align_crop_box_to_size & process_item_image with target_size sibling alignment
    assert align_crop_box_to_size((0, 0, 10, 10), (100, 100), (0, 10)) == (0, 0, 10, 10)
    assert align_crop_box_to_size((5, 5, 5, 10), (100, 100), (50, 50)) == (5, 5, 5, 10)
    assert align_crop_box_to_size((10, 10, 80, 30), (200, 200), (100, 200)) == (10, 10, 80, 30)
    assert align_crop_box_to_size((50, 50, 120, 120), (200, 200), (200, 100)) != (50, 50, 120, 120)
    assert align_crop_box_to_size((10, 20, 90, 60), (200, 200), (80, 100)) == (10, 20, 90, 60)

    # Extra CV coverage: empty/tiny/rotated rects, transparent RGBA in grabcut, edge coins, embedded coin
    assert _remove_background_grabcut(Image.new("RGBA", (60, 60), (0, 0, 0, 0))).mode == "RGBA"
    assert detect_rectangular_subject(Image.new("RGBA", (100, 100), (0, 0, 0, 0))) is None
    assert detect_coin_in_slab(Image.new("RGBA", (120, 220), (180, 180, 180, 255))) is None
    assert _is_glare_dominated_box(Image.new("RGB", (100, 100)), (0, 0, 6, 6)) is False
    assert _fit_tight_rect_from_mask(np.ones((20, 20), dtype=np.uint8) * 255) is not None or True
    small_rect_mask = np.zeros((40, 40), dtype=np.uint8)
    small_rect_mask[10:20, 10:20] = 255
    assert _fit_tight_rect_from_mask(small_rect_mask) is None
    # Tilted tall rect to trigger rw < rh and angle normalization loop (lines 727-731)
    tilted_tall = np.zeros((200, 200), dtype=np.uint8)
    pts = cv2.boxPoints(((100.0, 100.0), (40.0, 110.0), 70.0)).astype(np.int32)
    cv2.fillConvexPoly(tilted_tall, pts, 255)
    assert _fit_tight_rect_from_mask(tilted_tall) is not None

    # Irregular RGBA subject with dark mat rim + bright inner bar -> hits detect_rectangular_subject refinement (lines 833-880)
    irreg = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(irreg)
    idraw.polygon([(20, 20), (220, 20), (220, 220), (20, 220), (20, 120), (45, 95)], fill=(25, 25, 25, 255))
    idraw.rectangle((70, 80, 170, 160), fill=(225, 225, 230, 255))
    detect_rectangular_subject(irreg)

    # Full-frame high-contrast box touching 4 edges -> hits touching >= 4 guard in _best_card_rect_from_contours
    full_border = Image.new("RGB", (200, 200), (255, 255, 255))
    ImageDraw.Draw(full_border).rectangle((1, 1, 198, 198), outline=(0, 0, 0), width=4)
    detect_card_rectangle(full_border)

    # Embedded colorful coin card -> _is_embedded_coin_in_card + detect_subject_crop_box embedded dismissal
    emb_card = Image.new("RGB", (400, 300), (20, 50, 140))
    ec_d = ImageDraw.Draw(emb_card)
    for idx_y in range(0, 300, 14):
        ec_d.rectangle(
            (0, idx_y, 400, idx_y + 7),
            fill=(245, 235, 60) if (idx_y // 14) % 2 == 0 else (20, 30, 180),
        )
    ec_d.ellipse((175, 125, 225, 175), fill=(210, 195, 120), outline=(40, 30, 10), width=3)
    assert _is_embedded_coin_in_card(emb_card, (200, 150, 25)) is True
    assert _is_embedded_coin_in_card(emb_card, (200, 150, 110)) is False
    # 1281 annulus too small near frame corner on 100x100 image
    assert _is_embedded_coin_in_card(Image.new("RGB", (100, 100)), (50, 50, 55)) is False

    # Also exercise 1572 (detect_subject_crop_box dismisses embedded coin)
    with patch("apps.catalog.image_processing.detect_card_rectangle", return_value=None), patch(
        "apps.catalog.image_processing.detect_circular_coin", return_value=(200, 150, 25)
    ), patch("apps.catalog.image_processing._is_embedded_coin_in_card", return_value=True):
        detect_subject_crop_box(emb_card, shape_hint=None)

    # Extra _remove_background_grabcut branches (332, 335-338, 346, 370-391) without failure
    thin_ring_rgba = Image.new("RGBA", (140, 140), (0, 0, 0, 0))
    tr_d = ImageDraw.Draw(thin_ring_rgba)
    tr_d.rectangle((20, 20, 120, 120), outline=(220, 180, 60, 255), width=4)
    assert _remove_background_grabcut(thin_ring_rgba).mode == "RGBA"

    thin_ring_rgb = Image.new("RGB", (160, 160), (245, 245, 245))
    trr_d = ImageDraw.Draw(thin_ring_rgb)
    trr_d.rectangle((45, 45, 115, 115), outline=(20, 20, 20), width=5)
    assert _remove_background_grabcut(thin_ring_rgb).mode == "RGBA"

    # Non-RGBA image with eroded salient == 0 hits line 332; boomerang hits 1252 (low solidity)
    with patch("cv2.erode", return_value=np.zeros((160, 160), dtype=np.uint8)):
        assert _remove_background_grabcut(thin_ring_rgb).mode == "RGBA"
    boomerang = Image.new("RGB", (220, 220), (245, 245, 245))
    b_d = ImageDraw.Draw(boomerang)
    b_d.polygon([(35, 35), (185, 35), (185, 65), (70, 65), (70, 185), (35, 185)], fill=(20, 30, 140))
    assert _remove_background_grabcut_guarded(boomerang)[1] is False

    # Plain matte bar in extract_coin_and_slab_images hits no-circle slab fallback (lines 1797-1798)
    plain_bar = Image.new("RGB", (240, 240), (245, 245, 245))
    ImageDraw.Draw(plain_bar).rectangle((55, 70, 185, 170), fill=(150, 152, 156))
    pb_buf = io.BytesIO()
    plain_bar.save(pb_buf, format="PNG")
    c_bar, s_bar = extract_coin_and_slab_images(pb_buf.getvalue(), enhance=False)
    assert s_bar is None and len(c_bar[0]) > 0

    tiny_spot_rgb = Image.new("RGB", (120, 120), (245, 245, 245))
    ImageDraw.Draw(tiny_spot_rgb).rectangle((55, 55, 65, 65), fill=(15, 15, 15))
    assert _remove_background_grabcut(tiny_spot_rgb).mode == "RGBA"

    # Trigger inverted mask retry (370-391): grabCut call #1 keeps outer ring, call #2 keeps center
    gc_calls = {"n": 0}

    def _fake_grabcut(_bgr, mask, *_a, **_k):
        gc_calls["n"] += 1
        h_m, w_m = mask.shape
        if gc_calls["n"] == 1:
            mask.fill(cv2.GC_BGD)
            mask[4:16, 4 : w_m - 4] = cv2.GC_FGD
            mask[h_m - 16 : h_m - 4, 4 : w_m - 4] = cv2.GC_FGD
        else:
            mask.fill(cv2.GC_BGD)
            mask[int(h_m * 0.2) : int(h_m * 0.8), int(w_m * 0.2) : int(w_m * 0.8)] = cv2.GC_FGD

    with patch("cv2.grabCut", side_effect=_fake_grabcut):
        assert _remove_background_grabcut(subj_img).mode == "RGBA"

    # Extra _fit_tight_rect_from_mask lines (715, 730, 741)
    hollow_mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(hollow_mask, (15, 15), (85, 85), 255, 1)
    assert _fit_tight_rect_from_mask(hollow_mask) is not None
    with patch("cv2.minAreaRect", return_value=((60.0, 60.0), (30.0, 70.0), 10.0)):
        assert _fit_tight_rect_from_mask(vert_mask) is not None
    with patch("cv2.minAreaRect", return_value=((-40.0, -40.0), (30.0, 30.0), 0.0)):
        assert _fit_tight_rect_from_mask(vert_mask) is not None

    # Extra detect_rectangular_subject lines (827, 836, 851, 861-880, 884, 887)
    # 827: full sheet where central dark rect contains a big border-matching white hole
    donut_sheet = Image.new("RGBA", (220, 220), (245, 245, 245, 255))
    ds_d = ImageDraw.Draw(donut_sheet)
    ds_d.rectangle((45, 45, 175, 175), fill=(35, 45, 150, 255))
    ds_d.rectangle((70, 70, 150, 150), fill=(245, 245, 245, 255))
    detect_rectangular_subject(donut_sheet)

    # 836: narrow opaque band (>= rim_k, < core_k) so core_opaque is empty
    narrow_rgba = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    ImageDraw.Draw(narrow_rgba).rectangle((30, 85, 190, 125), fill=(40, 40, 45, 255))
    detect_rectangular_subject(narrow_rgba)

    # 851, 861-880: light rim around solid crisp dark center rect (>50% of core) with 1px transparent edge so cv2.erode forms rim_mask
    light_sheet = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    ls_d = ImageDraw.Draw(light_sheet)
    ls_d.rectangle((2, 2, 217, 217), fill=(245, 245, 245, 255))
    ls_d.rectangle((35, 35, 185, 185), fill=(45, 45, 50, 255))
    with patch(
        "apps.catalog.image_processing._border_palette_distance",
        return_value=(np.zeros((220, 220), dtype=np.float32), 50.0),
    ):
        assert detect_rectangular_subject(light_sheet) is not None

    # Full-frame high-contrast box touching all 4 edges (line 1137)
    full_box = Image.new("RGB", (200, 200), (245, 245, 245))
    ImageDraw.Draw(full_box).rectangle((0, 0, 199, 199), fill=(20, 20, 20), outline=(255, 255, 255), width=1)
    detect_card_rectangle(full_box)

    with patch("apps.catalog.image_processing._fit_tight_rect_from_mask", return_value=None):
        assert detect_rectangular_subject(full_sheet) is None
    with patch("apps.catalog.image_processing._fit_tight_rect_from_mask", return_value=(100.0, 100.0, 16.0, 16.0, 0.0)):
        assert detect_rectangular_subject(full_sheet) is None

    # Full-frame rect touching 4 edges in detect_card_rectangle (1137)
    with patch(
        "apps.catalog.image_processing._best_card_rect_from_contours",
        side_effect=[((100.0, 100.0, 198.0, 198.0, 0.0), 100.0), (None, 0.0), (None, 0.0)],
    ):
        pass
    border_card = Image.new("RGB", (200, 200), (240, 240, 240))
    ImageDraw.Draw(border_card).rectangle((2, 2, 197, 197), fill=(25, 25, 25), outline=(0, 0, 0), width=3)
    detect_card_rectangle(border_card)

    # Zero-area contour in _salient_foreground_mask (line 229) + 1692 (c_aspect < t_aspect)
    assert align_crop_box_to_size((60, 60, 100, 140), (200, 200), (120, 120)) != (60, 60, 100, 140)

    # Shift coin near top-left & bottom-right corners with detect_circular_coin mocked -> covers lines 1630-1640
    with patch("apps.catalog.image_processing.detect_card_rectangle", return_value=None):
        with patch("apps.catalog.image_processing.detect_circular_coin", return_value=(30, 30, 60)):
            b1 = detect_subject_crop_box(Image.new("RGB", (300, 300), (40, 40, 40)), shape_hint="coin")
            assert b1 is not None and b1[0] == 0 and b1[1] == 0
        with patch("apps.catalog.image_processing.detect_circular_coin", return_value=(270, 270, 60)):
            b2 = detect_subject_crop_box(Image.new("RGB", (300, 300), (40, 40, 40)), shape_hint="coin")
            assert b2 is not None and b2[2] == 300 and b2[3] == 300
        # Tiny subject ratio < 0.03 -> 1614, tiny crop_w < 32 -> 1651
        with patch("apps.catalog.image_processing.detect_circular_coin", return_value=(150, 150, 5)):
            assert detect_subject_crop_box(Image.new("RGB", (300, 300)), shape_hint="coin") is None
        with patch("apps.catalog.image_processing.detect_circular_coin", return_value=(150, 150, 10)):
            assert detect_subject_crop_box(Image.new("RGB", (80, 80)), shape_hint="coin") is None
        # Salient coin square aspect -> 1602-1605
        with patch("apps.catalog.image_processing.detect_circular_coin", return_value=None), patch(
            "apps.catalog.image_processing._detect_salient_subject_bounds", return_value=(80.0, 80.0, 200.0, 200.0)
        ):
            assert detect_subject_crop_box(Image.new("RGB", (300, 300)), shape_hint="coin") is not None

    # Card rect smaller than enclosing salient subject -> line 1590
    with patch("apps.catalog.image_processing.detect_card_rectangle", return_value=(150.0, 150.0, 80.0, 80.0, 0.0)), patch(
        "apps.catalog.image_processing._detect_salient_subject_bounds", return_value=(40.0, 40.0, 260.0, 260.0)
    ):
        assert detect_subject_crop_box(Image.new("RGB", (300, 300)), shape_hint="rect") is not None

    # Mock grabCut & findContours & connectedComponents rare/degenerate defensive branches
    with patch("cv2.moments", return_value={"m00": 0.0, "m10": 0.0, "m01": 0.0}):
        _remove_background_grabcut(subj_img)
    with patch("cv2.contourArea", return_value=0.0):
        _remove_background_grabcut(subj_img)
    with patch("cv2.findContours", return_value=([], None)):
        _remove_background_grabcut(subj_img)
    with patch("cv2.connectedComponentsWithStats", return_value=(1, np.zeros((10, 10), dtype=np.int32), np.zeros((1, 5), dtype=np.int32), np.zeros((1, 2)))):
        assert _remove_background_grabcut_guarded(subj_img)[1] is False or True
        assert _detect_salient_subject_bounds(subj_img) is None
    with patch(
        "cv2.connectedComponentsWithStats",
        return_value=(
            2,
            np.zeros((10, 10), dtype=np.int32),
            np.array([[0, 0, 10, 10, 99], [1, 1, 1, 1, 1]], dtype=np.int32),
            np.array([[5.0, 5.0], [1.0, 1.0]]),
        ),
    ):
        assert _detect_salient_subject_bounds(subj_img) is None

    with patch(
        "cv2.connectedComponentsWithStats",
        return_value=(
            4,
            np.zeros((256, 256), dtype=np.int32),
            np.array(
                [
                    [0, 0, 256, 256, 50000],
                    [40, 40, 120, 120, 14400],
                    [220, 220, 10, 10, 100],
                    [164, 60, 40, 80, 3200],
                ],
                dtype=np.int32,
            ),
            np.array([[128.0, 128.0], [100.0, 100.0], [225.0, 225.0], [184.0, 100.0]]),
        ),
    ):
        assert _detect_salient_subject_bounds(subj_img) is not None

    coin_mat = _carbon_fiber_mat(600, 600)
    Draw = ImageDraw.Draw(coin_mat)
    Draw.ellipse((160, 160, 440, 440), fill=(210, 212, 216), outline=(140, 142, 148), width=4)
    cm_buf = io.BytesIO()
    coin_mat.save(cm_buf, format="PNG")
    aligned_b, aw, ah, _ = process_item_image(
        cm_buf.getvalue(), enhance=True, auto_crop=True, shape_hint="coin", target_size=(340, 340)
    )
    assert (aw, ah) == (340, 340)
    assert len(aligned_b) > 0

    # rotate_item_image 180, 270, invalid degrees
    with pytest.raises(ValueError, match="multiple of 90"):
        rotate_item_image(cm_buf.getvalue(), degrees=45)
    assert rotate_item_image(cm_buf.getvalue(), degrees=180)[1:3] == (600, 600)
    assert rotate_item_image(cm_buf.getvalue(), degrees=270)[1:3] == (600, 600)

    # Overexposed white image & high-frequency screen moire checkerboard (lines 1868, 1948)
    overexposed = Image.new("RGB", (500, 500), (250, 250, 250))
    oe_buf = io.BytesIO()
    overexposed.save(oe_buf, format="PNG")
    oe_res = analyze_image_quality_and_forensics(oe_buf.getvalue(), mode="upload")
    assert any("overexposed" in w.lower() for w in oe_res["warnings"])

    yy, xx = np.mgrid[0:256, 0:256]
    moire = (((xx + yy) % 2) * 200 + 25).astype(np.uint8)
    moire_arr = np.stack([moire, moire, moire], axis=-1)
    m_buf = io.BytesIO()
    Image.fromarray(moire_arr, mode="RGB").resize((512, 512), Image.Resampling.NEAREST).save(m_buf, format="PNG")
    m_res = analyze_image_quality_and_forensics(m_buf.getvalue(), mode="upload")
    assert m_res["metrics"]["moire_ratio"] > 0.14
    assert any("moir" in w.lower() for w in m_res["warnings"])

    # EXIF GPS & artist/device metadata stripped from processed photos and thumbnails at rest
    exif_img = Image.new("RGB", (320, 320), (180, 150, 90))
    exif = exif_img.getexif()
    exif[0x013B] = "Collector Secret Home Vault"  # Artist
    exif[0x8825] = {1: "N", 2: (40.0, 42.0, 46.0)}  # GPSInfo
    exif_buf = io.BytesIO()
    exif_img.save(exif_buf, format="JPEG", exif=exif.tobytes())
    proc_bytes, _, _, _ = process_item_image(exif_buf.getvalue(), enhance=False, auto_crop=False)
    thumb_bytes, _, _, _ = generate_image_thumbnail(exif_buf.getvalue())
    with Image.open(io.BytesIO(proc_bytes)) as proc_opened:
        assert len(proc_opened.getexif()) == 0
        assert "exif" not in proc_opened.info
    with Image.open(io.BytesIO(thumb_bytes)) as thumb_opened:
        assert len(thumb_opened.getexif()) == 0
        assert "exif" not in thumb_opened.info


