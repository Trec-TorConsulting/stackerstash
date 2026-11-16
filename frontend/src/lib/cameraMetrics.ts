export interface FrameQuality {
  label: string;
  tone: 'good' | 'warn';
  isGood: boolean;
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
  quality: FrameQuality;
  recommendedZoom: number;
}

const GLARE_LUMA_THRESHOLD = 240;
const GLARE_RATIO_THRESHOLD = 0.04;

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
      const gx = Math.abs(luma[p + 1] - luma[p - 1]);
      const gy = Math.abs(luma[p + width] - luma[p - width]);
      edgeSum += gx + gy;
      edgeCount++;
    }
  }
  return edgeCount > 0 ? edgeSum / edgeCount : 0;
}

/**
 * Evaluate exposure, reticle-weighted sharpness, specular glare, frame-to-frame
 * stability, and center-vs-ring subject framing from a grayscale luma buffer.
 */
export function evaluateFrameMetrics(
  luma: Float32Array,
  prevLuma: Float32Array | null,
  width: number,
  height: number,
  currentZoom: number,
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

  const innerX0 = Math.floor(width * 0.325);
  const innerX1 = Math.ceil(width * 0.675);
  const innerY0 = Math.floor(height * 0.325);
  const innerY1 = Math.ceil(height * 0.675);

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
      const gx = Math.abs(luma[p + 1] - luma[p - 1]);
      const gy = Math.abs(luma[p + width] - luma[p - width]);
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
  const isSteady = prevLuma !== null && meanFrameDiff < 11.5;

  // Weight sharpness toward the subject inside the reticle
  const effectiveEdge = Math.max(meanEdge, innerEdge * 0.75);

  let quality: FrameQuality;
  if (hasGlare) {
    quality = { label: 'Glare detected — tilt item or diffuse light', tone: 'warn', isGood: false };
  } else if (innerLuma < 45 && meanLuma < 45) {
    quality = { label: 'Too dark — add more light', tone: 'warn', isGood: false };
  } else if (innerLuma > 238 || meanLuma > 238) {
    quality = { label: 'Too bright — reduce glare', tone: 'warn', isGood: false };
  } else if (effectiveEdge < 7.5) {
    quality = { label: 'Focus closer for sharper detail', tone: 'warn', isGood: false };
  } else {
    quality = {
      label: isSteady ? 'Sharp & ready' : 'Ready to capture',
      tone: 'good',
      isGood: true,
    };
  }

  let recommendedZoom = currentZoom;
  if (currentZoom < 2.0 && innerEdge > 12 && innerEdge / (ringEdge + 1) > 1.8) {
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
    quality,
    recommendedZoom,
  };
}
