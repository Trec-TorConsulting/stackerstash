import { isSupportedImageFile } from "./imageUtils";

export interface FrameQuality {
  label: string;
  tone: 'good' | 'warn';
  isGood: boolean;
}

export type DetectedShape = 'coin' | 'slab' | 'note' | 'card';
export type FramingState = 'none' | 'too_small' | 'edge_clipped' | 'off_center' | 'locked';

export interface SubjectBox {
  /** Normalized 0..1 left coordinate in the viewfinder frame */
  x: number;
  /** Normalized 0..1 top coordinate in the viewfinder frame */
  y: number;
  /** Normalized 0..1 width in the viewfinder frame */
  width: number;
  /** Normalized 0..1 height in the viewfinder frame */
  height: number;
  /** Normalized 0..1 center X */
  centerX: number;
  /** Normalized 0..1 center Y */
  centerY: number;
  /** Fraction of viewfinder area covered by the bounding box */
  areaRatio: number;
  /** Physical aspect ratio of the subject in a 4:3 viewfinder */
  physicalAspect: number;
  /** Classified collectible shape ('coin' | 'slab' | 'note') */
  shape: DetectedShape;
  /** Detection confidence (0..1) */
  confidence: number;
}

export interface FrameMetricsResult {
  meanLuma: number;
  meanEdge: number;
  meanFrameDiff: number;
  innerEdge: number;
  ringEdge: number;
  glareRatio: number;
  hasGlare: boolean;
  isSteady: boolean;
  hasSubject: boolean;
  framingState: FramingState;
  subjectBox: SubjectBox | null;
  detectedShape: DetectedShape;
  quality: FrameQuality;
  recommendedZoom: number;
}

const GLARE_LUMA_THRESHOLD = 246;
const GLARE_RATIO_THRESHOLD = 0.30;
const DEFAULT_VIEWFINDER_ASPECT = 4 / 3;

function sortedPercentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

