/**
 * Still-image subject edge detection and auto-crop.
 *
 * Runs entirely in the browser on photos coming from the native camera, the
 * file picker, drag-and-drop, or the clipboard. The analysis pass works on a
 * small downscaled copy (≤ ANALYSIS_MAX_DIM px) so it is fast on low-end
 * phones; the crop itself is applied to the full-resolution, EXIF-upright
 * pixels so no detail is lost.
 *
 * Design goals:
 *  - Conservative: when detection is not confident, the original photo is kept
 *    untouched (a bad crop is worse than no crop).
 *  - Never throws: every failure path resolves to the original file with a
 *    machine-readable `reason`.
 *  - Zero runtime dependencies and no background removal (rectangle crop only).
 */
import { canvasToOptimizedBlob, decodeImageBitmapUpright } from "./imageUtils";

export type AutoCropShape = "coin" | "rect";

export interface AutoCropDetection {
  /** Normalized (0..1) bounding box of the detected subject in the analysed image. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fraction of the frame covered by the subject bounding box. */
  areaRatio: number;
  /** Fraction of the bounding box filled by the subject mask. */
  fillRatio: number;
  /** Number of frame edges (0..4) the subject box touches. */
  edgesTouched: number;
  shape: AutoCropShape;
  /** Overall detection confidence (0..1). */
  confidence: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AutoCropReason =
  | "cropped"
  | "disabled"
  | "unsupported"
  | "not_image"
  | "too_small"
  | "decode_failed"
  | "no_subject"
  | "low_confidence"
  | "subject_clipped"
  | "insufficient_gain"
  | "timeout"
  | "error";

export interface AutoCropResult {
  /** Cropped file when `applied`, otherwise the original file. */
  file: File;
  applied: boolean;
  reason: AutoCropReason;
  detection?: AutoCropDetection;
  /** Crop rectangle in full-resolution, EXIF-upright source pixels. */
  cropRect?: PixelRect;
  /** Full-resolution, EXIF-upright source image dimensions (when decoded). */
  sourceSize?: { width: number; height: number };
  durationMs: number;
}

export interface AutoCropOptions {
  /** Abort and keep the original after this many ms. */
  timeoutMs?: number;
  /** Minimum detection confidence required to crop. */
  minConfidence?: number;
  /** Padding around the subject as a fraction of its longest side. */
  paddingRatio?: number;
  /** Skip cropping when the crop would keep more than this fraction of the frame. */
  maxKeepRatio?: number;
  /** Cap on the output long side (keeps canvases within mobile Safari limits). */
  maxOutputDimension?: number;
  jpegQuality?: number;
}

export const AUTO_CROP_DEFAULTS: Required<AutoCropOptions> = {
  timeoutMs: 4000,
  minConfidence: 0.55,
  paddingRatio: 0.06,
  maxKeepRatio: 0.9,
  maxOutputDimension: 1600,
  jpegQuality: 0.83,
};

export const ANALYSIS_MAX_DIM = 256;
const MIN_SOURCE_DIM = 64;
const MIN_SUBJECT_AREA = 0.03;
const MAX_SUBJECT_AREA = 0.95;
const MIN_FILL_RATIO = 0.58;
const KMEANS_K = 3;
const KMEANS_ITERS = 6;

/* ------------------------------------------------------------------------ */
/* Pure analysis (unit-testable without a DOM)                              */
/* ------------------------------------------------------------------------ */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}

function colorDist(r: number, g: number, b: number, c: Rgb): number {
  return Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b);
}

/**
 * Build a small background palette (k-means over the frame border) so two-tone
 * desks, mats, and shadow gradients are all treated as background.
 */
