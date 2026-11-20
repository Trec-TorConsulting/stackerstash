import { api } from "./api";

export interface PixelCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SUPPORTED_IMAGE_EXTENSIONS = [
  "heic",
  "heif",
  "hif",
  "jpg",
  "jpeg",
  "jfif",
  "jpe",
  "png",
  "webp",
  "avif",
  "bmp",
  "dib",
  "tiff",
  "tif",
  "gif",
] as const;

export const SUPPORTED_IMAGE_ACCEPT =
  "image/*,.heic,.heif,.hif,.avif,.webp,.png,.jpg,.jpeg,.jfif,.bmp,.tiff,.tif,.gif,image/heic,image/heif,image/avif";

export function isSupportedImageFile(file: File | Blob): boolean {
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }
  const name = "name" in file && typeof file.name === "string" ? file.name : "";
  if (!name) {
    return !file.type;
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]);
}

export function isHeicFile(file: File | Blob): boolean {
  const type = (file.type || "").toLowerCase();
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  ) {
    return true;
  }
  const name = "name" in file && typeof file.name === "string" ? file.name : "";
  if (/\.(heic|heif|hif)$/i.test(name)) {
    return true;
  }
  return false;
}

/**
 * Convert a HEIC/HEIF File or Blob to a standard JPEG File for universal browser rendering
 * and downstream image processing.
 */
export async function convertHeicToJpeg(file: File | Blob, _quality = 0.92): Promise<File> {
  if (typeof window === "undefined") {
    return file instanceof File ? file : new File([file], "converted.jpg", { type: "image/jpeg" });
  }

  // Authoritative server-side conversion via backend pillow-heif:
  // Decodes any HEIC/HEIF format (including 24MP-48MP iPhone 14/15/16 ProRAW/HDR photos),
  // applies upright EXIF orientation, and returns an optimized JPEG without browser Wasm memory limits or CSP EvalErrors.
  try {
    const rawName = "name" in file && typeof file.name === "string" ? file.name : "photo.heic";
    const converted = await api.convertImageToJpeg(file, rawName);
    if (converted && converted.size > 0) {
      return converted;
    }
  } catch (serverErr) {
    console.warn("Server-side HEIC conversion failed:", serverErr);
  }

  return file instanceof File ? file : new File([file], "photo.heic", { type: "image/heic" });
}

export interface SourceCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface NormalizedSubjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: "coin" | "slab" | "note";
}

/**
 * Decode a Blob or File into an ImageBitmap with EXIF orientation baked upright.
 */
export async function decodeImageBitmapUpright(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(source);
  }
}

/**
 * Compute the exact source-pixel crop rectangle matching a centered CSS
 * `object-cover` container of `targetAspect` (e.g. 4/3) and software `zoom`.
 */
export function computeCoverCropRect(
  srcW: number,
  srcH: number,
  targetAspect: number,
  zoom = 1,
): SourceCropRect {
  const safeW = Math.max(1, srcW);
  const safeH = Math.max(1, srcH);
  const safeZoom = Math.max(1, zoom);
  const srcAspect = safeW / safeH;

  let visW = safeW;
  let visH = safeH;
  if (srcAspect > targetAspect) {
    visW = safeH * targetAspect;
  } else if (srcAspect < targetAspect) {
    visH = safeW / targetAspect;
  }

  const sw = Math.max(1, Math.min(safeW, Math.round(visW / safeZoom)));
  const sh = Math.max(1, Math.min(safeH, Math.round(visH / safeZoom)));
  const sx = Math.max(0, Math.round((safeW - sw) / 2));
  const sy = Math.max(0, Math.round((safeH - sh) / 2));
  return { sx, sy, sw, sh };
}

/**
 * Map a normalized viewfinder subject bounding box (0..1) onto the visible
 * sensor crop rectangle, adding protective margin and enforcing 1:1 square
 * framing for round coins so rims and edges are never clipped.
 */
