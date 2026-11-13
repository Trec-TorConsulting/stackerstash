from __future__ import annotations

import io
from collections import deque
from typing import Any

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

MAX_IMAGE_DIMENSION = 2400
CROP_PADDING_RATIO = 0.015


def _color_distance_sq(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> int:
    dr = c1[0] - c2[0]
    dg = c1[1] - c2[1]
    db = c1[2] - c2[2]
    return dr * dr + dg * dg + db * db


def _has_existing_transparency(img: Image.Image) -> bool:
    """Return True if the image already has a meaningful transparent border."""
    if img.mode not in ("RGBA", "LA"):
        return False
    rgba = img.convert("RGBA")
    w, h = rgba.size
    if w < 2 or h < 2:
        return False
    corners = [
        rgba.getpixel((0, 0))[3],
        rgba.getpixel((w - 1, 0))[3],
        rgba.getpixel((0, h - 1))[3],
        rgba.getpixel((w - 1, h - 1))[3],
    ]
    return sum(1 for a in corners if a < 20) >= 3


def _estimate_background_color(rgb_img: Image.Image) -> tuple[tuple[int, int, int], int]:
    """Sample border pixels to estimate the dominant background color and adaptive threshold."""
    w, h = rgb_img.size
    px = rgb_img.load()
    samples: list[tuple[int, int, int]] = []

    step_x = max(1, w // 32)
    step_y = max(1, h // 32)
    for x in range(0, w, step_x):
        samples.append(px[x, 0])
        samples.append(px[x, h - 1])
    for y in range(0, h, step_y):
        samples.append(px[0, y])
        samples.append(px[w - 1, y])

    if not samples:
        return (255, 255, 255), 36 * 36

    # Use median per channel for robustness against small foreground edge touches
    rs = sorted(c[0] for c in samples)
    gs = sorted(c[1] for c in samples)
    bs = sorted(c[2] for c in samples)
    mid = len(samples) // 2
    bg = (rs[mid], gs[mid], bs[mid])

    # Estimate border spread to adapt tolerance for slightly textured surfaces
    dists = sorted(_color_distance_sq(c, bg) for c in samples)
    p75_dist = dists[int(len(dists) * 0.75)]
    # Clamp squared distance threshold between 28^2 (784) and 68^2 (4624)
    threshold_sq = max(28 * 28, min(68 * 68, int(p75_dist * 2.2) + 32 * 32))
    return bg, threshold_sq


def _remove_background_floodfill(img: Image.Image) -> Image.Image:
    """Remove connected exterior background using edge-seeded flood fill on a downsampled mask."""
    rgba = img.convert("RGBA")
    orig_w, orig_h = rgba.size
    if orig_w < 8 or orig_h < 8:
        return rgba

    # Work on a bounded working copy for fast flood-fill, then upscale mask smoothly
    work_max = 480
    scale = min(1.0, work_max / max(orig_w, orig_h))
    work_w = max(8, int(round(orig_w * scale)))
    work_h = max(8, int(round(orig_h * scale)))

    work_rgb = rgba.convert("RGB").resize((work_w, work_h), Image.Resampling.BILINEAR)
    bg_color, threshold_sq = _estimate_background_color(work_rgb)
    wpx = work_rgb.load()

    visited = bytearray(work_w * work_h)
    is_bg = bytearray(work_w * work_h)
    queue: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        idx = y * work_w + x
        if visited[idx]:
            return
        visited[idx] = 1
        if _color_distance_sq(wpx[x, y], bg_color) <= threshold_sq:
            is_bg[idx] = 1
            queue.append((x, y))

    for x in range(work_w):
        try_seed(x, 0)
        try_seed(x, work_h - 1)
    for y in range(work_h):
        try_seed(0, y)
        try_seed(work_w - 1, y)

    while queue:
        cx, cy = queue.popleft()
        cur_rgb = wpx[cx, cy]
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < work_w and 0 <= ny < work_h:
                nidx = ny * work_w + nx
                if not visited[nidx]:
                    visited[nidx] = 1
                    nrgb = wpx[nx, ny]
                    # Match either global border color or smooth local gradient
                    if (
                        _color_distance_sq(nrgb, bg_color) <= threshold_sq
                        or _color_distance_sq(nrgb, cur_rgb) <= 18 * 18
                    ):
                        is_bg[nidx] = 1
                        queue.append((nx, ny))

    # Build alpha mask: 0 for background, 255 for foreground
    bg_count = sum(is_bg)
    total_px = work_w * work_h
    # Safety guard: if flood fill removed < 1% or > 97% of the image, keep original alpha
    if bg_count < total_px * 0.01 or bg_count > total_px * 0.97:
        return rgba

    mask_data = bytes(0 if b else 255 for b in is_bg)
    small_mask = Image.frombytes("L", (work_w, work_h), mask_data)
    full_mask = small_mask.resize((orig_w, orig_h), Image.Resampling.BILINEAR)
    # Subtle feathering for clean anti-aliased coin/slab edges
    full_mask = full_mask.filter(ImageFilter.GaussianBlur(radius=1.0))

    r, g, b, _ = rgba.split()
    return Image.merge("RGBA", (r, g, b, full_mask))


def _remove_background_grabcut(img: Image.Image) -> Image.Image:
    """
    Remove exterior background (including textured/patterned surfaces) using OpenCV GrabCut,
    largest-connected-component filtering to eliminate speckles, and exterior contour hole-filling.
    """
    rgba = img.convert("RGBA")
    orig_w, orig_h = rgba.size
    if orig_w < 16 or orig_h < 16:
        return rgba

    arr = np.array(rgba)
    has_alpha = img.mode in ("RGBA", "LA") and bool((arr[:, :, 3] < 240).any())

    work_max = 560
    scale = min(1.0, work_max / max(orig_w, orig_h))
    work_w = max(16, int(round(orig_w * scale)))
    work_h = max(16, int(round(orig_h * scale)))

    work_rgba = np.array(rgba.resize((work_w, work_h), Image.Resampling.BILINEAR))
    work_rgb = work_rgba[:, :, :3]
    work_alpha = work_rgba[:, :, 3]
    work_bgr = cv2.cvtColor(work_rgb, cv2.COLOR_RGB2BGR)

    # Estimate border color in LAB space for color-distance saliency
    lab = cv2.cvtColor(work_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    border_lab = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]], axis=0)
    bg_lab = np.median(border_lab, axis=0)
    lab_dist = np.linalg.norm(lab - bg_lab, axis=2)

    # Guard against uniform solid-color images (nothing distinct from border to segment)
    if not has_alpha and float((lab_dist > 12).mean()) < 0.01:
        return rgba

    gc_mask = np.full((work_h, work_w), cv2.GC_PR_BGD, dtype=np.uint8)
    bx = max(2, int(work_w * 0.02))
    by = max(2, int(work_h * 0.02))
    gc_mask[:by, :] = cv2.GC_BGD
    gc_mask[-by:, :] = cv2.GC_BGD
    gc_mask[:, :bx] = cv2.GC_BGD
    gc_mask[:, -bx:] = cv2.GC_BGD

    if has_alpha:
        gc_mask[work_alpha < 20] = cv2.GC_BGD
        opaque = (work_alpha >= 20).astype(np.uint8)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(opaque, connectivity=8)
        if num_labels > 1:
            largest_lbl = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            main_comp = labels == largest_lbl
            kernel = np.ones((5, 5), np.uint8)
            eroded = cv2.erode(main_comp.astype(np.uint8), kernel, iterations=2)
            gc_mask[main_comp] = cv2.GC_PR_FGD
            gc_mask[eroded > 0] = cv2.GC_FGD
            gc_mask[~main_comp] = cv2.GC_BGD
    else:
        y1, y2 = int(work_h * 0.12), int(work_h * 0.88)
        x1, x2 = int(work_w * 0.12), int(work_w * 0.88)
        gc_mask[y1:y2, x1:x2] = cv2.GC_PR_FGD
        gc_mask[(lab_dist > 18) & (gc_mask != cv2.GC_BGD)] = cv2.GC_PR_FGD
        cy1, cy2 = int(work_h * 0.30), int(work_h * 0.70)
        cx1, cx2 = int(work_w * 0.30), int(work_w * 0.70)
        gc_mask[cy1:cy2, cx1:cx2] = cv2.GC_FGD

    if (gc_mask == cv2.GC_BGD).any() and (
        (gc_mask == cv2.GC_FGD).any() or (gc_mask == cv2.GC_PR_FGD).any()
    ):
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        if not (gc_mask == cv2.GC_FGD).any():
            gc_mask[work_h // 2, work_w // 2] = cv2.GC_FGD
        cv2.grabCut(work_bgr, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
        fg_mask = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(
            np.uint8
        )
    else:
        return _remove_background_floodfill(img)

    fg_ratio = float((fg_mask > 0).mean())
    if fg_ratio < 0.01 or fg_ratio > 0.97:
        return _remove_background_floodfill(img)

    # Keep only the largest connected component to eliminate disconnected background speckles
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_mask, connectivity=8)
    if num_labels > 1:
        largest_lbl = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg_mask = np.where(labels == largest_lbl, 255, 0).astype(np.uint8)

    # Fill interior holes so white slab inserts/labels are preserved
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled_mask = np.zeros_like(fg_mask)
    if contours:
        largest_cnt = max(contours, key=cv2.contourArea)
        cv2.drawContours(filled_mask, [largest_cnt], -1, 255, thickness=cv2.FILLED)
    else:
        filled_mask = fg_mask

    full_mask = cv2.resize(filled_mask, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    full_mask = cv2.GaussianBlur(full_mask, (3, 3), 0.8)

    out_arr = arr.copy()
    out_arr[:, :, 3] = full_mask
    return Image.fromarray(out_arr, mode="RGBA")


def detect_coin_in_slab(rgba: Image.Image) -> tuple[int, int, int] | None:
    """
    Detect a circular coin (cx, cy, r) inside a tall slabbed coin image.
    Returns None if the image does not appear to be a coin inside a rectangular slab.
    """
    arr = np.array(rgba.convert("RGBA"))
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    slab_w = x1 - x0
    slab_h = y1 - y0
    if slab_w < 60 or slab_h < 60 or (slab_h / max(1, slab_w)) < 1.15:
        return None

    rgb = arr[:, :, :3].copy()
    rgb[alpha < 24] = 255
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    crop = gray[y0:y1, x0:x1]
    target_w = 400.0
    scale = target_w / slab_w
    sw = max(32, int(round(slab_w * scale)))
    sh = max(32, int(round(slab_h * scale)))
    small = cv2.resize(crop, (sw, sh), interpolation=cv2.INTER_AREA)
    blurred = cv2.GaussianBlur(small, (5, 5), 1.2)
    edges = cv2.Canny(blurred, 50, 140)

    min_r = max(8, int(sw * 0.25))
    max_r = max(min_r + 4, int(sw * 0.42))
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=sw * 0.15,
        param1=90,
        param2=24,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is None:
        return None

    angles = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)

    best: tuple[float, float, float] | None = None
    best_score = -1e9
    for c in circles[0]:
        cx_s, cy_s, r_s = float(c[0]), float(c[1]), float(c[2])
        horiz_err = abs(cx_s - 0.5 * sw) / sw
        if horiz_err > 0.15:
            continue
        if cy_s < 0.50 * sh or cy_s > 0.82 * sh:
            continue
        if cy_s - r_s < 0.28 * sh or cy_s + r_s > 0.97 * sh:
            continue
        if cx_s - r_s < 0.03 * sw or cx_s + r_s > 0.97 * sw:
            continue

        support = 0
        for dr in (-1.5, 0.0, 1.5):
            rr = r_s + dr
            px = np.clip(np.round(cx_s + rr * cos_a).astype(int), 0, sw - 1)
            py = np.clip(np.round(cy_s + rr * sin_a).astype(int), 0, sh - 1)
            support += int((edges[py, px] > 0).sum())
        score = support - horiz_err * 80.0
        if score > best_score:
            best_score = score
            best = (cx_s, cy_s, r_s)

    if best is None or best_score < 28:
        return None

    cx = int(round(x0 + best[0] / scale))
    cy = int(round(y0 + best[1] / scale))
    r = int(round(best[2] / scale))
    return cx, cy, r


def extract_coin_cutout(rgba: Image.Image, cx: int, cy: int, r: int) -> Image.Image:
    """Crop tightly around a detected circular coin and apply a clean anti-aliased circular alpha mask."""
    w, h = rgba.size
    pad = max(2, int(round(r * CROP_PADDING_RATIO)))
    left = max(0, cx - r - pad)
    top = max(0, cy - r - pad)
    right = min(w, cx + r + pad)
    bottom = min(h, cy + r + pad)

    cropped = rgba.convert("RGBA").crop((left, top, right, bottom))
    cw, ch = cropped.size
    ccx = cx - left
    ccy = cy - top

    yy, xx = np.ogrid[:ch, :cw]
    dist = np.sqrt((xx - ccx) ** 2 + (yy - ccy) ** 2)
    mask = np.clip((r + 0.75 - dist) / 1.5, 0.0, 1.0) * 255.0
    mask_u8 = mask.astype(np.uint8)

    arr = np.array(cropped)
    arr[:, :, 3] = np.minimum(arr[:, :, 3], mask_u8)
    return _crop_to_subject(Image.fromarray(arr, mode="RGBA"))


def _crop_to_subject(rgba: Image.Image) -> Image.Image:
    """Crop tightly around non-transparent subject with minimal padding."""
    alpha = rgba.getchannel("A")
    # Threshold faint feathering noise when computing bounding box
    hard_mask = alpha.point(lambda a: 255 if a > 32 else 0)
    bbox = hard_mask.getbbox()
    if not bbox:
        return rgba

    left, top, right, bottom = bbox
    subj_w = right - left
    subj_h = bottom - top
    if subj_w < 8 or subj_h < 8:
        return rgba

    pad_x = max(2, int(round(subj_w * CROP_PADDING_RATIO)))
    pad_y = max(2, int(round(subj_h * CROP_PADDING_RATIO)))

    w, h = rgba.size
    crop_box = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(w, right + pad_x),
        min(h, bottom + pad_y),
    )
    return rgba.crop(crop_box)


def _enhance_detail(img: Image.Image) -> Image.Image:
    """Apply subtle sharpening and contrast clarity without clipping highlights."""
    if img.mode == "RGBA":
        r, g, b, a = img.split()
        rgb = Image.merge("RGB", (r, g, b))
        rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.0, percent=35, threshold=3))
        rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
        er, eg, eb = rgb.split()
        return Image.merge("RGBA", (er, eg, eb, a))

    rgb = img.convert("RGB")
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.0, percent=35, threshold=3))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    return rgb