function buildBackgroundPalette(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  band: number,
): { centers: Rgb[]; thresholds: number[] } {
  const samples: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 96));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue;
      const i = (y * w + x) * 4;
      samples.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    }
  }

  // Deterministic init: spread seeds across luma-sorted samples.
  const byLuma = [...samples].sort(
    (a, b) => a.r * 0.299 + a.g * 0.587 + a.b * 0.114 - (b.r * 0.299 + b.g * 0.587 + b.b * 0.114),
  );
  const k = Math.min(KMEANS_K, samples.length);
  let centers: Rgb[] = [];
  for (let c = 0; c < k; c++) {
    centers.push({ ...byLuma[Math.floor(((c + 0.5) / k) * (byLuma.length - 1))] });
  }

  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < KMEANS_ITERS; iter++) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let s = 0; s < samples.length; s++) {
      const p = samples[s];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = colorDist(p.r, p.g, p.b, centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[s] = best;
      sums[best].r += p.r;
      sums[best].g += p.g;
      sums[best].b += p.b;
      sums[best].n++;
    }
    centers = centers.map((c, i) =>
      sums[i].n > 0 ? { r: sums[i].r / sums[i].n, g: sums[i].g / sums[i].n, b: sums[i].b / sums[i].n } : c,
    );
  }

  // Drop clusters that hold < 8% of the border (likely a finger or a wide
  // subject grazing the outer margin) so they are not learned as background.
  const counts = new Array(centers.length).fill(0);
  const devs: number[][] = centers.map(() => []);
  for (let s = 0; s < samples.length; s++) {
    counts[assign[s]]++;
    const p = samples[s];
    devs[assign[s]].push(colorDist(p.r, p.g, p.b, centers[assign[s]]));
  }
  const keep: number[] = [];
  for (let c = 0; c < centers.length; c++) {
    if (counts[c] >= samples.length * 0.08) keep.push(c);
  }
  if (keep.length === 0) keep.push(counts.indexOf(Math.max(...counts)));

  return {
    centers: keep.map((c) => centers[c]),
    thresholds: keep.map((c) => Math.min(95, Math.max(28, percentile(devs[c], 0.9) * 1.5 + 12))),
  };
}

function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  // Separable box dilation.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && mask[y * w + xx]) on = 1;
      }
      tmp[y * w + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) on = 1;
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const grown = dilate(inv, w, h, radius);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/** Fill enclosed background holes (e.g. the flat field of a coin). */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const reach = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (p: number) => {
    if (!mask[p] && !reach[p]) {
      reach[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = reach[i] ? 0 : 1;
  return out;
}

interface Component {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

function labelComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const comps: Component[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const c: Component = { area: 0, minX: w, minY: h, maxX: -1, maxY: -1, sumX: 0, sumY: 0 };
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      c.sumX += x;
      c.sumY += y;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      const nbrs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const n of nbrs) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    comps.push(c);
  }
  return comps;
}

/** Lightweight 3x3 box smooth to suppress high-frequency mat weave (e.g. carbon fiber). */
function smoothRgba3x3(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < w - 1 ? x + 1 : w - 1;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          const idx = (row + xx) * 4;
          sr += rgba[idx];
          sg += rgba[idx + 1];
          sb += rgba[idx + 2];
          count++;
        }
      }
      const dst = (y * w + x) * 4;
      out[dst] = Math.round(sr / count);
      out[dst + 1] = Math.round(sg / count);
      out[dst + 2] = Math.round(sb / count);
      out[dst + 3] = rgba[dst + 3];
    }
  }
  return out;
}

/**
 * Detect the primary collectible in an RGBA buffer and return its bounding box.
 * Returns null when no plausible subject is found.
 */
