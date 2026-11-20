import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_EXTENSIONS,
  canvasToOptimizedBlob,
  computeCoverCropRect,
  computeSubjectCropRect,
  convertHeicToJpeg,
  decodeImageBitmapUpright,
  isHeicFile,
  isSupportedImageFile,
  normalizeImageFileForUpload,
  renderCroppedRotatedImage,
  rotateImageFile90,
} from "../lib/imageUtils";

function makeFakeCanvas(opts: {
  ctx?: Record<string, unknown> | null;
  webpBlob?: Blob | null;
  jpegBlob?: Blob | null;
} = {}) {
  const defaultCtx = {
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => (opts.ctx === undefined ? defaultCtx : opts.ctx)),
    toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => {
      if (type === "image/webp") {
        cb(opts.webpBlob === undefined ? new Blob(["webp"], { type: "image/webp" }) : opts.webpBlob);
      } else {
        cb(opts.jpegBlob === undefined ? new Blob(["jpg"], { type: "image/jpeg" }) : opts.jpegBlob);
      }
    }),
  } as unknown as HTMLCanvasElement;
}

describe("imageUtils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("computes WYSIWYG object-cover crop for 16:9 sensor in 4:3 viewfinder", () => {
    const rect = computeCoverCropRect(1920, 1080, 4 / 3, 1);
    expect(rect).toEqual({ sx: 240, sy: 0, sw: 1440, sh: 1080 });

    const zoomed = computeCoverCropRect(1920, 1080, 4 / 3, 2);
    expect(zoomed).toEqual({ sx: 600, sy: 270, sw: 720, sh: 540 });

    const exact = computeCoverCropRect(1600, 1200, 4 / 3);
    expect(exact).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 1200 });
  });

  it("computes WYSIWYG object-cover crop for portrait 3:4 sensor in 4:3 viewfinder", () => {
    const rect = computeCoverCropRect(1200, 1600, 4 / 3, 1);
    expect(rect).toEqual({ sx: 0, sy: 350, sw: 1200, sh: 900 });
  });

  it("maps normalized subject bounding boxes with protective padding and 1:1 coin framing", () => {
    const coinCrop = computeSubjectCropRect(
      4000,
      3000,
      4 / 3,
      1,
      { x: 0.3, y: 0.25, width: 0.4, height: 0.5, shape: "coin" },
    );
    // 1:1 square centered at (2000, 1500)
    expect(coinCrop.sw).toBe(coinCrop.sh);
    expect(coinCrop.sx + coinCrop.sw / 2).toBeCloseTo(2000, 0);
    expect(coinCrop.sy + coinCrop.sh / 2).toBeCloseTo(1500, 0);

    const noteCrop = computeSubjectCropRect(
      4000,
      3000,
      4 / 3,
      1,
      { x: 0.1, y: 0.3, width: 0.8, height: 0.4, shape: "note" },
      1.2
    );
    expect(noteCrop.sw).toBeGreaterThan(noteCrop.sh);
    expect(noteCrop.sx).toBeGreaterThanOrEqual(0);
    expect(noteCrop.sy).toBeGreaterThanOrEqual(0);
  });

  it("passes imageOrientation: from-image to createImageBitmap and falls back cleanly", async () => {
    const mockBitmap = { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;
    const spy = vi
      .fn()
      .mockResolvedValueOnce(mockBitmap)
      .mockRejectedValueOnce(new Error("option unsupported"))
      .mockResolvedValueOnce(mockBitmap);
    vi.stubGlobal("createImageBitmap", spy);

    const blob = new Blob(["test"], { type: "image/jpeg" });
    const res = await decodeImageBitmapUpright(blob);
    expect(res).toBe(mockBitmap);
    expect(spy).toHaveBeenCalledWith(blob, { imageOrientation: "from-image" });

    const fallback = await decodeImageBitmapUpright(blob);
    expect(fallback).toBe(mockBitmap);
    expect(spy).toHaveBeenLastCalledWith(blob);
  });

  it("encodes WebP via canvasToOptimizedBlob, falls back to JPEG, or returns null", async () => {
    const webpCanvas = {
      toBlob: (cb: (b: Blob | null) => void, type: string) =>
        cb(new Blob(["webp-data"], { type: type === "image/webp" ? "image/webp" : "image/png" })),
    } as unknown as HTMLCanvasElement;
    const webpRes = await canvasToOptimizedBlob(webpCanvas, 0.82);
    expect(webpRes?.mimeType).toBe("image/webp");
    expect(webpRes?.ext).toBe("webp");

    const fallbackCanvas = {
      toBlob: (cb: (b: Blob | null) => void, type: string) =>
        cb(
          type === "image/webp"
            ? new Blob(["png-fallback"], { type: "image/png" })
            : new Blob(["jpeg-data"], { type: "image/jpeg" }),
        ),
    } as unknown as HTMLCanvasElement;
    const jpegRes = await canvasToOptimizedBlob(fallbackCanvas, 0.82);
    expect(jpegRes?.mimeType).toBe("image/jpeg");
    expect(jpegRes?.ext).toBe("jpg");

    const nullCanvas = {
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement;
    expect(await canvasToOptimizedBlob(nullCanvas)).toBeNull();
  });

  it("passes through small <= 350 KB standard images unchanged in normalizeImageFileForUpload", async () => {
    const small = new File([new Uint8Array(100_000)], "small.jpg", { type: "image/jpeg" });
    const out = await normalizeImageFileForUpload(small);
    expect(out).toBe(small);
  });

  it("covers renderCroppedRotatedImage across bitmap, URL, Image fallback, null guards, and errors", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    const crop = { x: 10, y: 10, width: 100, height: 80 };

    // 1. No document
    const origDoc = globalThis.document;
    vi.stubGlobal("document", undefined);
    expect(await renderCroppedRotatedImage(blob, crop, 90, "c.jpg")).toBeNull();
    vi.stubGlobal("document", origDoc);

    // 2. Bitmap path + fallback basename when filename is "."
    const closeSpy = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 400, height: 200, close: closeSpy }),
    );
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? makeFakeCanvas() : origCreateElement(tag)) as typeof document.createElement);

    const out1 = await renderCroppedRotatedImage(blob, crop, 90, ".png");
    expect(out1?.name).toBe("cropped.webp");
    expect(closeSpy).toHaveBeenCalled();

    // 3. String URL path using Image (naturalWidth: 0 -> falls back to width)
    const fakeImgLoad = vi.fn(function (this: Record<string, unknown>) {
      const img: Record<string, unknown> = {
        naturalWidth: 0,
        naturalHeight: 0,
        width: 200,
        height: 120,
      };
      Object.defineProperty(img, "src", {
        set: () => queueMicrotask(() => (img.onload as () => void)()),
      });
      return img;
    });
    vi.stubGlobal("Image", fakeImgLoad);
    const out2 = await renderCroppedRotatedImage("https://cdn.example/c.jpg", crop, 0, "coin.png");
    expect(out2?.name).toBe("coin.webp");

    // 4. Blob path without createImageBitmap uses URL.createObjectURL + revokeObjectURL
    vi.stubGlobal("createImageBitmap", undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:crop-src");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const out3 = await renderCroppedRotatedImage(blob, crop, 0, "raw.jpg");
    expect(out3?.name).toBe("raw.webp");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop-src");

    // 5. Image onerror catch -> null
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const img: Record<string, unknown> = {};
        Object.defineProperty(img, "src", {
          set: () => queueMicrotask(() => (img.onerror as () => void)()),
        });
        return img;
      }),
    );
    expect(await renderCroppedRotatedImage(blob, crop, 0, "err.jpg")).toBeNull();

    // 6. Zero dimensions -> null
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 0, height: 0, close: vi.fn() }),
    );
    expect(await renderCroppedRotatedImage(blob, crop, 0, "zero.jpg")).toBeNull();

    // 7. Missing rotCtx -> null
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    );
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? makeFakeCanvas({ ctx: null }) : origCreateElement(tag)) as typeof document.createElement);
    expect(await renderCroppedRotatedImage(blob, crop, 0, "norot.jpg")).toBeNull();

    // 8. Missing outCtx -> null
    let calls = 0;
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return origCreateElement(tag);
      calls += 1;
      return makeFakeCanvas({ ctx: calls === 1 ? undefined : null });
    }) as typeof document.createElement);
    expect(await renderCroppedRotatedImage(blob, crop, 0, "noout.jpg")).toBeNull();

    // 9. Encoding returns null -> null
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas"
        ? makeFakeCanvas({ webpBlob: null, jpegBlob: null })
        : origCreateElement(tag)) as typeof document.createElement);
    expect(await renderCroppedRotatedImage(blob, crop, 0, "noenc.jpg")).toBeNull();
  });

  it("covers normalizeImageFileForUpload and rotateImageFile90 full paths and fallbacks", async () => {
    const bigFile = new File([new Uint8Array(400_000)], ".heic", { type: "image/heic" });
    const origDoc = globalThis.document;
    const origCreateElement = document.createElement.bind(document);

    // 1. No document fallback
    vi.stubGlobal("document", undefined);
    expect(await normalizeImageFileForUpload(bigFile)).toBe(bigFile);
    expect(await rotateImageFile90(bigFile)).toBe(bigFile);
    vi.stubGlobal("document", origDoc);

    // 2. createImageBitmap path for normalize + rotate
    const closeSpy = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 400, close: closeSpy }),
    );
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? makeFakeCanvas() : origCreateElement(tag)) as typeof document.createElement);

    const normRes = await normalizeImageFileForUpload(bigFile, 400);
    expect(normRes.name).toBe("photo.webp");
    const rotRes = await rotateImageFile90(bigFile);
    expect(rotRes.name).toBe("photo.webp");

    // 3. No createImageBitmap -> Image onload & URL.revokeObjectURL in finally
    vi.stubGlobal("createImageBitmap", undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:norm-rot");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const img: Record<string, unknown> = {
          naturalWidth: 0,
          naturalHeight: 0,
          width: 240,
          height: 120,
        };
        Object.defineProperty(img, "src", {
          set: () => queueMicrotask(() => (img.onload as () => void)()),
        });
        return img;
      }),
    );
    expect((await normalizeImageFileForUpload(bigFile)).name).toBe("photo.webp");
    expect((await rotateImageFile90(bigFile)).name).toBe("photo.webp");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:norm-rot");

    // 4. Image onerror catch -> returns original file
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const img: Record<string, unknown> = {};
        Object.defineProperty(img, "src", {
          set: () => queueMicrotask(() => (img.onerror as () => void)()),
        });
        return img;
      }),
    );
    expect(await normalizeImageFileForUpload(bigFile)).toBe(bigFile);
    expect(await rotateImageFile90(bigFile)).toBe(bigFile);

    // 5. Zero dimensions -> returns original file
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 0, height: 0, close: vi.fn() }),
    );
    expect(await normalizeImageFileForUpload(bigFile)).toBe(bigFile);
    expect(await rotateImageFile90(bigFile)).toBe(bigFile);

    // 6. Missing ctx -> returns original file
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
    );
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? makeFakeCanvas({ ctx: null }) : origCreateElement(tag)) as typeof document.createElement);
    expect(await normalizeImageFileForUpload(bigFile)).toBe(bigFile);
    expect(await rotateImageFile90(bigFile)).toBe(bigFile);

    // 7. Null encoding -> returns original file
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas"
        ? makeFakeCanvas({ webpBlob: null, jpegBlob: null })
        : origCreateElement(tag)) as typeof document.createElement);
    expect(await normalizeImageFileForUpload(bigFile)).toBe(bigFile);
    expect(await rotateImageFile90(bigFile)).toBe(bigFile);
  });

  it("correctly identifies supported image files and extensions", () => {
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain("heic");
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain("heif");
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain("avif");
    expect(SUPPORTED_IMAGE_EXTENSIONS).toContain("tiff");
    expect(SUPPORTED_IMAGE_ACCEPT).toContain(".heic");
    expect(SUPPORTED_IMAGE_ACCEPT).toContain(".heif");

    expect(isSupportedImageFile(new File(["a"], "test.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "test.png", { type: "image/png" }))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "test.heic", { type: "image/heic" }))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "test.HEIC", { type: "application/octet-stream" }))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "scan.tiff", { type: "application/octet-stream" }))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "photo.bmp", { type: "" }))).toBe(true);
    expect(isSupportedImageFile(new Blob(["raw"]))).toBe(true);
    expect(isSupportedImageFile(new File(["a"], "doc.pdf", { type: "application/pdf" }))).toBe(false);
    expect(isSupportedImageFile(new File(["a"], "script.exe", { type: "application/x-msdownload" }))).toBe(false);
  });

  it("correctly checks for HEIC/HEIF files", () => {
    expect(isHeicFile(new File(["a"], "photo.heic", { type: "image/heic" }))).toBe(true);
    expect(isHeicFile(new File(["a"], "photo.HEIF", { type: "image/heif" }))).toBe(true);
    expect(isHeicFile(new File(["a"], "burst.hif", { type: "application/octet-stream" }))).toBe(true);
    expect(isHeicFile(new File(["a"], "seq.heic", { type: "image/heic-sequence" }))).toBe(true);
    expect(isHeicFile(new File(["a"], "normal.jpg", { type: "image/jpeg" }))).toBe(false);
    expect(isHeicFile(new File(["a"], "normal.png", { type: "image/png" }))).toBe(false);
  });

  it("handles convertHeicToJpeg with mocked heic2any and handles fallback on error", async () => {
    const heicFile = new File(["fake-heic"], "coin.heic", { type: "image/heic" });

    // 1. Successful conversion
    vi.doMock("heic2any", () => ({
      default: vi.fn().mockResolvedValue(new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" })),
    }));
    const converted = await convertHeicToJpeg(heicFile);
    expect(converted.type).toBe("image/jpeg");
    expect(converted.name).toBe("coin.jpg");

    // 2. Fallback on error
    vi.doMock("heic2any", () => ({
      default: vi.fn().mockRejectedValue(new Error("heic conversion error")),
    }));
    const fallback = await convertHeicToJpeg(heicFile);
    expect(fallback).toBe(heicFile);

    // 3. Fallback on Blob input without name
    const rawBlob = new Blob(["blob-heic"], { type: "image/heic" });
    const blobFallback = await convertHeicToJpeg(rawBlob);
    expect(blobFallback.type).toBe("image/heic");
  });
});
