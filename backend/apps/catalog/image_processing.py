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


def _border_palette_distance(
    lab: np.ndarray,
    bx: int,
    by: int,
    border_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, float]:
    """
    Compute minimum chroma-weighted LAB distance to a 4-quartile border color palette.
    Handles two-color printed/patterned backgrounds and shadowed white paper sheets.
    """
    h, w = lab.shape[:2]
    if border_mask is None or not border_mask.any():
        bw = max(bx, int(w * 0.05))
        bh = max(by, int(h * 0.05))
        border_mask = np.zeros((h, w), dtype=bool)
        border_mask[:bh, :] = True
        border_mask[-bh:, :] = True
        border_mask[:, :bw] = True
        border_mask[:, -bw:] = True
    bp = lab[border_mask]
    if len(bp) < 16:
        bg = np.median(lab, axis=(0, 1))
        d = np.linalg.norm(lab - bg, axis=2)
        return d, 16.0

    qs = np.percentile(bp[:, 0], [25, 50, 75])
    masks = [
        bp[:, 0] <= qs[0],
        (bp[:, 0] > qs[0]) & (bp[:, 0] <= qs[1]),
        (bp[:, 0] > qs[1]) & (bp[:, 0] <= qs[2]),
        bp[:, 0] > qs[2],
    ]
    clusters = [np.median(bp[m], axis=0) for m in masks if m.any()]
    weights = np.array([0.55, 1.55, 1.55], dtype=np.float32)
    min_d = np.min([np.linalg.norm((lab - c) * weights, axis=2) for c in clusters], axis=0)
    p92 = float(np.percentile(min_d[border_mask], 92))
    return min_d, p92


