import { describe, expect, it, vi } from "vitest";
import {
  computeCoverCropRect,
  computeSubjectCropRect,
  decodeImageBitmapUpright,
} from "../lib/imageUtils";

describe("imageUtils", () => {
  it("computes WYSIWYG object-cover crop for 16:9 sensor in 4:3 viewfinder", () => {
    const rect = computeCoverCropRect(1920, 1080, 4 / 3, 1);
    expect(rect).toEqual({ sx: 240, sy: 0, sw: 1440, sh: 1080 });

    const zoomed = computeCoverCropRect(1920, 1080, 4 / 3, 2);
    expect(zoomed).toEqual({ sx: 600, sy: 270, sw: 720, sh: 540 });
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
      1.25
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
    const orig = window.createImageBitmap;
    const mockBitmap = { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;
    const spy = vi.fn().mockResolvedValue(mockBitmap);
    window.createImageBitmap = spy;

    try {
      const blob = new Blob(["test"], { type: "image/jpeg" });
      const res = await decodeImageBitmapUpright(blob);
      expect(res).toBe(mockBitmap);
      expect(spy).toHaveBeenCalledWith(blob, { imageOrientation: "from-image" });
    } finally {
      window.createImageBitmap = orig;
    }
  });
});