/** Fill enclosed background holes (e.g. the flat field of a coin). */
function fillHoles2D(mask: Uint8Array, w: number, h: number): Uint8Array {
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

interface Component2D {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  touchesBorder: boolean;
}

function labelComponents2D(mask: Uint8Array, w: number, h: number, borderMargin: number): Component2D[] {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const comps: Component2D[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const c: Component2D = {
      area: 0,
      minX: w,
      minY: h,
      maxX: -1,
      maxY: -1,
      sumX: 0,
      sumY: 0,
      touchesBorder: false,
    };
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
      if (x <= borderMargin || x >= w - 1 - borderMargin || y <= borderMargin || y >= h - 1 - borderMargin) {
        c.touchesBorder = true;
      }
      const nbrs = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
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

/**
 * Detect the primary foreground subject bounding box and classify its geometry
 * ('coin' | 'card' | 'slab' | 'note') using border-background color/luma modeling,
 * morphological hole-filling, 2D connected-component grouping, and center weighting.
 */
export function detectSubjectBox(
  luma: Float32Array,
  width: number,
  height: number,
  rgbaData?: Uint8ClampedArray | null,
  viewfinderAspect = DEFAULT_VIEWFINDER_ASPECT,
): SubjectBox | null {
  if (width < 12 || height < 12 || luma.length < width * height) {
    return null;
  }

  const hasRgba = Boolean(rgbaData && rgbaData.length >= width * height * 4);
  const borderX = Math.max(2, Math.floor(width * 0.08));
  const borderY = Math.max(2, Math.floor(height * 0.08));

  const borderLumas: number[] = [];
  const borderRs: number[] = [];
  const borderGs: number[] = [];
  const borderBs: number[] = [];
  let borderEdgeSum = 0;
  let borderEdgeCount = 0;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder =
        col < borderX || col >= width - borderX || row < borderY || row >= height - borderY;
      if (!isBorder) continue;
      const p = row * width + col;
      borderLumas.push(luma[p]);
      if (hasRgba && rgbaData) {
        const idx = p * 4;
        borderRs.push(rgbaData[idx]);
        borderGs.push(rgbaData[idx + 1]);
        borderBs.push(rgbaData[idx + 2]);
      }
      if (row >= 1 && row < height - 1 && col >= 1 && col < width - 1) {
        const gx = Math.max(Math.abs(luma[p + 1] - luma[p - 1]), Math.abs(luma[p + 1] - luma[p]));
        const gy = Math.max(
          Math.abs(luma[p + width] - luma[p - width]),
          Math.abs(luma[p + width] - luma[p]),
        );
        borderEdgeSum += gx + gy;
        borderEdgeCount++;
      }
    }
  }

  const bgLuma = sortedPercentile(borderLumas, 0.5);
  const lumaDevs = borderLumas.map((v) => Math.abs(v - bgLuma));
  const bgLumaSpread = sortedPercentile(lumaDevs, 0.5);
  const lumaThreshold = Math.min(48, Math.max(12, bgLumaSpread * 2.2 + 8));

  let bgR = bgLuma;
  let bgG = bgLuma;
  let bgB = bgLuma;
  let colorThreshold = 42;
  if (hasRgba) {
    bgR = sortedPercentile(borderRs, 0.5);
    bgG = sortedPercentile(borderGs, 0.5);
    bgB = sortedPercentile(borderBs, 0.5);
    const colorDevs = borderRs.map(
      (r, i) => Math.abs(r - bgR) + Math.abs(borderGs[i] - bgG) + Math.abs(borderBs[i] - bgB),
    );
    const bgColorSpread = sortedPercentile(colorDevs, 0.5);
    colorThreshold = Math.min(110, Math.max(34, bgColorSpread * 2.2 + 16));
  }

  const bgEdgeMean = borderEdgeCount > 0 ? borderEdgeSum / borderEdgeCount : 0;
  const edgeThreshold = Math.min(40, Math.max(16, bgEdgeMean * 2.4 + 10));

  const rawSalient = new Uint8Array(width * height);
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const p = row * width + col;
      const lumaDiff = Math.abs(luma[p] - bgLuma);
      const gx = Math.max(Math.abs(luma[p + 1] - luma[p - 1]), Math.abs(luma[p + 1] - luma[p]));
      const gy = Math.max(
        Math.abs(luma[p + width] - luma[p - width]),
        Math.abs(luma[p + width] - luma[p]),
      );
      const edgeMag = gx + gy;

      let colorDiff = 0;
      if (hasRgba && rgbaData) {
        const idx = p * 4;
        colorDiff =
          Math.abs(rgbaData[idx] - bgR) +
          Math.abs(rgbaData[idx + 1] - bgG) +
          Math.abs(rgbaData[idx + 2] - bgB);
      }

      if (lumaDiff >= lumaThreshold || edgeMag >= edgeThreshold || colorDiff >= colorThreshold) {
        rawSalient[p] = 1;
      }
    }
  }

  // 3x3 neighborhood filter to reject isolated single-pixel surface specks
  const filtered = new Uint8Array(width * height);
  let fgCount = 0;

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const p = row * width + col;
      if (!rawSalient[p]) continue;
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rBase = (row + dr) * width;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (rawSalient[rBase + col + dc]) neighbors++;
        }
      }
      if (neighbors >= 2) {
        filtered[p] = 1;
        fgCount++;
      }
    }
  }

  const interiorPixels = (width - 2) * (height - 2);
  if (fgCount < interiorPixels * 0.015 || fgCount > interiorPixels * 0.92) {
    return null;
  }

  // Morphological hole filling so hollow rims of coins become solid circular discs
  const filled = fillHoles2D(filtered, width, height);

  // 2D connected-component analysis with border margin rejection
  const borderMargin = Math.max(1, Math.floor(Math.min(width, height) * 0.03));
  const comps = labelComponents2D(filled, width, height, borderMargin);

  const minArea = Math.max(6, Math.floor(interiorPixels * 0.012));
  const maxArea = Math.floor(interiorPixels * 0.92);
  const validComps = comps.filter(
    (c) => c.area >= minArea && c.area <= maxArea && c.maxX > c.minX && c.maxY > c.minY,
  );
  if (!validComps.length) {
    return null;
  }

  // Reject or heavily penalize components touching outer borders (hands/shadows)
  const interiorComps = validComps.filter((c) => !c.touchesBorder);
  const candidates = interiorComps.length > 0 ? interiorComps : validComps;

  let bestComp: Component2D | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const cx = c.sumX / (c.area * width);
    const cy = c.sumY / (c.area * height);
    const centerDist = Math.hypot(cx - 0.5, cy - 0.5);
    const centerWeight = Math.max(0.15, 1 - 0.65 * centerDist);
    const borderPenalty = c.touchesBorder ? 0.35 : 1.0;
    const score = c.area * centerWeight * borderPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestComp = c;
    }
  }

  if (!bestComp || bestComp.maxX <= bestComp.minX || bestComp.maxY <= bestComp.minY) {
    return null;
  }

  let minCol = bestComp.minX;
  let maxCol = bestComp.maxX;
  let minRow = bestComp.minY;
  let maxRow = bestComp.maxY;
  let totalArea = bestComp.area;

  // Merge nearby secondary components that belong to the same collectible
  const padX = Math.max(2, Math.floor(width * 0.05));
  const padY = Math.max(2, Math.floor(height * 0.05));
  for (const c of candidates) {
    if (c === bestComp) continue;
    if (c.minX >= minCol && c.maxX <= maxCol && c.minY >= minRow && c.maxY <= maxRow) {
      totalArea += c.area;
      continue;
    }
    const overlaps =
      c.maxX >= minCol - padX &&
      c.minX <= maxCol + padX &&
      c.maxY >= minRow - padY &&
      c.minY <= maxRow + padY;
    if (overlaps && c.area >= bestComp.area * 0.08) {
      minCol = Math.min(minCol, c.minX);
      maxCol = Math.max(maxCol, c.maxX);
      minRow = Math.min(minRow, c.minY);
      maxRow = Math.max(maxRow, c.maxY);
      totalArea += c.area;
    }
  }

  const boxW = maxCol - minCol + 1;
  const boxH = maxRow - minRow + 1;
  const x = minCol / width;
  const y = minRow / height;
  const normW = boxW / width;
  const normH = boxH / height;
  const centerX = x + normW / 2;
  const centerY = y + normH / 2;
  const areaRatio = normW * normH;
  const physicalAspect = (normW * viewfinderAspect) / Math.max(0.01, normH);

  // Evaluate corner fill vs inscribed ellipse to distinguish round coins from square cards/slabs
  const halfW = Math.max(1, boxW / 2);
  const halfH = Math.max(1, boxH / 2);
  const midC = (minCol + maxCol) / 2;
  const midR = (minRow + maxRow) / 2;
  let cornerPixels = 0;
  let cornerFg = 0;
  let boxFg = 0;

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const isFg = filled[r * width + c] === 1;
      if (isFg) boxFg++;
      const nx = (c - midC) / halfW;
      const ny = (r - midR) / halfH;
      if (nx * nx + ny * ny > 1.05) {
        cornerPixels++;
        if (isFg) cornerFg++;
      }
    }
  }

  const cornerFillRatio = cornerPixels > 0 ? cornerFg / cornerPixels : 0;
  const boxFillRatio = boxFg / Math.max(1, boxW * boxH);

  let shape: DetectedShape;
  if (physicalAspect >= 1.58 || physicalAspect <= 0.48) {
    shape = 'note';
  } else if (
    (physicalAspect >= 0.64 && physicalAspect <= 0.79) ||
    (physicalAspect >= 1.27 && physicalAspect <= 1.56)
  ) {
    shape = 'card';
  } else if (physicalAspect < 0.80 || physicalAspect > 1.25) {
    shape = 'slab';
  } else if (boxW >= 18 && boxH >= 18 && cornerFillRatio > 0.68) {
    shape = 'slab';
  } else {
    shape = 'coin';
  }

  const confidence = Math.min(1, Math.max(0.25, boxFillRatio * 1.15));

  return {
    x,
    y,
    width: normW,
    height: normH,
    centerX,
    centerY,
    areaRatio,
    physicalAspect,
    shape,
    confidence,
  };
}

