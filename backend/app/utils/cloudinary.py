import shutil
import uuid
from pathlib import Path

import cloudinary
import cloudinary.uploader
from app.config import (
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    PUBLIC_BASE_URL,
    GENERATED_UPLOADS_DIR,
)

cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET
)

_LOCAL_MEDIA_DIR = GENERATED_UPLOADS_DIR
_LOCAL_MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def _cloudinary_ready() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


def _fallback_local(file_path: str, resource_type: str) -> str:
    src = Path(file_path)
    suffix = src.suffix
    if not suffix:
        suffix = ".mp4" if resource_type == "video" else ".jpg"
    filename = f"{uuid.uuid4().hex}{suffix}"
    dest = _LOCAL_MEDIA_DIR / filename
    shutil.copy2(src, dest)
    base = str(PUBLIC_BASE_URL or "").rstrip("/") or "http://127.0.0.1:8100"
    return f"{base}/generated/uploads/{filename}"


def upload_media(file_path, resource_type="video"):
    if not _cloudinary_ready():
        return _fallback_local(file_path, resource_type)

    result = cloudinary.uploader.upload(
        file_path,
        resource_type=resource_type,
        folder="looksgood"
    )
    return result["secure_url"]