export function computeSubjectCropRect(
  srcW: number,
  srcH: number,
  viewfinderAspect: number,
  zoom: number,
  subjectBox: NormalizedSubjectBounds,
  paddingFactor = 1.28,
): SourceCropRect {
  const vp = computeCoverCropRect(srcW, srcH, viewfinderAspect, zoom);
  const cx = vp.sx + (subjectBox.x + subjectBox.width / 2) * vp.sw;
  const cy = vp.sy + (subjectBox.y + subjectBox.height / 2) * vp.sh;

  let targetW = Math.max(vp.sw * 0.35, subjectBox.width * vp.sw * paddingFactor);
  let targetH = Math.max(vp.sh * 0.35, subjectBox.height * vp.sh * paddingFactor);

  if (subjectBox.shape === "coin") {
    const side = Math.min(Math.min(vp.sw, vp.sh), Math.max(targetW, targetH));
    targetW = side;
    targetH = side;
  } else {
    targetW = Math.min(vp.sw, targetW);
    targetH = Math.min(vp.sh, targetH);
  }

  const sw = Math.max(1, Math.round(targetW));
  const sh = Math.max(1, Math.round(targetH));
  const minX = vp.sx;
  const maxX = vp.sx + vp.sw - sw;
  const minY = vp.sy;
  const maxY = vp.sy + vp.sh - sh;

  const sx = Math.max(minX, Math.min(maxX, Math.round(cx - sw / 2)));
  const sy = Math.max(minY, Math.min(maxY, Math.round(cy - sh / 2)));
  return { sx, sy, sw, sh };
}

export interface OptimizedBlobResult {
  blob: Blob;
  mimeType: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
}

/**
 * Encode a canvas as WebP when supported by the browser, falling back to JPEG.
 */
export async function canvasToOptimizedBlob(
  canvas: HTMLCanvasElement,
  quality = 0.82,
): Promise<OptimizedBlobResult | null> {
  const webpBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality)
  );
  if (webpBlob && webpBlob.type === "image/webp") {
    return { blob: webpBlob, mimeType: "image/webp", ext: "webp" };
  }
  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!jpegBlob) return null;
  return { blob: jpegBlob, mimeType: "image/jpeg", ext: "jpg" };
}

/**
 * Render a cropped and rotated File (WebP or JPEG fallback) from an image URL or Blob,
 * respecting EXIF orientation and bounding output dimensions.
 */