/**
 * Exponential Moving Average (EMA) smoother for live bounding-box coordinates
 * to prevent reticle jitter between viewfinder evaluation ticks.
 */
export function smoothSubjectBox(
  prev: SubjectBox | null,
  next: SubjectBox | null,
  alpha = 0.25,
  viewfinderAspect = DEFAULT_VIEWFINDER_ASPECT,
): SubjectBox | null {
  if (!next) return null;
  if (!prev) return next;
  const clampedAlpha = Math.min(1, Math.max(0.05, alpha));
  const keep = 1 - clampedAlpha;

  const x = prev.x * keep + next.x * clampedAlpha;
  const y = prev.y * keep + next.y * clampedAlpha;
  const width = prev.width * keep + next.width * clampedAlpha;
  const height = prev.height * keep + next.height * clampedAlpha;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const areaRatio = width * height;
  const physicalAspect = (width * viewfinderAspect) / Math.max(0.01, height);

  return {
    x,
    y,
    width,
    height,
    centerX,
    centerY,
    areaRatio,
    physicalAspect,
    shape: next.shape,
    confidence: prev.confidence * keep + next.confidence * clampedAlpha,
  };
}

/**
 * Evaluate framing state for the detected subject bounding box.
 */
export function evaluateFramingState(subjectBox: SubjectBox | null): FramingState {
  if (!subjectBox) return 'none';
  const touchesEdge =
    subjectBox.x <= 0.015 ||
    subjectBox.y <= 0.015 ||
    subjectBox.x + subjectBox.width >= 0.985 ||
    subjectBox.y + subjectBox.height >= 0.985;
  if (touchesEdge) return 'edge_clipped';
  if (subjectBox.areaRatio < 0.04 || (subjectBox.width < 0.16 && subjectBox.height < 0.16)) {
    return 'too_small';
  }
  const centerOffset = Math.hypot(subjectBox.centerX - 0.5, subjectBox.centerY - 0.5);
  if (centerOffset > 0.32) {
    return 'off_center';
  }
  return 'locked';
}

