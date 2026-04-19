import json
from pathlib import Path
import re
import shutil
import tempfile
from typing import cast
import urllib.error
import urllib.request
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import GENERATED_STORAGE_DIR
from app.database import get_db
from app.models import Post, Product, User
from app.utils.cloudinary import upload_media
from app.utils.commerce import apply_post_product_tags, parse_product_ids
from app.utils.video_generator import SUPPORTED_SONG_KEYS, create_short_video, mix_video_with_song, trim_video

router = APIRouter()
GENERATED_DIR = GENERATED_STORAGE_DIR
GENERATED_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
ALLOWED_VIDEO_TYPES = {"original", "remix", "duet", "collab"}


class PublishFromUrlRequest(BaseModel):
    media_url: str
    caption: str = ""
    video_type: str | None = None
    remix_post_id: str | None = None
    duet_post_id: str | None = None
    collab_handle: str | None = None
    duration_seconds: str | None = None
    poll_question: str | None = None
    poll_options: str | None = None
    product_ids: list[int] | str | None = None


def _safe_video_extension(filename: str | None) -> str:
    ext = Path(str(filename or "")).suffix.lower()
    return ext if ext in ALLOWED_VIDEO_EXTENSIONS else ".mp4"


def _parse_video_type(raw: str | None) -> str:
    value = str(raw or "").strip().lower() or "original"
    if value not in ALLOWED_VIDEO_TYPES:
        allowed = ", ".join(sorted(ALLOWED_VIDEO_TYPES))
        raise HTTPException(status_code=400, detail=f"video_type must be one of: {allowed}")
    return value


def _parse_source_post_id(raw: str | None, field_name: str) -> int | None:
    text = str(raw or "").strip()
    if not text:
        return None
    match = re.search(r"\d+", text)
    if not match:
        raise HTTPException(status_code=400, detail=f"{field_name} must include a post id")
    return int(match.group(0))


def _parse_duration_seconds(raw: str | None) -> int | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        seconds = int(float(text))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="duration_seconds must be a number")
    return seconds if seconds > 0 else None


def _parse_trim_seconds(raw: str | None, field_name: str) -> float | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        value = float(text)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a number")
    if value < 0:
        raise HTTPException(status_code=400, detail=f"{field_name} must be >= 0")
    return value


def _resolve_trim_spec(
    trim_start: float | None,
    trim_end: float | None,
    trim_duration: float | None,
) -> tuple[float, float, float] | None:
    if trim_start is None and trim_end is None and trim_duration is None:
        return None
    start = float(trim_start or 0.0)
    end = trim_end if trim_end is not None else (start + float(trim_duration)) if trim_duration is not None else None
    if end is None:
        raise HTTPException(status_code=400, detail="trim_end_seconds or trim_duration_seconds is required for trimming")
    if end <= start:
        raise HTTPException(status_code=400, detail="trim_end_seconds must be greater than trim_start_seconds")
    duration = end - start
    return start, end, duration


def _validate_reel_duration(seconds: int | None):
    if seconds is None:
        return
    if seconds < 15 or seconds > 60:
        raise HTTPException(status_code=400, detail="Reel duration must be between 15 and 60 seconds")