def _encode_processed_image(
    img: Image.Image,
    *,
    orig_format: str = "PNG",
    force_png: bool = False,
) -> tuple[bytes, int, int, str]:
    out = io.BytesIO()
    if img.mode == "RGBA" or force_png:
        img.save(out, format="PNG", optimize=True)
        ext = "png"
    elif orig_format in {"JPEG", "JPG"}:
        img.convert("RGB").save(out, format="JPEG", quality=95, optimize=True)
        ext = "jpg"
    elif orig_format == "WEBP":
        img.save(out, format="WEBP", quality=95, method=4)
        ext = "webp"
    else:
        img.save(out, format="PNG", optimize=True)
        ext = "png"
    width, height = img.size
    return out.getvalue(), width, height, ext


def process_item_image(
    raw_bytes: bytes,
    *,
    remove_background: bool = True,
    enhance: bool = True,
    max_dimension: int = MAX_IMAGE_DIMENSION,
) -> tuple[bytes, int, int, str]:
    """
    Normalize orientation, preserve high resolution, optionally remove background & crop tightly,
    and enhance coin/slab detail. Returns (processed_bytes, width, height, extension).
    """
    with Image.open(io.BytesIO(raw_bytes)) as opened:
        img = ImageOps.exif_transpose(opened)
        orig_format = (opened.format or "PNG").upper()

        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        if remove_background:
            rgba = _remove_background_grabcut(img)
            img = _crop_to_subject(rgba)

        if enhance:
            img = _enhance_detail(img)

        return _encode_processed_image(img, orig_format=orig_format, force_png=remove_background)