/**
 * Compute mean gradient sharpness score for a grayscale luma buffer.
 * Used to rank burst frames and select the sharpest capture.
 */
export function computeSharpnessScore(
  luma: Float32Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  let edgeSum = 0;
  let edgeCount = 0;
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const p = row * width + col;
      const gx = Math.max(Math.abs(luma[p + 1] - luma[p - 1]), Math.abs(luma[p + 1] - luma[p]));
      const gy = Math.max(
        Math.abs(luma[p + width] - luma[p - width]),
        Math.abs(luma[p + width] - luma[p]),
      );
      edgeSum += gx + gy;
      edgeCount++;
    }
  }
  return edgeCount > 0 ? edgeSum / edgeCount : 0;
}

/**
 * Evaluate exposure, subject-scoped sharpness, specular glare, frame-to-frame
 * stability, live subject bounding box, and shape classification.
 */
export function evaluateFrameMetrics(
  luma: Float32Array,
  prevLuma: Float32Array | null,
  width: number,
  height: number,
  currentZoom: number,
  rgbaData?: Uint8ClampedArray | null,
  prevSubjectBox?: SubjectBox | null,
): FrameMetricsResult {
  const totalPixels = width * height;
  let sumLuma = 0;
  let sumDiff = 0;

  for (let i = 0; i < totalPixels; i++) {
    sumLuma += luma[i];
    if (prevLuma && prevLuma.length === totalPixels) {
      sumDiff += Math.abs(luma[i] - prevLuma[i]);
    }
  }

  const meanLuma = totalPixels > 0 ? sumLuma / totalPixels : 0;
  const meanFrameDiff =
    prevLuma && prevLuma.length === totalPixels && totalPixels > 0
      ? sumDiff / totalPixels
      : Number.POSITIVE_INFINITY;

  const rawSubjectBox = detectSubjectBox(luma, width, height, rgbaData);
  const subjectBox = smoothSubjectBox(prevSubjectBox ?? null, rawSubjectBox);
  const hasSubject = subjectBox !== null;
  const framingState = evaluateFramingState(subjectBox);
  const detectedShape: DetectedShape = subjectBox?.shape ?? 'coin';

  // Scope inner sharpness & glare evaluation to the detected subject box when present
  const innerX0 = subjectBox
    ? Math.max(1, Math.floor(subjectBox.x * width))
    : Math.floor(width * 0.325);
  const innerX1 = subjectBox
    ? Math.min(width - 2, Math.ceil((subjectBox.x + subjectBox.width) * width))
    : Math.ceil(width * 0.675);
  const innerY0 = subjectBox
    ? Math.max(1, Math.floor(subjectBox.y * height))
    : Math.floor(height * 0.325);
  const innerY1 = subjectBox
    ? Math.min(height - 2, Math.ceil((subjectBox.y + subjectBox.height) * height))
    : Math.ceil(height * 0.675);

  const outerX0 = Math.floor(width * 0.1);
  const outerX1 = Math.ceil(width * 0.9);
  const outerY0 = Math.floor(height * 0.1);
  const outerY1 = Math.ceil(height * 0.9);

  let edgeSum = 0;
  let edgeCount = 0;
  let innerEdgeSum = 0;
  let innerCount = 0;
  let innerLumaSum = 0;
  let innerGlareCount = 0;
  let ringEdgeSum = 0;
  let ringCount = 0;

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const p = row * width + col;
      const gx = Math.max(Math.abs(luma[p + 1] - luma[p - 1]), Math.abs(luma[p + 1] - luma[p]));
      const gy = Math.max(
        Math.abs(luma[p + width] - luma[p - width]),
        Math.abs(luma[p + width] - luma[p]),
      );
      const g = gx + gy;
      edgeSum += g;
      edgeCount++;

      const inInner = col >= innerX0 && col <= innerX1 && row >= innerY0 && row <= innerY1;
      if (inInner) {
        innerEdgeSum += g;
        innerLumaSum += luma[p];
        if (luma[p] > GLARE_LUMA_THRESHOLD) {
          innerGlareCount++;
        }
        innerCount++;
      } else if (col >= outerX0 && col <= outerX1 && row >= outerY0 && row <= outerY1) {
        ringEdgeSum += g;
        ringCount++;
      }
    }
  }

  const meanEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const innerEdge = innerCount > 0 ? innerEdgeSum / innerCount : 0;
  const innerLuma = innerCount > 0 ? innerLumaSum / innerCount : meanLuma;
  const glareRatio = innerCount > 0 ? innerGlareCount / innerCount : 0;
  const hasGlare = glareRatio > GLARE_RATIO_THRESHOLD;
  const ringEdge = ringCount > 0 ? ringEdgeSum / ringCount : 0;

  const boxMoved =
    prevSubjectBox && subjectBox
      ? Math.hypot(
          subjectBox.centerX - prevSubjectBox.centerX,
          subjectBox.centerY - prevSubjectBox.centerY,
        ) > 0.08
      : false;
  const isSteady = prevLuma !== null && meanFrameDiff < 22 && !boxMoved;

  // Weight sharpness toward the subject inside the reticle
  const effectiveEdge = Math.max(meanEdge, innerEdge * 0.75);

  let quality: FrameQuality;
  if (hasGlare) {
    quality = { label: 'Glare detected — tilt item or diffuse light', tone: 'warn', isGood: false };
  } else if (innerLuma < 45 && meanLuma < 45) {
    quality = { label: 'Too dark — add more light', tone: 'warn', isGood: false };
  } else if (innerLuma > 238 || meanLuma > 238) {
    quality = { label: 'Too bright — reduce glare', tone: 'warn', isGood: false };
  } else if (framingState === 'none') {
    quality = { label: 'Place coin, note, bar, or slab in frame', tone: 'warn', isGood: false };
  } else if (framingState === 'edge_clipped') {
    quality = {
      label: 'Move back slightly — keep item edges inside frame',
      tone: 'warn',
      isGood: false,
    };
  } else if (framingState === 'too_small') {
    quality = { label: 'Move closer or tap 2x zoom', tone: 'warn', isGood: false };
  } else if (framingState === 'off_center') {
    quality = { label: 'Center item inside viewfinder', tone: 'warn', isGood: false };
  } else if (effectiveEdge < 4.5) {
    quality = { label: 'Focus closer for sharper detail', tone: 'warn', isGood: false };
  } else {
    quality = {
      label: isSteady ? 'Locked & sharp — ready' : 'Ready to capture',
      tone: 'good',
      isGood: true,
    };
  }

  let recommendedZoom = currentZoom;
  if (currentZoom < 2.0 && framingState === 'too_small') {
    recommendedZoom = Math.min(2.0, Number((currentZoom + 0.5).toFixed(2)));
  } else if (currentZoom < 2.0 && innerEdge > 12 && innerEdge / (ringEdge + 1) > 1.8) {
    recommendedZoom = Math.min(2.0, Number((currentZoom + 0.25).toFixed(2)));
  }

  return {
    meanLuma,
    meanEdge,
    meanFrameDiff,
    innerEdge,
    ringEdge,
    glareRatio,
    hasGlare,
    isSteady,
    hasSubject,
    framingState,
    subjectBox,
    detectedShape,
    quality,
    recommendedZoom,
  };
}

