from __future__ import annotations

import io
from collections import deque
from typing import Any

from PIL import ExifTags, Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

MAX_IMAGE_DIMENSION = 2400
CROP_PADDING_RATIO = 0.04


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


def _crop_to_subject(rgba: Image.Image) -> Image.Image:
    """Crop tightly around non-transparent subject with balanced padding."""
    alpha = rgba.getchannel("A")
    # Threshold faint feathering noise when computing bounding box
    hard_mask = alpha.point(lambda a: 255 if a > 24 else 0)
    bbox = hard_mask.getbbox()
    if not bbox:
        return rgba

    left, top, right, bottom = bbox
    subj_w = right - left
    subj_h = bottom - top
    if subj_w < 8 or subj_h < 8:
        return rgba

    pad_x = max(4, int(round(subj_w * CROP_PADDING_RATIO)))
    pad_y = max(4, int(round(subj_h * CROP_PADDING_RATIO)))

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
            if _has_existing_transparency(img):
                rgba = img.convert("RGBA")
            else:
                rgba = _remove_background_floodfill(img)
            img = _crop_to_subject(rgba)

        if enhance:
            img = _enhance_detail(img)

        out = io.BytesIO()
        if img.mode == "RGBA" or remove_background:
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

