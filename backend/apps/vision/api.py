from ninja import File, Form, Router, UploadedFile
from ninja.errors import HttpError

from apps.accounts.auth import WorkspaceAuth, require_editor

from .services import _infer_image_mime, identify_images

vision_router = Router(tags=["Vision"], auth=WorkspaceAuth())
MAX_VISION_FILES = 4
MAX_VISION_FILE_BYTES = 10 * 1024 * 1024


@vision_router.post("/identify")
def identify_item_from_photos(
    request,
    files: list[UploadedFile] = File(...),
    barcode_hint: str | None = Form(None),
    intake_mode: str = Form("camera"),
    identify_mode: str = Form("full"),
):
    require_editor(request)
    if not files:
        raise HttpError(400, "At least one image file is required.")
    if len(files) > MAX_VISION_FILES:
        raise HttpError(400, f"At most {MAX_VISION_FILES} image files are allowed per request.")
    image_tuples: list[tuple[bytes, str]] = []
    for f in files:
        f.seek(0)
        raw_bytes = f.read(MAX_VISION_FILE_BYTES + 1)
        if not raw_bytes or len(raw_bytes) > MAX_VISION_FILE_BYTES:
            raise HttpError(400, "Each uploaded image must be non-empty and at most 10 MB.")
        content_type = _infer_image_mime(raw_bytes, getattr(f, "content_type", None))
        image_tuples.append((raw_bytes, content_type))
    mode = "upload" if intake_mode == "upload" else "camera"
    id_mode = "fast_local" if identify_mode == "fast_local" else "full"
    return identify_images(
        image_tuples,
        request.workspace,
        barcode_hint=barcode_hint,
        intake_mode=mode,
        identify_mode=id_mode,
    )