/**
 * Evaluate localized specular glare over the central 70% of an RGBA buffer.
 * Returns `{ hasGlare, glareRatio }`.
 */
export function evaluateRgbaGlare(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  threshold = 0.12,
): { hasGlare: boolean; glareRatio: number } {
  if (w < 8 || h < 8 || rgba.length < w * h * 4) {
    return { hasGlare: false, glareRatio: 0 };
  }
  const x0 = Math.floor(w * 0.15);
  const x1 = Math.ceil(w * 0.85);
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.ceil(h * 0.85);
  let glareCount = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (luma >= 242 && spread <= 30) {
        glareCount++;
      }
      total++;
    }
  }
  const glareRatio = total > 0 ? glareCount / total : 0;
  return { hasGlare: glareRatio > threshold, glareRatio };
}

/**
 * Decode an image File onto a small offscreen canvas and check for localized specular glare.
 * Never throws; returns `{ hasGlare: false, glareRatio: 0 }` when decoding is unsupported.
 */
export async function evaluateImageFileGlare(
  file: File,
): Promise<{ hasGlare: boolean; glareRatio: number }> {
  if (typeof document === "undefined" || !isSupportedImageFile(file)) {
    return { hasGlare: false, glareRatio: 0 };
  }
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode failed"));
        el.src = url;
      });
      const maxDim = 160;
      const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { hasGlare: false, glareRatio: 0 };
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      return evaluateRgbaGlare(data, w, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return { hasGlare: false, glareRatio: 0 };
  }
}