def _parse_poll_options(raw: str | None) -> list[str]:
    text = str(raw or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return [item.strip() for item in text.split(",") if item.strip()]


def _prepare_poll(question_raw: str | None, options_raw: str | None) -> tuple[str, str, str]:
    question = str(question_raw or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="poll_question is required when adding a poll")
    options = _parse_poll_options(options_raw)
    unique: list[str] = []
    seen = set()
    for opt in options:
        clean = str(opt).strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        unique.append(clean[:80])
        if len(unique) >= 4:
            break
    if len(unique) < 2:
        raise HTTPException(status_code=400, detail="poll_options must include at least 2 options")
    votes = {opt: 0 for opt in unique}
    return question[:200], json.dumps(unique), json.dumps(votes)


def _resolve_post_metadata(
    db: Session,
    video_type_raw: str | None,
    remix_post_raw: str | None,
    duet_post_raw: str | None,
    collab_raw: str | None,
    duration_raw: str | None,
    poll_question_raw: str | None,
    poll_options_raw: str | None,
) -> dict:
    video_type = _parse_video_type(video_type_raw)
    duration_seconds = _parse_duration_seconds(duration_raw)
    _validate_reel_duration(duration_seconds)

    remix_post_id = _parse_source_post_id(remix_post_raw, "remix_post_id") if video_type == "remix" else None
    duet_post_id = _parse_source_post_id(duet_post_raw, "duet_post_id") if video_type == "duet" else None
    collab_handle = str(collab_raw or "").strip()[:128] or None

    if video_type == "remix" and remix_post_id is None:
        raise HTTPException(status_code=400, detail="remix_post_id is required for remix videos")
    if video_type == "duet" and duet_post_id is None:
        raise HTTPException(status_code=400, detail="duet_post_id is required for duet videos")
    if video_type == "collab" and not collab_handle:
        raise HTTPException(status_code=400, detail="collab_handle is required for collaboration videos")

    if remix_post_id:
        if not db.query(Post).filter(Post.id == remix_post_id).first():
            raise HTTPException(status_code=404, detail="Remix source post not found")
    if duet_post_id:
        if not db.query(Post).filter(Post.id == duet_post_id).first():
            raise HTTPException(status_code=404, detail="Duet source post not found")

    poll_question_clean = str(poll_question_raw or "").strip()
    poll_options_clean = str(poll_options_raw or "").strip()
    poll_question = None
    poll_options = None
    poll_votes = None
    if poll_question_clean or poll_options_clean:
        poll_question, poll_options, poll_votes = _prepare_poll(poll_question_clean, poll_options_clean)

    return {
        "video_type": video_type,
        "video_duration_seconds": duration_seconds,
        "remix_post_id": remix_post_id,
        "duet_post_id": duet_post_id,
        "collab_handle": collab_handle if video_type == "collab" else None,
        "poll_question": poll_question,
        "poll_options": poll_options,
        "poll_votes": poll_votes,
        "poll_total_votes": 0,
    }


def _ensure_products_owned(db: Session, user_id: int, product_ids: list[int]) -> None:
    if not product_ids:
        return
    products = (
        db.query(Product)
        .filter(Product.id.in_(product_ids), Product.creator_user_id == user_id)
        .all()
    )
    if len(products) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="One or more product IDs are invalid")


def _generated_video_url(request: Request, source_path: str) -> str:
    dest = GENERATED_DIR / f"video-{uuid.uuid4().hex}.mp4"
    shutil.copyfile(source_path, dest)
    base = str(request.base_url).rstrip("/")
    return f"{base}/generated/{dest.name}"