def _salient_foreground_mask(
    lab: np.ndarray,
    border_lab: np.ndarray,
    bx: int,
    by: int,
) -> np.ndarray:
    """Build a hole-filled binary saliency mask from LAB distance to the border distribution."""
    h, w = lab.shape[:2]
    bg_lab = np.median(border_lab, axis=0)
    lab_dist = np.linalg.norm(lab - bg_lab, axis=2)
    border_dists = np.linalg.norm(border_lab - bg_lab, axis=1)
    bg_spread = float(np.percentile(border_dists, 90)) if len(border_dists) else 0.0

    # If the border has a wide spread (patterned / two-color printed sheet), use 4-quartile palette distance
    if bg_spread > 28.0:
        min_d, p92 = _border_palette_distance(lab, bx, by)
        thresh = max(14.0, p92 * 1.35)
        salient = (min_d > thresh).astype(np.uint8) * 255
    else:
        dist_u8 = np.clip(lab_dist, 0, 255).astype(np.uint8)
        otsu_t, _ = cv2.threshold(dist_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        thresh = max(16.0, min(55.0, max(float(otsu_t), bg_spread * 1.45)))
        salient = (lab_dist > thresh).astype(np.uint8) * 255

    salient[:by, :] = 0
    salient[-by:, :] = 0
    salient[:, :bx] = 0
    salient[:, -bx:] = 0

    # Erode/open slightly so disconnected background speckles don't bridge to the main subject
    open_k = 5 if bg_spread > 28.0 else 3
    salient = cv2.morphologyEx(salient, cv2.MORPH_OPEN, np.ones((open_k, open_k), np.uint8))
    if bg_spread > 28.0:
        salient = cv2.morphologyEx(salient, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    cnts, _ = cv2.findContours(salient, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(salient)
    if cnts:
        img_cx, img_cy = w / 2.0, h / 2.0

        def _score_cnt(c: np.ndarray) -> float:
            x, y, cw, ch = cv2.boundingRect(c)
            area = float(cv2.contourArea(c))
            if area <= 0.0:
                return 0.0
            m = cv2.moments(c)
            if m["m00"] > 0:
                mcx = m["m10"] / m["m00"]
                mcy = m["m01"] / m["m00"]
            else:
                mcx = x + cw / 2.0
                mcy = y + ch / 2.0
            dx = (mcx - img_cx) / max(1.0, w * 0.35)
            dy = (mcy - img_cy) / max(1.0, h * 0.35)
            center_weight = float(np.exp(-(dx * dx + dy * dy)))
            border_touches = (
                int(x <= bx + 1)
                + int(y <= by + 1)
                + int(x + cw >= w - bx - 1)
                + int(y + ch >= h - by - 1)
            )
            border_penalty = 0.25 if border_touches >= 2 else (0.6 if border_touches == 1 else 1.0)
            return area * (0.2 + 1.8 * center_weight) * border_penalty

        best_cnt = max(cnts, key=_score_cnt)
        cv2.drawContours(filled, [best_cnt], -1, 255, thickness=cv2.FILLED)
    return filled


def _contour_extent(mask_u8: np.ndarray) -> float:
    """Return area / minAreaRect_area for the largest contour in mask_u8."""
    cnts, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return 0.0
    cnt = max(cnts, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    _, (rw, rh), _ = cv2.minAreaRect(cnt)
    rect_area = float(rw * rh)
    if rect_area <= 1.0:
        return 0.0
    return area / rect_area


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
            kernel = np.ones((7, 7), np.uint8)
            eroded = cv2.erode(main_comp.astype(np.uint8), kernel, iterations=3)
            gc_mask[main_comp] = cv2.GC_PR_FGD
            if (eroded > 0).sum() >= 16:
                gc_mask[eroded > 0] = cv2.GC_FGD
            gc_mask[~main_comp] = cv2.GC_BGD
    else:
        salient = _salient_foreground_mask(lab, border_lab, bx, by)
        salient_ratio = float((salient > 0).mean())
        if 0.02 <= salient_ratio <= 0.95:
            gc_mask[(salient > 0) & (gc_mask != cv2.GC_BGD)] = cv2.GC_PR_FGD
            kernel = np.ones((5, 5), np.uint8)
            eroded = cv2.erode((salient > 0).astype(np.uint8), kernel, iterations=2)
            if (eroded > 0).sum() >= 16:
                gc_mask[eroded > 0] = cv2.GC_FGD
            else:
                gc_mask[salient > 0] = cv2.GC_FGD
        else:
            # Conservative fallback for very low-contrast or full-frame subjects
            gc_mask[(lab_dist > 18) & (gc_mask != cv2.GC_BGD)] = cv2.GC_PR_FGD
            cy1, cy2 = int(work_h * 0.35), int(work_h * 0.65)
            cx1, cx2 = int(work_w * 0.35), int(work_w * 0.65)
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

    # Guard against inverted masks (e.g. outer mat/flip kept while center subject was cut out)
    if not has_alpha:
        cy1, cy2 = int(work_h * 0.35), int(work_h * 0.65)
        cx1, cx2 = int(work_w * 0.35), int(work_w * 0.65)
        center_fg = float((fg_mask[cy1:cy2, cx1:cx2] > 0).mean())
        if center_fg < 0.15:
            retry_mask = np.full((work_h, work_w), cv2.GC_PR_BGD, dtype=np.uint8)
            rbx = max(2, int(work_w * 0.04))
            rby = max(2, int(work_h * 0.04))
            retry_mask[:rby, :] = cv2.GC_BGD
            retry_mask[-rby:, :] = cv2.GC_BGD
            retry_mask[:, :rbx] = cv2.GC_BGD
            retry_mask[:, -rbx:] = cv2.GC_BGD
            retry_mask[(lab_dist > 18) & (retry_mask != cv2.GC_BGD)] = cv2.GC_PR_FGD
            retry_mask[cy1:cy2, cx1:cx2] = cv2.GC_FGD
            bgd_model2 = np.zeros((1, 65), np.float64)
            fgd_model2 = np.zeros((1, 65), np.float64)
            cv2.grabCut(work_bgr, retry_mask, None, bgd_model2, fgd_model2, 5, cv2.GC_INIT_WITH_MASK)
            retry_fg = np.where(
                (retry_mask == cv2.GC_FGD) | (retry_mask == cv2.GC_PR_FGD), 255, 0
            ).astype(np.uint8)
            retry_ratio = float((retry_fg > 0).mean())
            if 0.02 <= retry_ratio <= 0.96 and float((retry_fg[cy1:cy2, cx1:cx2] > 0).mean()) > center_fg:
                fg_mask = retry_fg
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
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(small)
    blurred = cv2.GaussianBlur(clahe, (5, 5), 1.2)
    gx = cv2.Sobel(blurred, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(blurred, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy) + 1e-5
    edges = cv2.Canny(blurred, 40, 125)

    min_r = max(8, int(sw * 0.11))
    max_r = max(min_r + 4, int(sw * 0.43))

    candidates: list[tuple[float, float, float]] = []
    for p1, p2 in ((90, 24), (80, 18)):
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=sw * 0.08,
            param1=p1,
            param2=p2,
            minRadius=min_r,
            maxRadius=max_r,
        )
        if circles is not None:
            for c in circles[0]:
                candidates.append((float(c[0]), float(c[1]), float(c[2])))

    # Concentric sweep in lower-half slab region so outer plastic rings never suppress inner small coins
    for cy_grid in np.linspace(0.54 * sh, 0.74 * sh, 7):
        for cx_grid in np.linspace(0.44 * sw, 0.56 * sw, 5):
            for r_grid in range(min_r, max_r + 1, 3):
                candidates.append((float(cx_grid), float(cy_grid), float(r_grid)))

    angles = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)
    yy, xx = np.ogrid[:sh, :sw]

    best: tuple[float, float, float] | None = None
    best_score = -1e9
    for cx_s, cy_s, r_s in candidates:
        horiz_err = abs(cx_s - 0.5 * sw) / sw
        if horiz_err > 0.14:
            continue
        if cy_s < 0.46 * sh or cy_s > 0.85 * sh:
            continue
        if cy_s - r_s < 0.24 * sh or cy_s + r_s > 0.97 * sh:
            continue
        if cx_s - r_s < 0.03 * sw or cx_s + r_s > 0.97 * sw:
            continue

        aligned = np.zeros(72, dtype=bool)
        for dr in (-1.0, 0.0, 1.0):
            rr = r_s + dr
            px = np.clip(np.round(cx_s + rr * cos_a).astype(int), 0, sw - 1)
            py = np.clip(np.round(cy_s + rr * sin_a).astype(int), 0, sh - 1)
            dot = np.abs(gx[py, px] * cos_a + gy[py, px] * sin_a) / mag[py, px]
            aligned |= (edges[py, px] > 0) & (dot >= 0.74)
        aligned_cov = int(aligned.sum())
        if aligned_cov < 36:
            continue

        dist = np.sqrt((xx - cx_s) ** 2 + (yy - cy_s) ** 2)
        core_mask = dist <= 0.82 * r_s
        annulus_mask = (dist >= 1.12 * r_s) & (dist <= min(0.45 * sw, 1.60 * r_s))
        core_grad = float(mag[core_mask].mean()) if core_mask.any() else 0.0
        annulus_grad = float(mag[annulus_mask].mean()) if annulus_mask.any() else core_grad

        # Reward coins whose interior relief is much richer than a smooth surrounding gasket/ring
        relief_ratio_bonus = 0.0
        if annulus_grad > 1.0 and core_grad > annulus_grad * 1.25:
            relief_ratio_bonus = min(36.0, (core_grad / annulus_grad - 1.0) * 28.0)

        score = (
            aligned_cov * 1.8
            + min(24.0, core_grad * 0.25)
            + relief_ratio_bonus
            - horiz_err * 95.0
        )
        if score > best_score:
            best_score = score
            best = (cx_s, cy_s, r_s)

    if best is None:
        return None

    cx = int(round(x0 + best[0] / scale))
    cy = int(round(y0 + best[1] / scale))
    r = int(round(best[2] / scale))
    return cx, cy, r


def detect_circular_coin(img: Image.Image) -> tuple[int, int, int] | None:
    """
    Detect a centered circular coin or round (cx, cy, r) directly from an image.
    Uses CLAHE + Sobel radial-normal alignment + concentric inner-coin disambiguation
    so small coins in assay cards/holder rings are extracted accurately while never
    hallucinating off-center circles over text or sub-cropping already-cutout coins.
    """
    orig_w, orig_h = img.size
    if orig_w < 48 or orig_h < 48:
        return None

    already_cutout = (
        _has_existing_transparency(img)
        and abs(orig_w - orig_h) <= 0.08 * max(orig_w, orig_h)
    )

    work_max = 480.0
    scale = min(1.0, work_max / max(orig_w, orig_h))
    sw = max(32, int(round(orig_w * scale)))
    sh = max(32, int(round(orig_h * scale)))

    rgb = np.array(img.convert("RGB").resize((sw, sh), Image.Resampling.BILINEAR))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(clahe, (5, 5), 1.2)
    gx = cv2.Sobel(blurred, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(blurred, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy) + 1e-5
    edges = cv2.Canny(blurred, 40, 120)

    min_dim = min(sw, sh)
    min_r = max(10, int(min_dim * 0.065))
    max_r = max(min_r + 6, int(min_dim * 0.49))

    hough_candidates: set[tuple[int, int, int]] = set()
    candidates: list[tuple[float, float, float]] = []
    for p1, p2 in ((90, 26), (80, 18)):
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=min_dim * 0.10,
            param1=p1,
            param2=p2,
            minRadius=min_r,
            maxRadius=max_r,
        )
        if circles is not None:
            for c in circles[0]:
                cx_c, cy_c, r_c = float(c[0]), float(c[1]), float(c[2])
                candidates.append((cx_c, cy_c, r_c))
                hough_candidates.add((int(round(cx_c)), int(round(cy_c)), int(round(r_c))))

    # Concentric sweep near image center so outer capsule/card borders never suppress inner small coins
    for dy in range(-18, 19, 6):
        for dx in range(-18, 19, 6):
            cx_g = 0.5 * sw + dx
            cy_g = 0.5 * sh + dy
            for r_g in range(min_r, max_r + 1, 3):
                candidates.append((float(cx_g), float(cy_g), float(r_g)))

    angles = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)
    yy, xx = np.ogrid[:sh, :sw]

    best_inner: tuple[float, float, float] | None = None
    best_inner_score = -1e9
    best_outer: tuple[float, float, float] | None = None
    best_outer_score = -1e9

    for cx_s, cy_s, r_s in candidates:
        is_hough = (int(round(cx_s)), int(round(cy_s)), int(round(r_s))) in hough_candidates
        max_dx = 0.22 * sw if is_hough else 0.18 * sw
        max_dy = 0.28 * sh if is_hough else 0.20 * sh
        if abs(cx_s - 0.5 * sw) > max_dx or abs(cy_s - 0.5 * sh) > max_dy:
            continue
        if (
            cx_s - r_s < -0.03 * sw
            or cx_s + r_s > 1.03 * sw
            or cy_s - r_s < -0.03 * sh
            or cy_s + r_s > 1.03 * sh
        ):
            continue

        aligned = np.zeros(72, dtype=bool)
        for dr in (-1.0, 0.0, 1.0):
            rr = r_s + dr
            px = np.clip(np.round(cx_s + rr * cos_a).astype(int), 0, sw - 1)
            py = np.clip(np.round(cy_s + rr * sin_a).astype(int), 0, sh - 1)
            dot = np.abs(gx[py, px] * cos_a + gy[py, px] * sin_a) / mag[py, px]
            aligned |= (edges[py, px] > 0) & (dot >= 0.72)
        aligned_cov = int(aligned.sum())
        min_cov = 48 if (is_hough and (abs(cx_s - 0.5 * sw) > 0.18 * sw or abs(cy_s - 0.5 * sh) > 0.20 * sh)) else 38
        if aligned_cov < min_cov:
            continue

        dist = np.sqrt((xx - cx_s) ** 2 + (yy - cy_s) ** 2)
        inner_mask = (dist >= 0.65 * r_s) & (dist <= 0.92 * r_s)
        outer_mask = (dist >= 1.06 * r_s) & (dist <= 1.25 * r_s)
        lab_diff = 0.0
        if inner_mask.any() and outer_mask.any():
            lab_diff = float(np.linalg.norm(lab[inner_mask].mean(axis=0) - lab[outer_mask].mean(axis=0)))

        core_mask = dist <= 0.82 * r_s
        core_grad = float(mag[core_mask].mean()) if core_mask.any() else 0.0
        interior_std = float(gray[core_mask].std()) if core_mask.any() else 0.0
        center_err = float(np.hypot((cx_s - 0.5 * sw) / sw, (cy_s - 0.5 * sh) / sh))

        annulus_mask = (dist >= 1.15 * r_s) & (dist <= min(0.44 * min_dim, 1.65 * r_s))
        annulus_grad = float(mag[annulus_mask].mean()) if annulus_mask.any() else core_grad

        # Check if this is a distinct smaller coin nested inside a gasket/assay card/holder ring
        is_distinct_inner_coin = (
            r_s <= 0.34 * min_dim
            and center_err <= 0.11
            and aligned_cov >= 48
            and core_grad >= 48.0
            and annulus_mask.any()
            and core_grad >= annulus_grad * 1.45
        )
        if is_distinct_inner_coin:
            inner_score = (
                aligned_cov * 2.0
                + min(35.0, (core_grad / max(1.0, annulus_grad) - 1.0) * 30.0)
                + min(20.0, lab_diff * 0.5)
                - center_err * 90.0
            )
            if inner_score > best_inner_score:
                best_inner_score = inner_score
                best_inner = (cx_s, cy_s, r_s)

        if not already_cutout:
            outer_score = (
                aligned_cov * 1.6
                + min(30.0, lab_diff * 0.6)
                + min(15.0, interior_std * 0.25)
                + min(18.0, (r_s / min_dim) * 36.0)
                - center_err * 65.0
            )
            if outer_score > best_outer_score:
                best_outer_score = outer_score
                best_outer = (cx_s, cy_s, r_s)

    chosen = best_inner if best_inner is not None else best_outer
    if chosen is None:
        return None

    cx = int(round(chosen[0] / scale))
    cy = int(round(chosen[1] / scale))
    r = int(round(chosen[2] / scale))
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


def _fit_tight_rect_from_mask(mask_u8: np.ndarray) -> tuple[float, float, float, float, float] | None:
    """Fit an oriented rectangle (cx, cy, rw, rh, angle) tightly to a binary mask, trimming low-occupancy fringes."""
    h, w = mask_u8.shape
    k = max(3, int(min(h, w) * 0.025) | 1)
    opened = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    if int((opened > 0).sum()) < int((mask_u8 > 0).sum() * 0.5):
        opened = mask_u8

    cnts, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    (cx, cy), (rw, rh), angle = cv2.minAreaRect(cnt)
    if rw < 16 or rh < 16:
        return None

    # Normalize so rw >= rh and angle is in [-45, 45]
    if rw < rh:
        rw, rh = rh, rw
        angle += 90.0
    while angle > 45.0:
        angle -= 90.0
    while angle < -45.0:
        angle += 90.0

    rot_mat = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    aligned = cv2.warpAffine(mask_u8, rot_mat, (w, h), flags=cv2.INTER_NEAREST)
    x0 = max(0, int(round(cx - rw / 2.0)))
    x1 = min(w, int(round(cx + rw / 2.0)))
    y0 = max(0, int(round(cy - rh / 2.0)))
    y1 = min(h, int(round(cy + rh / 2.0)))
    if x1 <= x0 or y1 <= y0:
        return float(cx), float(cy), float(rw), float(rh), float(angle)

    roi = (aligned[y0:y1, x0:x1] > 127).astype(np.float32)
    row_occ = roi.mean(axis=1)
    col_occ = roi.mean(axis=0)
    valid_rows = np.where(row_occ >= 0.62)[0]
    valid_cols = np.where(col_occ >= 0.62)[0]
    if len(valid_rows) <= 8 or len(valid_cols) <= 8:
        valid_rows = np.where(row_occ >= 0.45)[0]
        valid_cols = np.where(col_occ >= 0.45)[0]
    if len(valid_rows) > 8 and len(valid_cols) > 8:
        ny0 = y0 + int(valid_rows[0])
        ny1 = y0 + int(valid_rows[-1]) + 1
        nx0 = x0 + int(valid_cols[0])
        nx1 = x0 + int(valid_cols[-1]) + 1
        dcx_aligned = (nx0 + nx1) / 2.0 - cx
        dcy_aligned = (ny0 + ny1) / 2.0 - cy
        rad = np.deg2rad(angle)
        cx += dcx_aligned * np.cos(rad) - dcy_aligned * np.sin(rad)
        cy += dcx_aligned * np.sin(rad) + dcy_aligned * np.cos(rad)
        rw = float(nx1 - nx0)
        rh = float(ny1 - ny0)

    return float(cx), float(cy), float(rw), float(rh), float(angle)


def detect_rectangular_subject(
    rgba: Image.Image,
) -> tuple[float, float, float, float, float] | None:
    """
    Detect a rectangular bar or banknote (cx, cy, rw, rh, angle) from an RGBA image.
    If the opaque region is irregular (e.g. leftover dark mat), refines it using Otsu luminance/LAB
    separation before fitting the tight oriented rectangle.
    """
    arr = np.array(rgba.convert("RGBA"))
    h, w = arr.shape[:2]
    if w < 24 or h < 24:
        return None

    alpha = arr[:, :, 3]
    fg_mask = np.where(alpha > 32, 255, 0).astype(np.uint8)
    fg_area = int((fg_mask > 0).sum())
    if fg_area < w * h * 0.03:
        return None

    extent = _contour_extent(fg_mask)
    bgr = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[:, :, 0]

    # If the foreground mask still covers almost the entire image (>=75%, e.g. white paper sheet or
    # patterned sheet) or has an irregular border, test 4-quartile chroma-weighted border palette first.
    opaque = alpha > 128
    is_full_sheet = fg_area >= w * h * 0.75
    rim_k = max(7, int(min(h, w) * 0.08) | 1)
    eroded_opaque = cv2.erode(opaque.astype(np.uint8), np.ones((rim_k, rim_k), np.uint8)) > 0
    rim_mask = opaque & ~eroded_opaque
    thin_eroded = cv2.erode(opaque.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0

    bx = max(4, int(w * 0.05))
    by = max(4, int(h * 0.05))
    palette_border = rim_mask if (is_full_sheet and int(rim_mask.sum()) >= 32) else None
    min_d, p92 = _border_palette_distance(lab, bx, by, border_mask=palette_border)
    palette_raw = ((min_d > max(13.0, p92 * 1.32)) & (thin_eroded if is_full_sheet else np.ones_like(opaque))).astype(
        np.uint8
    ) * 255
    palette_raw[:by, :] = 0
    palette_raw[-by:, :] = 0
    palette_raw[:, :bx] = 0
    palette_raw[:, -bx:] = 0
    palette_opened = cv2.morphologyEx(palette_raw, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    palette_fg = cv2.morphologyEx(palette_opened, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8))
    p_cnts, _ = cv2.findContours(palette_fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    palette_matched = False
    if p_cnts and (is_full_sheet or extent < 0.88):
        p_best = max(p_cnts, key=cv2.contourArea)
        p_filled = np.zeros_like(palette_fg)
        cv2.drawContours(p_filled, [p_best], -1, 255, thickness=cv2.FILLED)
        p_area = int((p_filled > 0).sum())
        p_extent = _contour_extent(p_filled)
        min_extent = 0.76 if is_full_sheet else 0.82
        if 0.08 * w * h <= p_area <= 0.88 * w * h and p_extent >= min_extent:
            trimmed = np.where((p_filled > 0) & (palette_raw > 0), 255, 0).astype(np.uint8)
            if not is_full_sheet or int((trimmed > 0).sum()) >= p_area * 0.88:
                fg_mask = trimmed
            else:
                fg_mask = p_filled
            extent = p_extent
            fg_area = p_area
            palette_matched = True

    if not palette_matched and int(opaque.sum()) >= 64 and eroded_opaque.any() and rim_mask.any():
        core_k = max(15, int(min(h, w) * 0.22) | 1)
        core_opaque = cv2.erode(opaque.astype(np.uint8), np.ones((core_k, core_k), np.uint8)) > 0
        if not core_opaque.any():
            core_opaque = eroded_opaque
        rim_med_l = float(np.median(L[rim_mask]))
        eroded_med_l = float(np.median(L[eroded_opaque]))
        core_med_l = float(np.median(L[core_opaque]))
        rim_med_lab = np.median(lab[rim_mask], axis=0)
        core_med_lab = np.median(lab[core_opaque], axis=0)
        rim_core_lab_dist = float(np.linalg.norm(rim_med_lab - core_med_lab))

        has_dark_rim = rim_med_l < eroded_med_l - 8.0
        has_light_sheet_rim = is_full_sheet and (
            (rim_med_l > core_med_l + 8.0) or (rim_core_lab_dist >= 14.0)
        )
        has_distinct_rim = has_dark_rim or has_light_sheet_rim

        if has_light_sheet_rim and not has_dark_rim:
            bg_lab = rim_med_lab
        else:
            dark_thresh = float(np.percentile(L[opaque], 20))
            dark_mask = opaque & (L <= dark_thresh)
            bg_lab = np.median(lab[dark_mask], axis=0) if dark_mask.any() else np.median(lab[opaque], axis=0)

        ldist = np.linalg.norm(lab - bg_lab, axis=2)
        ldist_u8 = np.clip(ldist, 0, 255).astype(np.uint8)
        otsu_t, _ = cv2.threshold(ldist_u8[opaque], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if extent < 0.85 or (extent < 0.92 and otsu_t >= 32.0) or has_distinct_rim or otsu_t >= 45.0:
            cand = np.where((ldist_u8 > otsu_t) & (thin_eroded if is_full_sheet else opaque), 255, 0).astype(
                np.uint8
            )
            open_k = max(7, int(min(h, w) * 0.02) | 1)
            cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((open_k, open_k), np.uint8))
            k = max(5, int(min(h, w) * 0.02) | 1)
            cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
            cnts, _ = cv2.findContours(cand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if cnts:
                largest = max(cnts, key=cv2.contourArea)
                filled = np.zeros_like(cand)
                cv2.drawContours(filled, [largest], -1, 255, thickness=cv2.FILLED)
                cand_area = int((filled > 0).sum())
                cand_extent = _contour_extent(filled)
                area_ratio = cand_area / max(1, fg_area)
                if 0.12 <= area_ratio <= 0.94 and (
                    cand_extent > extent
                    or ((otsu_t >= 45.0 or has_distinct_rim) and cand_extent >= 0.78 and area_ratio <= 0.88)
                ):
                    fg_mask = filled

    rect = _fit_tight_rect_from_mask(fg_mask)
    if rect is None:
        return None
    _, _, rw, rh, _ = rect
    if rw < 24 or rh < 24 or (rw * rh) < (w * h * 0.04):
        return None
    return rect


def extract_rectangular_cutout(
    rgba: Image.Image,
    rect: tuple[float, float, float, float, float],
    *,
    corner_ratio: float = 0.04,
) -> Image.Image:
    """Apply a clean anti-aliased rounded-rectangle alpha mask and crop tightly around the subject."""
    cx, cy, rw, rh, angle = rect
    arr = np.array(rgba.convert("RGBA"))
    h, w = arr.shape[:2]

    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    dx = xx - cx
    dy = yy - cy
    rad = np.deg2rad(-angle)
    rx = dx * np.cos(rad) - dy * np.sin(rad)
    ry = dx * np.sin(rad) + dy * np.cos(rad)

    hw = rw / 2.0
    hh = rh / 2.0
    cr = max(1.0, min(hw, hh) * corner_ratio * 2.0)

    qx = np.abs(rx) - (hw - cr)
    qy = np.abs(ry) - (hh - cr)
    sdf = (
        np.sqrt(np.maximum(qx, 0.0) ** 2 + np.maximum(qy, 0.0) ** 2)
        + np.minimum(np.maximum(qx, qy), 0.0)
        - cr
    )
    mask = np.clip((0.75 - sdf) / 1.5, 0.0, 1.0) * 255.0
    arr[:, :, 3] = np.minimum(arr[:, :, 3], mask.astype(np.uint8))
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
    """
    Apply studio-style numismatic lighting enhancement:
    1. Subject-scoped highlight-safe shadow/midtone gamma lift in CIE LAB space
       (measuring only opaque subject pixels so underexposed coins/Goldbacks/notes pop).
    2. Subtle chroma recovery when lifting deep shadows so gold/copper/ink tones stay rich.
    3. Local relief & engraving contrast via CLAHE on the L channel.
    4. Crisp edge sharpening via UnsharpMask while preserving alpha transparency.
    """
    has_alpha = img.mode == "RGBA"
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    fg = alpha > 32
    if not int(fg.sum()):
        fg = np.ones_like(alpha, dtype=bool)

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[:, :, 0]
    a = lab[:, :, 1]
    b = lab[:, :, 2]

    med_l = float(np.median(L[fg]))
    p30_l = float(np.percentile(L[fg], 30))
    ref_l = min(med_l, p30_l * 1.12)
    if ref_l < 152.0:
        gamma = max(
            0.56,
            min(0.92, float(np.log(148.0 / 255.0) / np.log(max(25.0, ref_l) / 255.0))),
        )
        l_norm = np.clip(L / 255.0, 0.0, 1.0)
        l_gamma = (l_norm**gamma) * 255.0
        highlight_guard = np.clip((248.0 - L) / 55.0, 0.20, 1.0)
        L = L + (l_gamma - L) * highlight_guard

        chroma_boost = 1.0 + (1.0 - gamma) * 0.40
        a = 128.0 + (a - 128.0) * chroma_boost
        b = 128.0 + (b - 128.0) * chroma_boost

    clahe = cv2.createCLAHE(clipLimit=1.9, tileGridSize=(8, 8))
    l_clahe = clahe.apply(np.clip(L, 0, 255).astype(np.uint8)).astype(np.float32)
    L = np.clip(0.65 * L + 0.35 * np.maximum(L, l_clahe), 0, 255)

    lab_out = np.stack([L, np.clip(a, 0, 255), np.clip(b, 0, 255)], axis=2).astype(np.uint8)
    rgb_out = cv2.cvtColor(cv2.cvtColor(lab_out, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2RGB)
    pil_rgb = Image.fromarray(rgb_out, mode="RGB")
    pil_rgb = pil_rgb.filter(ImageFilter.UnsharpMask(radius=1.1, percent=42, threshold=3))
    pil_rgb = ImageEnhance.Contrast(pil_rgb).enhance(1.04)

    if has_alpha:
        er, eg, eb = pil_rgb.split()
        return Image.merge("RGBA", (er, eg, eb, Image.fromarray(alpha, mode="L")))
    return pil_rgb


def auto_orient_upright(img: Image.Image) -> Image.Image:
    """
    Fast (< 25ms) pure-OpenCV upright orientation detector using Sobel typography stroke
    anisotropy. Avoids loading ONNX/RapidOCR inside image processing workers.
    In upright Latin/numeric text, vertical character stems (|dx|) dominate horizontal
    bars (|dy|); when a vertical note/Goldback/slab is lying on its side (w > h * 1.15),
    rotated character stems cause |dy| to strongly dominate |dx|.
    """
    w, h = img.size
    if w < 64 or h < 64:
        return img

    work = img.convert("L")
    if max(work.size) > 420:
        work = work.copy()
        work.thumbnail((420, 420), Image.Resampling.BILINEAR)

    g = np.array(work, dtype=np.float32)
    wh, ww = g.shape
    if float(g.std()) < 12.0:
        return img

    bx = max(4, int(ww * 0.10))
    by = max(4, int(wh * 0.10))
    roi = g[by : wh - by, bx : ww - bx]
    if roi.size < 256:
        return img

    gx = np.abs(cv2.Sobel(roi, cv2.CV_32F, 1, 0, ksize=3))
    gy = np.abs(cv2.Sobel(roi, cv2.CV_32F, 0, 1, ksize=3))
    h_grad = np.clip(gx - 0.65 * gy, 0.0, None)
    v_grad = np.clip(gy - 0.65 * gx, 0.0, None)
    h_mean = float(h_grad.mean())
    v_mean = float(v_grad.mean())

    if w > h * 1.15 and v_mean > max(18.0, h_mean * 1.55):
        rw = roi.shape[1]
        left_v = float(v_grad[:, : max(1, int(rw * 0.38))].mean())
        right_v = float(v_grad[:, min(rw - 1, int(rw * 0.62)) :].mean())
        if right_v > left_v * 1.35:
            return img.transpose(Image.Transpose.ROTATE_270)
        return img.transpose(Image.Transpose.ROTATE_90)
    return img


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


_RECT_CORNER_RATIOS = {
    "bar": 0.075,
    "note": 0.015,
    "rect": 0.04,
}


def detect_card_rectangle(img: Image.Image) -> tuple[float, float, float, float, float] | None:
    """
    Detect an opaque rectangular card, assay pack, graded slab, proof set, or banknote
    directly from multi-channel edge contours before running pixel-level GrabCut.
    Returns (cx, cy, rw, rh, angle) in original image pixel coordinates, or None.
    """
    orig_w, orig_h = img.size
    if orig_w < 48 or orig_h < 48:
        return None

    work_max = 560.0
    scale = min(1.0, work_max / max(orig_w, orig_h))
    sw = max(32, int(round(orig_w * scale)))
    sh = max(32, int(round(orig_h * scale)))

    rgb = np.array(img.convert("RGB").resize((sw, sh), Image.Resampling.BILINEAR))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    edge_map = cv2.Canny(cv2.GaussianBlur(clahe, (5, 5), 1.0), 40, 120)
    for ch in range(3):
        ch_blur = cv2.GaussianBlur(lab[:, :, ch], (5, 5), 1.0)
        edge_map = np.maximum(edge_map, cv2.Canny(ch_blur, 35, 110))

    edge_support = cv2.dilate(edge_map, np.ones((5, 5), np.uint8))
    closed = cv2.morphologyEx(
        cv2.dilate(edge_map, np.ones((3, 3), np.uint8)),
        cv2.MORPH_CLOSE,
        np.ones((7, 7), np.uint8),
    )

    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    work_area = float(sw * sh)
    best_rect: tuple[float, float, float, float, float] | None = None
    best_score = -1.0

    for cnt in contours:
        rect = cv2.minAreaRect(cnt)
        (cx, cy), (rw, rh), angle = rect
        if rw < 32 or rh < 32:
            continue
        rect_area = float(rw * rh)
        if rect_area < work_area * 0.10 or rect_area > work_area * 0.96:
            continue
        hull_area = float(cv2.contourArea(cv2.convexHull(cnt)))
        extent = hull_area / max(1.0, rect_area)
        if extent < 0.78:
            continue

        box = cv2.boxPoints(rect)
        # Reject full-frame borders
        touching = sum(
            1
            for pt in box
            if pt[0] <= 2 or pt[0] >= sw - 3 or pt[1] <= 2 or pt[1] >= sh - 3
        )
        if touching >= 4 and rect_area > work_area * 0.95:
            continue

        # Verify strong edge support along all 4 sides of the fitted rectangle
        side_covs: list[float] = []
        for i in range(4):
            p1 = box[i]
            p2 = box[(i + 1) % 4]
            ts = np.linspace(0.08, 0.92, 24)
            xs = np.clip(np.round(p1[0] + ts * (p2[0] - p1[0])).astype(int), 0, sw - 1)
            ys = np.clip(np.round(p1[1] + ts * (p2[1] - p1[1])).astype(int), 0, sh - 1)
            side_covs.append(float((edge_support[ys, xs] > 0).mean()))

        if min(side_covs) < 0.30 or float(np.mean(side_covs)) < 0.52:
            continue

        score = rect_area * extent * float(np.mean(side_covs))
        if score > best_score:
            best_score = score
            best_rect = (
                float(cx) / scale,
                float(cy) / scale,
                float(rw) / scale,
                float(rh) / scale,
                float(angle),
            )

    return best_rect


def _remove_background_grabcut_guarded(img: Image.Image) -> tuple[Image.Image, bool]:
    """
    Run _remove_background_grabcut and validate that the resulting mask is a coherent,
    non-fragmented subject. Returns (rgba_image, used_grabcut).
    """
    rgba = _remove_background_grabcut(img)
    arr = np.array(rgba)
    alpha = arr[:, :, 3]
    fg = (alpha > 128).astype(np.uint8)
    h, w = fg.shape
    fg_area = int(fg.sum())
    if fg_area < w * h * 0.04 or fg_area > w * h * 0.95:
        return img.convert("RGBA"), False

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    if num_labels <= 1:
        return img.convert("RGBA"), False
    largest_idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    largest_area = int(stats[largest_idx, cv2.CC_STAT_AREA])
    bw = int(stats[largest_idx, cv2.CC_STAT_WIDTH])
    bh = int(stats[largest_idx, cv2.CC_STAT_HEIGHT])
    bbox_fill = largest_area / max(1, bw * bh)
    comp_mask = (labels == largest_idx).astype(np.uint8)
    comp_cnts, _ = cv2.findContours(comp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull_area = float(cv2.contourArea(cv2.convexHull(comp_cnts[0]))) if comp_cnts else float(largest_area)
    solidity = largest_area / max(1.0, hull_area)
    if largest_area < fg_area * 0.70 or bbox_fill < 0.55 or solidity < 0.90:
        return img.convert("RGBA"), False

    return rgba, True


def _is_embedded_coin_in_card(img: Image.Image, circle: tuple[int, int, int]) -> bool:
    """
    Return True when a detected circle is a small coin embedded inside an assay card,
    CoA card, or proof set (surrounded by colorful artwork/text rather than a uniform desk).
    """
    orig_w, orig_h = img.size
    cx, cy, r = circle
    if r <= 0 or orig_w < 64 or orig_h < 64:
        return False
    if r >= 0.16 * min(orig_w, orig_h) and (2 * r) >= 200:
        return False

    work_max = 480.0
    scale = min(1.0, work_max / max(orig_w, orig_h))
    sw = max(32, int(round(orig_w * scale)))
    sh = max(32, int(round(orig_h * scale)))
    rgb = np.array(img.convert("RGB").resize((sw, sh), Image.Resampling.BILINEAR))
    lab = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2LAB).astype(np.float32)

    yy, xx = np.ogrid[:sh, :sw]
    dist = np.sqrt((xx - cx * scale) ** 2 + (yy - cy * scale) ** 2)
    rs = r * scale
    annulus = (dist >= 1.45 * rs) & (dist <= 2.8 * rs)
    if int(annulus.sum()) < 32:
        return False

    lab_std = float(np.linalg.norm(lab[annulus].std(axis=0)))
    luma_vals = lab[:, :, 0][annulus]
    luma_spread = float(np.percentile(luma_vals, 95) - np.percentile(luma_vals, 5))
    return lab_std >= 15.0 or luma_spread >= 65.0


def process_item_image(
    raw_bytes: bytes,
    *,
    remove_background: bool = False,
    enhance: bool = True,
    max_dimension: int = MAX_IMAGE_DIMENSION,
    shape_hint: str | None = None,
) -> tuple[bytes, int, int, str]:
    """
    Normalize EXIF orientation, preserve high resolution (capped at max_dimension),
    and optionally enhance coin/slab/bar/note detail without altering or cropping the subject.
    Returns (processed_bytes, width, height, extension).
    """
    del remove_background, shape_hint
    with Image.open(io.BytesIO(raw_bytes)) as opened:
        img = ImageOps.exif_transpose(opened)
        orig_format = (opened.format or "PNG").upper()

        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        if enhance:
            img = _enhance_detail(img)

        return _encode_processed_image(img, orig_format=orig_format, force_png=False)


def extract_coin_and_slab_images(
    raw_bytes: bytes,
    *,
    enhance: bool = True,
    max_dimension: int = MAX_IMAGE_DIMENSION,
) -> tuple[tuple[bytes, int, int, str], tuple[bytes, int, int, str] | None]:
    """
    Remove background cleanly and check if the image is a coin inside a rectangular grading slab.
    If a slabbed coin is detected, returns ((coin_bytes, cw, ch, 'png'), (slab_bytes, sw, sh, 'png')).
    Otherwise, falls back to direct circular coin detection on the original image (for raw coins/rounds
    with mirror fields or underexposure) before returning ((cleaned_bytes, w, h, 'png'), None).
    """
    with Image.open(io.BytesIO(raw_bytes)) as opened:
        img = ImageOps.exif_transpose(opened)
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        slab_rgba = _crop_to_subject(_remove_background_grabcut(img))
        circle = detect_coin_in_slab(slab_rgba)

        if circle:
            slab_final = _enhance_detail(slab_rgba) if enhance else slab_rgba
            slab_encoded = _encode_processed_image(slab_final, force_png=True)
            coin_rgba = extract_coin_cutout(slab_rgba, *circle)
            coin_final = _enhance_detail(coin_rgba) if enhance else coin_rgba
            coin_encoded = _encode_processed_image(coin_final, force_png=True)
            return coin_encoded, slab_encoded

        raw_circle = detect_circular_coin(img)
        if raw_circle:
            coin_rgba = extract_coin_cutout(img.convert("RGBA"), *raw_circle)
            coin_final = _enhance_detail(coin_rgba) if enhance else coin_rgba
            return _encode_processed_image(coin_final, force_png=True), None

        slab_final = _enhance_detail(slab_rgba) if enhance else slab_rgba
        return _encode_processed_image(slab_final, force_png=True), None


def rotate_item_image(raw_bytes: bytes, *, degrees: int = 90) -> tuple[bytes, int, int, str]:
    """Rotate an item image clockwise by 90, 180, or 270 degrees, preserving alpha transparency."""
    norm = degrees % 360
    if norm not in (90, 180, 270):
        raise ValueError("Rotation degrees must be a multiple of 90 (90, 180, 270, or -90).")

    with Image.open(io.BytesIO(raw_bytes)) as opened:
        img = ImageOps.exif_transpose(opened)
        orig_format = (opened.format or "PNG").upper()
        if norm == 90:
            rotated = img.transpose(Image.Transpose.ROTATE_270)
        elif norm == 180:
            rotated = img.transpose(Image.Transpose.ROTATE_180)
        else:
            rotated = img.transpose(Image.Transpose.ROTATE_90)
        return _encode_processed_image(
            rotated, orig_format=orig_format, force_png=(rotated.mode == "RGBA")
        )


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
            p95_brightness = float(np.percentile(np.asarray(gray), 95))
            metrics["brightness"] = round(brightness, 1)
            metrics["p95_brightness"] = round(p95_brightness, 1)
            if brightness < 35 and p95_brightness < 60:
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