def extract_coin_and_slab_images(
    raw_bytes: bytes,
    *,
    enhance: bool = True,
    max_dimension: int = MAX_IMAGE_DIMENSION,
) -> tuple[tuple[bytes, int, int, str], tuple[bytes, int, int, str] | None]:
    """
    Remove background cleanly and check if the image is a coin inside a rectangular grading slab.
    If a slabbed coin is detected, returns ((coin_bytes, cw, ch, 'png'), (slab_bytes, sw, sh, 'png')).
    Otherwise returns ((cleaned_bytes, w, h, 'png'), None).
    """
    with Image.open(io.BytesIO(raw_bytes)) as opened:
        img = ImageOps.exif_transpose(opened)
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        slab_rgba = _crop_to_subject(_remove_background_grabcut(img))
        circle = detect_coin_in_slab(slab_rgba)

        slab_final = _enhance_detail(slab_rgba) if enhance else slab_rgba
        slab_encoded = _encode_processed_image(slab_final, force_png=True)

        if not circle:
            return slab_encoded, None

        coin_rgba = extract_coin_cutout(slab_rgba, *circle)
        coin_final = _enhance_detail(coin_rgba) if enhance else coin_rgba
        coin_encoded = _encode_processed_image(coin_final, force_png=True)
        return coin_encoded, slab_encoded