def _download_source_video(url: str, target_path: str):
    req = urllib.request.Request(url=url, headers={"User-Agent": "LooksGood/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = resp.read()
    if not payload:
        raise ValueError("Source video is empty")
    with open(target_path, "wb") as file:
        file.write(payload)


@router.post("/publish")
async def publish_video(
    request: Request,
    image: UploadFile | None = File(default=None),
    video: UploadFile | None = File(default=None),
    caption: str = Form(default=""),
    video_type: str = Form(default="original"),
    remix_post_id: str = Form(default=""),
    duet_post_id: str = Form(default=""),
    collab_handle: str = Form(default=""),
    duration_seconds: str = Form(default=""),
    trim_start_seconds: str = Form(default=""),
    trim_end_seconds: str = Form(default=""),
    trim_duration_seconds: str = Form(default=""),
    poll_question: str = Form(default=""),
    poll_options: str = Form(default=""),
    product_ids: str = Form(default=""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if image is None and video is None:
        raise HTTPException(status_code=400, detail="Upload an image or video")

    current_user_id = cast(int, current_user.id)

    trim_start = _parse_trim_seconds(trim_start_seconds, "trim_start_seconds")
    trim_end = _parse_trim_seconds(trim_end_seconds, "trim_end_seconds")
    trim_duration = _parse_trim_seconds(trim_duration_seconds, "trim_duration_seconds")
    trim_spec = _resolve_trim_spec(trim_start, trim_end, trim_duration)
    duration_override = trim_spec[2] if trim_spec else _parse_duration_seconds(duration_seconds)
    duration_raw = str(duration_override) if duration_override is not None else duration_seconds

    meta = _resolve_post_metadata(
        db=db,
        video_type_raw=video_type,
        remix_post_raw=remix_post_id,
        duet_post_raw=duet_post_id,
        collab_raw=collab_handle,
        duration_raw=duration_raw,
        poll_question_raw=poll_question,
        poll_options_raw=poll_options,
    )

    safe_caption = caption.strip()[:500]
    temp_dir = Path(tempfile.gettempdir())
    video_url = ""

    if video is not None:
        extension = _safe_video_extension(video.filename or "")
        uploaded_video_path = str(temp_dir / f"{uuid.uuid4()}{extension}")
        with open(uploaded_video_path, "wb") as f:
            f.write(await video.read())
        if trim_spec:
            trimmed_path = str(temp_dir / f"{uuid.uuid4()}.mp4")
            try:
                trim_video(
                    uploaded_video_path,
                    trimmed_path,
                    start_seconds=trim_spec[0],
                    end_seconds=trim_spec[1],
                )
                uploaded_video_path = trimmed_path
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        try:
            video_url = upload_media(uploaded_video_path, "video")
        except Exception:
            video_url = _generated_video_url(request, uploaded_video_path)
    else:
        if image is None:
            raise HTTPException(status_code=400, detail="Upload an image when no video is provided")
        image_path = str(temp_dir / f"{uuid.uuid4()}.jpg")
        generated_video_path = str(temp_dir / f"{uuid.uuid4()}.mp4")

        with open(image_path, "wb") as f:
            f.write(await image.read())

        create_short_video(image_path, generated_video_path)

        try:
            video_url = upload_media(generated_video_path, "video")
        except Exception:
            video_url = _generated_video_url(request, generated_video_path)

    post = Post(user_id=current_user_id, caption=safe_caption, media_url=video_url, **meta)
    db.add(post)
    db.flush()
    post_id = cast(int, post.id)
    product_ids_list = parse_product_ids(product_ids)
    if product_ids_list:
        _ensure_products_owned(db, current_user_id, product_ids_list)
        apply_post_product_tags(db, post_id, product_ids_list)
    db.commit()
    db.refresh(post)

    return {
        "status": "published",
        "video_url": video_url,
        "post_id": post_id,
        "source": "video_upload" if video is not None else "image_generated",
    }


@router.post("/mix-audio")
async def mix_audio(
    request: Request,
    video: UploadFile | None = File(default=None),
    source_url: str = Form(default=""),
    song_key: str = Form(...),
    song_volume: float = Form(default=0.68),
    original_volume: float = Form(default=0.86),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    clean_song_key = str(song_key or "").strip().lower()
    if clean_song_key not in SUPPORTED_SONG_KEYS:
        allowed = ", ".join(sorted(SUPPORTED_SONG_KEYS))
        raise HTTPException(status_code=400, detail=f"song_key must be one of: {allowed}")

    clean_source_url = str(source_url or "").strip()
    if video is None and not clean_source_url:
        raise HTTPException(status_code=400, detail="Upload a video file or provide source_url")

    temp_dir = Path(tempfile.gettempdir())
    input_path = str(temp_dir / f"{uuid.uuid4()}{_safe_video_extension(video.filename if video else '')}")
    output_path = str(temp_dir / f"{uuid.uuid4()}.mp4")

    try:
        if video is not None:
            payload = await video.read()
            if not payload:
                raise HTTPException(status_code=400, detail="Uploaded video is empty")
            with open(input_path, "wb") as file:
                file.write(payload)
        else:
            if not clean_source_url.lower().startswith(("http://", "https://")):
                raise HTTPException(status_code=400, detail="source_url must be a valid URL")
            try:
                _download_source_video(clean_source_url, input_path)
            except (urllib.error.URLError, TimeoutError, ValueError):
                raise HTTPException(status_code=400, detail="Could not download source_url video")

        mix_video_with_song(
            video_path=input_path,
            output_path=output_path,
            song_key=clean_song_key,
            song_volume=song_volume,
            original_volume=original_volume,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Could not mix song into video")

    try:
        mixed_url = upload_media(output_path, "video")
    except Exception:
        mixed_url = _generated_video_url(request, output_path)

    return {
        "status": "ready",
        "video_url": mixed_url,
        "song_key": clean_song_key,
        "source": "song_mix",
    }


@router.post("/publish-from-url")
def publish_from_url(
    data: PublishFromUrlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_id = cast(int, current_user.id)
    media_url = str(data.media_url or "").strip()
    if not media_url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="media_url must be a valid URL")

    meta = _resolve_post_metadata(
        db=db,
        video_type_raw=data.video_type,
        remix_post_raw=data.remix_post_id,
        duet_post_raw=data.duet_post_id,
        collab_raw=data.collab_handle,
        duration_raw=data.duration_seconds,
        poll_question_raw=data.poll_question,
        poll_options_raw=data.poll_options,
    )

    post = Post(
        user_id=current_user_id,
        caption=str(data.caption or "").strip()[:500],
        media_url=media_url,
        **meta,
    )
    db.add(post)
    db.flush()
    post_id = cast(int, post.id)
    product_ids_list = parse_product_ids(data.product_ids)
    if product_ids_list:
        _ensure_products_owned(db, current_user_id, product_ids_list)
        apply_post_product_tags(db, post_id, product_ids_list)
    db.commit()
    db.refresh(post)

    return {
        "status": "published",
        "video_url": media_url,
        "post_id": post_id,
        "source": "existing_media",
    }