export function detectSubjectInRgba(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): AutoCropDetection | null {
  if (w < 16 || h < 16 || rgba.length < w * h * 4) return null;

  const smoothed = smoothRgba3x3(rgba, w, h);
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.025));
  const { centers, thresholds } = buildBackgroundPalette(smoothed, w, h, band);

  // Luma + gradient on original buffer so sharp background seams aren't widened;
  // gradient threshold adapts to border texture.
  const luma = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    luma[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  const grad = new Float32Array(w * h);
  const borderGrads: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        luma[p - w + 1] + 2 * luma[p + 1] + luma[p + w + 1] - luma[p - w - 1] - 2 * luma[p - 1] - luma[p + w - 1];
      const gy =
        luma[p + w - 1] + 2 * luma[p + w] + luma[p + w + 1] - luma[p - w - 1] - 2 * luma[p - w] - luma[p - w + 1];
      const g = (Math.abs(gx) + Math.abs(gy)) / 4;
      grad[p] = g;
      if (x < band || x >= w - band || y < band || y >= h - band) borderGrads.push(g);
    }
  }
  const gradThreshold = Math.min(60, Math.max(14, percentile(borderGrads, 0.95) * 1.5 + 6));

  let mask: Uint8Array = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const r = smoothed[i];
    const g = smoothed[i + 1];
    const b = smoothed[i + 2];
    let isBg = false;
    for (let c = 0; c < centers.length; c++) {
      if (colorDist(r, g, b, centers[c]) <= thresholds[c]) {
        isBg = true;
        break;
      }
    }
    if (!isBg || grad[p] >= gradThreshold) mask[p] = 1;
  }

  // Morphological open (remove specks) then close (bridge rim gaps), then fill holes.
  const r = Math.max(1, Math.round(Math.min(w, h) / 160));
  mask = dilate(erode(mask, w, h, r), w, h, r);
  mask = erode(dilate(mask, w, h, r), w, h, r);
  mask = fillHoles(mask, w, h);

  const comps = labelComponents(mask, w, h).filter((c) => c.area >= w * h * 0.002);
  if (comps.length === 0) return null;

  // Score: area weighted toward the frame centre; penalise border-hugging blobs.
  let best: Component | null = null;
  let bestScore = -Infinity;
  for (const c of comps) {
    const cx = c.sumX / c.area / w;
    const cy = c.sumY / c.area / h;
    const centre = 1 - Math.min(0.8, Math.hypot(cx - 0.5, cy - 0.5) * 1.1);
    const touches =
      Number(c.minX <= 0) + Number(c.minY <= 0) + Number(c.maxX >= w - 1) + Number(c.maxY >= h - 1);
    const score = c.area * centre * (touches >= 2 ? 0.25 : touches === 1 ? 0.7 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;

  // Merge satellite components (e.g. a slab label separated by a gap) that sit
  // inside a slightly expanded box around the winner.
  let { minX, minY, maxX, maxY } = best;
  let area = best.area;
  let changed = true;
  while (changed) {
    changed = false;
    const padX = (maxX - minX + 1) * 0.08;
    const padY = (maxY - minY + 1) * 0.08;
    for (const c of comps) {
      if (c === best) continue;
      if (c.minX >= minX && c.maxX <= maxX && c.minY >= minY && c.maxY <= maxY) continue;
      const overlaps =
        c.maxX >= minX - padX && c.minX <= maxX + padX && c.maxY >= minY - padY && c.minY <= maxY + padY;
      if (overlaps && c.area >= best.area * 0.02) {
        const nMinX = Math.min(minX, c.minX);
        const nMinY = Math.min(minY, c.minY);
        const nMaxX = Math.max(maxX, c.maxX);
        const nMaxY = Math.max(maxY, c.maxY);
        if (nMinX !== minX || nMinY !== minY || nMaxX !== maxX || nMaxY !== maxY) {
          minX = nMinX;
          minY = nMinY;
          maxX = nMaxX;
          maxY = nMaxY;
          area += c.area;
          changed = true;
        }
      }
    }
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const areaRatio = (bw * bh) / (w * h);
  const fillRatio = Math.min(1, area / (bw * bh));
  const edgesTouched =
    Number(minX <= 1) + Number(minY <= 1) + Number(maxX >= w - 2) + Number(maxY >= h - 2);

  const aspect = bw / bh;
  const shape: AutoCropShape =
    aspect > 0.85 && aspect < 1.18 && fillRatio > 0.62 && fillRatio < 0.9 ? "coin" : "rect";

  // Confidence blends mask solidity, sensible size, and isolation from edges.
  const fillScore = Math.min(1, Math.max(0, (fillRatio - 0.35) / 0.45));
  const sizeScore =
    areaRatio < MIN_SUBJECT_AREA || areaRatio > MAX_SUBJECT_AREA
      ? 0
      : areaRatio < 0.08
        ? (areaRatio - MIN_SUBJECT_AREA) / (0.08 - MIN_SUBJECT_AREA)
        : 1;
  const edgeScore = edgesTouched === 0 ? 1 : edgesTouched === 1 ? 0.6 : 0.1;
  const confidence = Math.max(0, Math.min(1, fillScore * 0.5 + sizeScore * 0.25 + edgeScore * 0.25));

  return {
    x: minX / w,
    y: minY / h,
    width: bw / w,
    height: bh / h,
    areaRatio,
    fillRatio,
    edgesTouched,
    shape,
    confidence,
  };
}

/**
 * Decide whether a detection is good enough to crop. Returns the skip reason or
 * null when cropping should proceed.
 */
export function evaluateDetection(
  detection: AutoCropDetection | null,
  minConfidence = AUTO_CROP_DEFAULTS.minConfidence,
): Exclude<AutoCropReason, "cropped"> | null {
  if (!detection) return "no_subject";
  if (detection.areaRatio < MIN_SUBJECT_AREA || detection.areaRatio > MAX_SUBJECT_AREA) return "no_subject";
  if (detection.edgesTouched >= 2) return "subject_clipped";
  if (detection.fillRatio < MIN_FILL_RATIO || detection.confidence < minConfidence) return "low_confidence";
  return null;
}

/**
 * Map a normalized detection onto full-resolution source pixels with padding.
 * Coins get a square crop so rims are never clipped asymmetrically.
 */
export function computeAutoCropRect(
  detection: AutoCropDetection,
  srcW: number,
  srcH: number,
  paddingRatio = AUTO_CROP_DEFAULTS.paddingRatio,
): PixelRect {
  const bx = detection.x * srcW;
  const by = detection.y * srcH;
  const bw = detection.width * srcW;
  const bh = detection.height * srcH;
  const pad = Math.max(bw, bh) * paddingRatio + Math.max(srcW, srcH) / ANALYSIS_MAX_DIM;

  let w = bw + pad * 2;
  let h = bh + pad * 2;
  if (detection.shape === "coin") {
    const side = Math.min(Math.max(w, h), srcW, srcH);
    w = side;
    h = side;
  }
  w = Math.min(srcW, w);
  h = Math.min(srcH, h);

  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const x = Math.max(0, Math.min(srcW - w, cx - w / 2));
  const y = Math.max(0, Math.min(srcH - h, cy - h / 2));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(Math.min(w, srcW - Math.round(x)))),
    height: Math.max(1, Math.round(Math.min(h, srcH - Math.round(y)))),
  };
}

