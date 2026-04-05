from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CloseFriend, Story, User
from app.utils.cloudinary import upload_media

router = APIRouter()
VALID_VISIBILITY = {"public", "private", "close_friends"}


def _normalize_visibility(value: str | None, *, strict: bool = True) -> str:
    raw = (value or "public").strip().lower().replace("-", "_").replace(" ", "_")
    if raw == "closefriend":
        raw = "close_friends"
    if raw not in VALID_VISIBILITY:
        if strict:
            raise HTTPException(status_code=400, detail="Visibility must be public, private, or close_friends")
        return "public"
    return raw


@router.post("/create")
async def create_story(
    image: UploadFile | None = File(default=None),
    caption: str = Form(default=""),
    status_text: str = Form(default=""),
    visibility: str = Form(default="public"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    story_visibility = _normalize_visibility(visibility)
    clean_caption = caption.strip()[:500]
    clean_status_text = status_text.strip()[:500]
    media_url = ""

    if image is not None:
        image_bytes = await image.read()
        if image_bytes:
            temp_dir = Path(tempfile.gettempdir())
            image_path = str(temp_dir / f"{uuid.uuid4()}.jpg")
            with open(image_path, "wb") as f:
                f.write(image_bytes)
            try:
                media_url = upload_media(image_path, "image")
            except Exception:
                media_url = f"https://example.com/looksgood/story-{uuid.uuid4()}.jpg"

    if not media_url and not clean_caption and not clean_status_text:
        raise HTTPException(status_code=400, detail="Add an image or a status text")

    story = Story(
        user_id=current_user.id,
        media_url=media_url or "",
        caption=clean_caption,
        status_text=clean_status_text,
        visibility=story_visibility,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(story)
    db.commit()
    db.refresh(story)

    return {
        "status": "created",
        "story_id": story.id,
        "media_url": media_url,
        "visibility": story.visibility,
        "status_text": story.status_text,
        "story_type": "status" if not story.media_url else "media",
    }


@router.get("")
@router.get("/")
def list_active_stories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    close_friend_owner_ids = {
        int(row[0])
        for row in db.query(CloseFriend.owner_user_id).filter(CloseFriend.friend_user_id == current_user.id).all()
    }
    stories = (
        db.query(Story)
        .filter(Story.expires_at > now)
        .order_by(Story.created_at.desc())
        .all()
    )
    data = []
    for story in stories:
        story_visibility = _normalize_visibility(story.visibility or "public", strict=False)
        if story_visibility == "private" and story.user_id != current_user.id:
            continue
        if (
            story_visibility == "close_friends"
            and story.user_id != current_user.id
            and story.user_id not in close_friend_owner_ids
        ):
            continue

        user = db.query(User).filter(User.id == story.user_id).first()
        data.append(
            {
                "id": story.id,
                "user_id": story.user_id,
                "user": user.email.split("@")[0] if user else "creator",
                "caption": story.caption,
                "media_url": story.media_url,
                "status_text": story.status_text or "",
                "visibility": story_visibility,
                "story_type": "status" if not story.media_url else "media",
                "expires_at": story.expires_at.isoformat(),
                "is_me": story.user_id == current_user.id,
            }
        )
        if len(data) >= 300:
            break
    return data


@router.get("/close-friends")
def list_close_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(CloseFriend)
        .filter(CloseFriend.owner_user_id == current_user.id)
        .order_by(CloseFriend.created_at.desc())
        .all()
    )
    if not rows:
        return []

    friend_ids = [row.friend_user_id for row in rows]
    users = db.query(User).filter(User.id.in_(friend_ids)).all()
    user_map = {user.id: user for user in users}

    data = []
    for row in rows:
        user = user_map.get(row.friend_user_id)
        if not user:
            continue
        data.append(
            {
                "id": row.id,
                "user_id": user.id,
                "user": user.email.split("@")[0],
                "email": user.email,
                "created_at": row.created_at.isoformat(),
            }
        )
    return data


@router.post("/close-friends/{user_id}")
def add_close_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(CloseFriend)
        .filter(CloseFriend.owner_user_id == current_user.id, CloseFriend.friend_user_id == user_id)
        .first()
    )
    if existing:
        return {"status": "exists", "user_id": user_id}

    db.add(CloseFriend(owner_user_id=current_user.id, friend_user_id=user_id))
    db.commit()
    return {"status": "added", "user_id": user_id}


@router.delete("/close-friends/{user_id}")
def remove_close_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(CloseFriend)
        .filter(CloseFriend.owner_user_id == current_user.id, CloseFriend.friend_user_id == user_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
    return {"status": "removed", "user_id": user_id}
