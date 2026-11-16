import { describe, expect, it, vi } from "vitest";
import { computeCoverCropRect, decodeImageBitmapUpright } from "../lib/imageUtils";

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