/* ------------------------------------------------------------------------ */
/* Browser integration                                                      */
/* ------------------------------------------------------------------------ */

/** True when the current runtime can decode and re-encode images on a canvas. */
export function isAutoCropSupported(): boolean {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return false;
  try {
    const canvas = document.createElement("canvas");
    return typeof canvas.toBlob === "function" && Boolean(canvas.getContext("2d"));
  } catch {
    return false;
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

class AutoCropTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AutoCropTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function runAutoCrop(
  file: File,
  opts: Required<AutoCropOptions>,
  started: number,
): Promise<AutoCropResult> {
  const keep = (reason: AutoCropReason, detection?: AutoCropDetection): AutoCropResult => ({
    file,
    applied: false,
    reason,
    detection,
    durationMs: now() - started,
  });

  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImageBitmapUpright(file);
  } catch {
    return keep("decode_failed");
  }

  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (srcW < MIN_SOURCE_DIM || srcH < MIN_SOURCE_DIM) return keep("too_small");

    const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(srcW, srcH));
    const aw = Math.max(16, Math.round(srcW * scale));
    const ah = Math.max(16, Math.round(srcH * scale));
    const analysis = document.createElement("canvas");
    analysis.width = aw;
    analysis.height = ah;
    const actx = analysis.getContext("2d", { willReadFrequently: true });
    if (!actx) return keep("unsupported");
    actx.imageSmoothingEnabled = true;
    actx.imageSmoothingQuality = "medium";
    actx.drawImage(bitmap, 0, 0, aw, ah);
    const { data } = actx.getImageData(0, 0, aw, ah);

    const detection = detectSubjectInRgba(data, aw, ah);
    const skip = evaluateDetection(detection, opts.minConfidence);
    if (skip || !detection) return keep(skip ?? "no_subject", detection ?? undefined);

    const cropRect = computeAutoCropRect(detection, srcW, srcH, opts.paddingRatio);
    if ((cropRect.width * cropRect.height) / (srcW * srcH) > opts.maxKeepRatio) {
      return keep("insufficient_gain", detection);
    }

    const outScale = Math.min(1, opts.maxOutputDimension / Math.max(cropRect.width, cropRect.height));
    const outW = Math.max(1, Math.round(cropRect.width * outScale));
    const outH = Math.max(1, Math.round(cropRect.height * outScale));
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) return keep("unsupported", detection);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(bitmap, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, outW, outH);

    const encoded = await canvasToOptimizedBlob(out, opts.jpegQuality);
    // Release the large backing store promptly on memory-constrained devices.
    out.width = 0;
    out.height = 0;
    if (!encoded || encoded.blob.size === 0) return keep("error", detection);

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([encoded.blob], `${baseName}-autocrop.${encoded.ext}`, {
        type: encoded.mimeType,
        lastModified: file.lastModified,
      }),
      applied: true,
      reason: "cropped",
      detection,
      cropRect,
      sourceSize: { width: srcW, height: srcH },
      durationMs: now() - started,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Detect the collectible's edges in a photo and return a tightly cropped copy.
 * Always resolves; when cropping is not appropriate the original file is returned
 * with `applied: false` and the reason.
 */