export async function renderCroppedRotatedImage(
  source: string | Blob,
  cropAreaPixels: PixelCropRect,
  rotationDeg: number,
  filename: string,
  maxDimension = 1600,
  quality = 0.82,
): Promise<File | null> {
  if (typeof document === "undefined") return null;

  let bitmap: ImageBitmap | null = null;
  let imgEl: HTMLImageElement | null = null;
  let srcW = 0;
  let srcH = 0;

  try {
    if (typeof source !== "string" && typeof createImageBitmap === "function") {
      bitmap = await decodeImageBitmapUpright(source);
      srcW = bitmap.width;
      srcH = bitmap.height;
    } else {
      const url = typeof source === "string" ? source : URL.createObjectURL(source);
      try {
        imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Failed to decode image for crop"));
          el.src = url;
        });
        srcW = imgEl.naturalWidth || imgEl.width;
        srcH = imgEl.naturalHeight || imgEl.height;
      } finally {
        if (typeof source !== "string") {
          URL.revokeObjectURL(url);
        }
      }
    }

    const drawSource: CanvasImageSource | null = bitmap ?? imgEl;
    if (!drawSource || !srcW || !srcH) return null;

    const rad = (rotationDeg * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rotW = Math.max(1, Math.round(srcW * cos + srcH * sin));
    const rotH = Math.max(1, Math.round(srcW * sin + srcH * cos));

    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rotCtx = rotCanvas.getContext("2d");
    if (!rotCtx) return null;

    rotCtx.translate(rotW / 2, rotH / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(drawSource, -srcW / 2, -srcH / 2);

    const cropX = Math.max(0, Math.min(rotW - 1, Math.round(cropAreaPixels.x)));
    const cropY = Math.max(0, Math.min(rotH - 1, Math.round(cropAreaPixels.y)));
    const cropW = Math.max(1, Math.min(rotW - cropX, Math.round(cropAreaPixels.width)));
    const cropH = Math.max(1, Math.min(rotH - cropY, Math.round(cropAreaPixels.height)));

    const scale = Math.min(1, maxDimension / Math.max(cropW, cropH));
    const outW = Math.max(1, Math.round(cropW * scale));
    const outH = Math.max(1, Math.round(cropH * scale));

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return null;

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

    const encoded = await canvasToOptimizedBlob(outCanvas, quality);
    if (!encoded) return null;
    const baseName = filename.replace(/\.[^.]+$/, "") || "cropped";
    return new File([encoded.blob], `${baseName}.${encoded.ext}`, { type: encoded.mimeType });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Normalize a captured or picked image file (e.g., iPhone HEIC/HEIF or 12MP+ JPEG)
 * into a compact upright JPEG suitable for Vision AI APIs and upload, while
 * gracefully falling back to the original file if browser canvas decoding is unavailable.
 */
export async function normalizeImageFileForUpload(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<File> {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return file;
  }

  let sourceFile = file;
  if (isHeicFile(file)) {
    sourceFile = await convertHeicToJpeg(file, quality);
  }

  const isStandardSmallImage =
    (sourceFile.type === "image/jpeg" || sourceFile.type === "image/png" || sourceFile.type === "image/webp") &&
    sourceFile.size > 0 &&
    sourceFile.size <= 350_000;
  if (isStandardSmallImage) {
    return sourceFile;
  }

  let objectUrl: string | null = null;
  try {
    let width = 0;
    let height = 0;
    let drawSource: CanvasImageSource;
    let bitmap: ImageBitmap | null = null;

    if (typeof createImageBitmap === "function") {
      bitmap = await decodeImageBitmapUpright(sourceFile);
      width = bitmap.width;
      height = bitmap.height;
      drawSource = bitmap;
    } else {
      objectUrl = URL.createObjectURL(sourceFile);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Image decode failed"));
        el.src = objectUrl!;
      });
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      drawSource = img;
    }

    if (!width || !height) {
      bitmap?.close();
      return sourceFile;
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap?.close();
      return sourceFile;
    }
    ctx.drawImage(drawSource, 0, 0, targetW, targetH);
    bitmap?.close();

    const encoded = await canvasToOptimizedBlob(canvas, quality);
    if (!encoded) {
      return sourceFile;
    }

    const baseName = sourceFile.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([encoded.blob], `${baseName}.${encoded.ext}`, { type: encoded.mimeType });
  } catch {
    return sourceFile;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Rotate an image File 90 degrees clockwise and return a new JPEG File.
 */
export async function rotateImageFile90(file: File, quality = 0.82): Promise<File> {
  if (typeof document === "undefined") return file;

  let bitmap: ImageBitmap | null = null;
  let imgEl: HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    let srcW = 0;
    let srcH = 0;
    let drawSource: CanvasImageSource;

    if (typeof createImageBitmap === "function") {
      bitmap = await decodeImageBitmapUpright(file);
      srcW = bitmap.width;
      srcH = bitmap.height;
      drawSource = bitmap;
    } else {
      objectUrl = URL.createObjectURL(file);
      imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Failed to decode image for rotation"));
        el.src = objectUrl!;
      });
      srcW = imgEl.naturalWidth || imgEl.width;
      srcH = imgEl.naturalHeight || imgEl.height;
      drawSource = imgEl;
    }

    if (!srcW || !srcH) return file;

    const canvas = document.createElement("canvas");
    canvas.width = srcH;
    canvas.height = srcW;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.translate(srcH / 2, srcW / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(drawSource, -srcW / 2, -srcH / 2);

    const encoded = await canvasToOptimizedBlob(canvas, quality);
    if (!encoded) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([encoded.blob], `${baseName}.${encoded.ext}`, { type: encoded.mimeType });
  } catch {
    return file;
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
