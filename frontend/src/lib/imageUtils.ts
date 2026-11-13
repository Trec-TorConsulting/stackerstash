/**
 * Normalize a captured or picked image file (e.g., iPhone HEIC/HEIF or 12MP+ JPEG)
 * into a compact JPEG suitable for Vision AI APIs, while gracefully falling back
 * to the original file if browser canvas decoding is unavailable.
 */
export async function normalizeImageFileForUpload(
  file: File,
  maxDimension = 1600,
  quality = 0.88
): Promise<File> {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return file;
  }

  const isStandardSmallImage =
    (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") &&
    file.size > 0 &&
    file.size <= 1_200_000;
  if (isStandardSmallImage) {
    return file;
  }

  let objectUrl: string | null = null;
  try {
    let width = 0;
    let height = 0;
    let drawSource: CanvasImageSource;
    let bitmap: ImageBitmap | null = null;

    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      drawSource = bitmap;
    } else {
      objectUrl = URL.createObjectURL(file);
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
      return file;
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
      return file;
    }
    ctx.drawImage(drawSource, 0, 0, targetW, targetH);
    bitmap?.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