export async function autoCropImageFile(file: File, options: AutoCropOptions = {}): Promise<AutoCropResult> {
  const opts = { ...AUTO_CROP_DEFAULTS, ...options };
  const started = now();
  if (file.type && !file.type.startsWith("image/")) {
    return { file, applied: false, reason: "not_image", durationMs: 0 };
  }
  if (!isAutoCropSupported()) {
    return { file, applied: false, reason: "unsupported", durationMs: 0 };
  }
  try {
    return await withTimeout(runAutoCrop(file, opts, started), opts.timeoutMs);
  } catch (err) {
    return {
      file,
      applied: false,
      reason: err instanceof AutoCropTimeout ? "timeout" : "error",
      durationMs: now() - started,
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Front / Back Symmetry Harmonization                                      */
/* ------------------------------------------------------------------------ */

/**
 * Expand (never shrink) a crop rectangle around its center so its aspect ratio
 * matches `targetAspect`, clamped within `(srcW, srcH)`.
 */
export function expandRectToAspect(
  rect: PixelRect,
  targetAspect: number,
  srcW: number,
  srcH: number,
): PixelRect {
  if (srcW < 1 || srcH < 1 || targetAspect <= 0) return rect;
  const curAspect = rect.width / Math.max(1, rect.height);
  let w = rect.width;
  let h = rect.height;
  if (curAspect < targetAspect) {
    w = Math.min(srcW, h * targetAspect);
  } else if (curAspect > targetAspect) {
    h = Math.min(srcH, w / targetAspect);
  }
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const x = Math.max(0, Math.min(srcW - w, cx - w / 2));
  const y = Math.max(0, Math.min(srcH - h, cy - h / 2));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(Math.min(w, srcW - Math.round(x)))),
    height: Math.max(1, Math.round(Math.min(h, srcH - Math.round(y)))),
  };
}

/**
 * Compute symmetrical target crop rectangles and shared output pixel dimensions
 * for a Front/Back (Obverse/Reverse) pair of the same item. Returns `null` when
 * orientations are incompatible (e.g. one side photographed portrait, one landscape).
 */
export function computeSymmetricalPairPlan(
  a: { cropRect: PixelRect; sourceSize: { width: number; height: number }; shape?: AutoCropShape },
  b: { cropRect: PixelRect; sourceSize: { width: number; height: number }; shape?: AutoCropShape },
  maxOutputDimension = AUTO_CROP_DEFAULTS.maxOutputDimension,
): { rectA: PixelRect; rectB: PixelRect; outW: number; outH: number } | null {
  const aspectA = a.cropRect.width / Math.max(1, a.cropRect.height);
  const aspectB = b.cropRect.width / Math.max(1, b.cropRect.height);
  const isNearSquare = (asp: number) => asp >= 0.85 && asp <= 1.18;
  const sameOrientation =
    (a.cropRect.width >= a.cropRect.height) === (b.cropRect.width >= b.cropRect.height) ||
    isNearSquare(aspectA) ||
    isNearSquare(aspectB);
  if (!sameOrientation) return null;

  const targetAspect =
    (a.shape === "coin" || b.shape === "coin") &&
    aspectA >= 0.8 &&
    aspectA <= 1.25 &&
    aspectB >= 0.8 &&
    aspectB <= 1.25
      ? 1.0
      : Math.sqrt(aspectA * aspectB);

  const rectA = expandRectToAspect(a.cropRect, targetAspect, a.sourceSize.width, a.sourceSize.height);
  const rectB = expandRectToAspect(b.cropRect, targetAspect, b.sourceSize.width, b.sourceSize.height);

  const capA = Math.min(1, maxOutputDimension / Math.max(rectA.width, rectA.height));
  const capB = Math.min(1, maxOutputDimension / Math.max(rectB.width, rectB.height));
  const outW = Math.max(1, Math.round(Math.min(rectA.width * capA, rectB.width * capB)));
  const outH = Math.max(1, Math.round(outW / targetAspect));

  return { rectA, rectB, outW, outH };
}

async function renderRectToSize(
  originalFile: File,
  rect: PixelRect,
  outW: number,
  outH: number,
  quality = AUTO_CROP_DEFAULTS.jpegQuality,
): Promise<File | null> {
  if (!isAutoCropSupported()) return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeImageBitmapUpright(originalFile);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, outW, outH);
    const encoded = await canvasToOptimizedBlob(out, quality);
    out.width = 0;
    out.height = 0;
    if (!encoded || encoded.blob.size === 0) return null;
    const baseName = originalFile.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([encoded.blob], `${baseName}-autocrop.${encoded.ext}`, {
      type: encoded.mimeType,
      lastModified: originalFile.lastModified,
    });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Re-render a Front/Back pair to identical aspect ratio and output dimensions
 * so both sides of the same collectible look symmetrical in the UI.
 */
export async function harmonizeCropPair(
  origA: File,
  resA: AutoCropResult,
  origB: File,
  resB: AutoCropResult,
): Promise<{ fileA: File; rectA: PixelRect; fileB: File; rectB: PixelRect } | null> {
  if (!resA.applied || !resB.applied || !resA.cropRect || !resB.cropRect) return null;
  if (!resA.sourceSize || !resB.sourceSize) return null;

  const plan = computeSymmetricalPairPlan(
    { cropRect: resA.cropRect, sourceSize: resA.sourceSize, shape: resA.detection?.shape },
    { cropRect: resB.cropRect, sourceSize: resB.sourceSize, shape: resB.detection?.shape },
  );
  if (!plan) return null;

  const [fileA, fileB] = await Promise.all([
    renderRectToSize(origA, plan.rectA, plan.outW, plan.outH),
    renderRectToSize(origB, plan.rectB, plan.outW, plan.outH),
  ]);
  if (!fileA || !fileB) return null;
  return { fileA, rectA: plan.rectA, fileB, rectB: plan.rectB };
}

/* ------------------------------------------------------------------------ */
/* User preference                                                          */
/* ------------------------------------------------------------------------ */

export const AUTO_CROP_PREF_KEY = "stackerstash.autoCrop.enabled";

export function readAutoCropPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUTO_CROP_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeAutoCropPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(AUTO_CROP_PREF_KEY, enabled ? "true" : "false");
  } catch {
    // Storage may be unavailable (private mode / quota); preference is session-only then.
  }
}
