# Design: Support HEIC and Extended Image Formats

## Architecture

1. **Client-Side Progressive Enhancement**:
   - `isHeicFile` identifies HEIC/HEIF inputs via MIME type (`image/heic`, `image/heif`, `image/heic-sequence`) or extension (`.heic`, `.heif`, `.hif`).
   - `convertHeicToJpeg` dynamically imports `heic2any` on demand in browser contexts. If conversion succeeds, it yields a standardized JPEG `File` that browser `<img>` tags, `createImageBitmap`, canvas edge detectors, and crop viewfinders can consume natively.
   - If client conversion fails or is unavailable, the original file is preserved and passed to the backend.

2. **File Picker & MIME Resilience**:
   - `SUPPORTED_IMAGE_ACCEPT` provides explicit file extensions and MIME types (`image/*,.heic,.heif,.hif,.avif,.webp,.png,.jpg,.jpeg,.jfif,.bmp,.tiff,.tif,.gif,image/heic,image/heif,image/avif`) ensuring OS open dialogs on Windows, macOS, Android, and iOS do not filter out non-JPEG files.
   - `isSupportedImageFile` validates both MIME prefix `image/` and recognized extensions so files labeled `application/octet-stream` by the OS are preserved.

3. **Backend Image Decoder Registration & Normalization**:
   - `register_heif_opener()` is invoked in `apps/catalog/apps.py`, `apps/vision/apps.py`, `image_processing.py`, and `apps/vision/services.py` to enable HEIC/HEIF decoding in Pillow.
   - `_infer_image_mime` inspects ISOBMFF `ftyp` brand signatures (`heic`, `heix`, `hevc`, `hevx`, `mif1`, `heif`, `msf1`, `avif`, `avis`), TIFF headers, BMP headers, and GIF headers to detect true MIME types even if uploaded with generic headers.
   - `process_item_image` processes any opened image and normalizes it into high-efficiency WebP/PNG formats with stripped EXIF metadata.
