from ninja import File, Form, Router, UploadedFile
from ninja.errors import HttpError

from apps.accounts.auth import WorkspaceAuth

from .services import identify_images

vision_router = Router(tags=["Vision"], auth=WorkspaceAuth())


@vision_router.post("/identify")
def identify_item_from_photos(
    request,
    files: list[UploadedFile] = File(...),
    barcode_hint: str | None = Form(None),
    intake_mode: str = Form("camera"),
):
    if not files:
        raise HttpError(400, "At least one image file is required.")
    image_tuples: list[tuple[bytes, str]] = []
    for f in files:
        content_type = getattr(f, "content_type", None) or "image/jpeg"
        image_tuples.append((f.read(), content_type))
    mode = "upload" if intake_mode == "upload" else "camera"
    return identify_images(
        image_tuples,
        request.workspace,
        barcode_hint=barcode_hint,
        intake_mode=mode,
    )