_SUSPICIOUS_SOFTWARE_MARKERS = (
    "photoshop",
    "canva",
    "gimp",
    "midjourney",
    "dall-e",
    "stable diffusion",
    "comfyui",
    "screenshot",
    "snipping",
    "figma",
)


def analyze_image_quality_and_forensics(
    raw_bytes: bytes,
    *,
    mode: str = "camera",
) -> dict[str, Any]:
    """
    Evaluate image resolution, sharpness, exposure, and (for uploads) EXIF/moiré forensics.
    Returns {"status": "VERIFIED"|"FLAGGED", "warnings": [...], "metrics": {...}}.
    """
    warnings: list[str] = []
    metrics: dict[str, Any] = {}
    try:
        with Image.open(io.BytesIO(raw_bytes)) as opened:
            exif_raw = opened.getexif()
            img = ImageOps.exif_transpose(opened)
            width, height = img.size
            metrics["width"] = width
            metrics["height"] = height

            if min(width, height) < 400:
                warnings.append(
                    f"Low resolution ({width}x{height}px) — capture or upload a sharper close-up."
                )

            gray = img.convert("L")
            gray.thumbnail((512, 512), Image.Resampling.BILINEAR)
            brightness = float(ImageStat.Stat(gray).mean[0])
            metrics["brightness"] = round(brightness, 1)
            if brightness < 35:
                warnings.append("Image is too dark / underexposed — add more light.")
            elif brightness > 235:
                warnings.append("Image is overexposed / blown out — reduce glare or flash.")

            edges = gray.filter(ImageFilter.FIND_EDGES)
            ew, eh = edges.size
            inner_edges = edges.crop((2, 2, max(3, ew - 2), max(3, eh - 2)))
            sharpness = float(ImageStat.Stat(inner_edges).stddev[0])
            metrics["sharpness"] = round(sharpness, 2)
            if sharpness < 8.0:
                warnings.append("Image appears blurry or out of focus.")

            if mode == "upload":
                # Check EXIF software/description markers
                exif_tags = {
                    ExifTags.TAGS.get(k, str(k)): str(v)
                    for k, v in (exif_raw.items() if exif_raw else [])
                }
                software_blob = " ".join(
                    exif_tags.get(k, "")
                    for k in ("Software", "ProcessingSoftware", "ImageDescription", "Artist")
                ).lower()
                if any(marker in software_blob for marker in _SUSPICIOUS_SOFTWARE_MARKERS):
                    warnings.append(
                        "Upload metadata indicates software editing, screenshot, or synthetic generation."
                    )

                # Heuristic moiré / periodic screen-grid check on downscaled sample
                rgb_small = img.convert("RGB")
                rgb_small.thumbnail((256, 256), Image.Resampling.BILINEAR)
                px = (
                    list(rgb_small.get_flattened_data())
                    if hasattr(rgb_small, "get_flattened_data")
                    else list(rgb_small.getdata())
                )
                w_s, h_s = rgb_small.size
                if w_s >= 32 and h_s >= 32:
                    alternating_hits = 0
                    total_checks = 0
                    for y in range(0, h_s, 4):
                        row_off = y * w_s
                        for x in range(2, w_s - 2, 2):
                            c0 = px[row_off + x - 1][1]
                            c1 = px[row_off + x][1]
                            c2 = px[row_off + x + 1][1]
                            if (c1 - c0 > 22 and c1 - c2 > 22) or (c0 - c1 > 22 and c2 - c1 > 22):
                                alternating_hits += 1
                            total_checks += 1
                    moire_ratio = alternating_hits / max(1, total_checks)
                    metrics["moire_ratio"] = round(moire_ratio, 4)
                    if moire_ratio > 0.14:
                        warnings.append(
                            "Periodic pixel grid / screen moiré detected — may be a photo of a screen."
                        )
    except Exception:
        warnings.append("Unable to inspect image quality/metadata.")

    return {
        "status": "FLAGGED" if warnings else "VERIFIED",
        "warnings": warnings,
        "metrics": metrics,
    }

