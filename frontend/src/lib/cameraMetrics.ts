export interface FrameQuality {
  label: string;
  tone: 'good' | 'warn';
  isGood: boolean;
}

export type DetectedShape = 'coin' | 'slab' | 'note';
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
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

/**
 * Detect the primary foreground subject bounding box and classify its geometry
 * ('coin' | 'slab' | 'note') using border-background color/luma modeling and
 * interior gradient saliency.
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
  const colCounts = new Int32Array(width);
  const rowCounts = new Int32Array(height);
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
        colCounts[col]++;
        rowCounts[row]++;
        fgCount++;
      }
    }
  }

  const interiorPixels = (width - 2) * (height - 2);
  if (fgCount < interiorPixels * 0.015 || fgCount > interiorPixels * 0.92) {
    return null;
  }

  let maxColCount = 0;
  for (let c = 1; c < width - 1; c++) {
    if (colCounts[c] > maxColCount) maxColCount = colCounts[c];
  }
  let maxRowCount = 0;
  for (let r = 1; r < height - 1; r++) {
    if (rowCounts[r] > maxRowCount) maxRowCount = rowCounts[r];
  }

  const colCut = Math.max(1, Math.floor(maxColCount * 0.15));
  const rowCut = Math.max(1, Math.floor(maxRowCount * 0.15));

  const pickBestSpan = (counts: Int32Array, limit: number, cut: number): [number, number] => {
    let bestStart = limit - 1;
    let bestEnd = 0;
    let bestScore = -1;

    let i = 1;
    while (i < limit - 1) {
      if (counts[i] < cut) {
        i++;
        continue;
      }
      const start = i;
      let mass = 0;
      while (i < limit - 1 && counts[i] >= cut) {
        mass += counts[i];
        i++;
      }
      const end = i - 1;
      const midNorm = (start + end) / (2 * limit);
      const centerWeight = 1 - 0.35 * Math.abs(midNorm - 0.5);
      const score = mass * centerWeight;
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
        bestEnd = end;
      }
    }
    return [bestStart, bestEnd];
  };

  const [minCol, maxCol] = pickBestSpan(colCounts, width, colCut);
  const [minRow, maxRow] = pickBestSpan(rowCounts, height, rowCut);

  if (maxCol <= minCol || maxRow <= minRow) {
    return null;
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

  // Evaluate corner fill vs inscribed ellipse to distinguish round coins from square bars/slabs
  const halfW = Math.max(1, boxW / 2);
  const halfH = Math.max(1, boxH / 2);
  const midC = (minCol + maxCol) / 2;
  const midR = (minRow + maxRow) / 2;
  let cornerPixels = 0;
  let cornerFg = 0;
  let boxFg = 0;

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const isFg = filtered[r * width + c] === 1;
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
  if (physicalAspect >= 1.52 || physicalAspect <= 0.52) {
    shape = 'note';
  } else if (physicalAspect < 0.8 || physicalAspect > 1.26) {
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
