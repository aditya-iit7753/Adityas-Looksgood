from datetime import datetime
import json
from pathlib import Path
import tempfile
import uuid

from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import get_current_user
from app.database import get_db
from app.models import Comment, DirectMessage, Follow, Like, Notification, Post, PostBookmark, PostShare, User, UserProfile, UserSetting, VirtualMeetup
from app.utils.cloudinary import upload_media
from app.utils.commerce import serialize_product_tags

router = APIRouter()


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class PollVoteRequest(BaseModel):
    option: str = Field(min_length=1, max_length=120)


class MeetupCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default="", max_length=800)
    scheduled_at: str | None = None


class UserSettingsUpdate(BaseModel):
    is_private_account: bool | None = None
    show_activity_status: bool | None = None
    allow_message_requests: bool | None = None


def _add_notification(
    db: Session,
    user_id: int,
    actor_user_id: int | None,
    type_: str,
    message: str,
    ref_post_id: int | None = None,
):
    if actor_user_id is not None and user_id == actor_user_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            actor_user_id=actor_user_id,
            type=type_,
            message=message,
            ref_post_id=ref_post_id,
            is_read=False,
        )
    )


def _settings_dict(settings: UserSetting) -> dict:
    return {
        "is_private_account": bool(settings.is_private_account),
        "show_activity_status": bool(settings.show_activity_status),
        "allow_message_requests": bool(settings.allow_message_requests),
    }


def _get_or_create_settings(db: Session, user_id: int) -> UserSetting:
    settings = db.query(UserSetting).filter(UserSetting.user_id == user_id).first()
    if not settings:
        settings = UserSetting(
            user_id=user_id,
            is_private_account=False,
            show_activity_status=True,
            allow_message_requests=True,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _profile_dict(target_user: User, current_user: User, db: Session):
    profile = db.query(UserProfile).filter(UserProfile.user_id == target_user.id).first()
    settings = db.query(UserSetting).filter(UserSetting.user_id == target_user.id).first()
    followers = db.query(func.count(Follow.id)).filter(Follow.following_id == target_user.id).scalar() or 0
    following = db.query(func.count(Follow.id)).filter(Follow.follower_id == target_user.id).scalar() or 0
    is_following = (
        db.query(Follow)
        .filter(and_(Follow.follower_id == current_user.id, Follow.following_id == target_user.id))
        .first()
        is not None
    )
    posts_count = db.query(func.count(Post.id)).filter(Post.user_id == target_user.id).scalar() or 0
    return {
        "id": target_user.id,
        "email": target_user.email,
        "username": (profile.display_name.strip() if profile and profile.display_name else target_user.email.split("@")[0]),
        "bio": profile.bio if profile else "",
        "avatar_url": profile.avatar_url if profile else "",
        "followers": int(followers),
        "following": int(following),
        "posts_count": int(posts_count),
        "is_following": is_following,
        "is_me": target_user.id == current_user.id,
        "is_private_account": bool(settings.is_private_account) if settings else False,
        "show_activity_status": bool(settings.show_activity_status) if settings else True,
    }


def _parse_poll_options(raw: str | None) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return [item.strip() for item in text.split(",") if item.strip()]


def _parse_poll_votes(raw: str | None, options: list[str]) -> dict[str, int]:
    if not options:
        return {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {opt: int(parsed.get(opt, 0) or 0) for opt in options}
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return {opt: 0 for opt in options}


def _serialize_poll(post: Post) -> dict | None:
    question = str(getattr(post, "poll_question", "") or "").strip()
    if not question:
        return None
    options = _parse_poll_options(getattr(post, "poll_options", None))
    if len(options) < 2:
        return None
    votes = _parse_poll_votes(getattr(post, "poll_votes", None), options)
    total_votes = int(getattr(post, "poll_total_votes", 0) or sum(votes.values()))
    return {
        "question": question,
        "options": options,
        "votes": votes,
        "total_votes": total_votes,
    }


def _serialize_post(post: Post, current_user: User, db: Session):
    post_user = db.query(User).filter(User.id == post.user_id).first()
    post_user_profile = db.query(UserProfile).filter(UserProfile.user_id == post.user_id).first()
    likes_count = db.query(func.count(Like.id)).filter(Like.post_id == post.id).scalar() or 0
    comments_count = db.query(func.count(Comment.id)).filter(Comment.post_id == post.id).scalar() or 0
    shares_count = db.query(func.count(PostShare.id)).filter(PostShare.post_id == post.id).scalar() or 0
    liked_by_me = (
        db.query(Like)
        .filter(and_(Like.user_id == current_user.id, Like.post_id == post.id))
        .first()
        is not None
    )
    saved_by_me = (
        db.query(PostBookmark)
        .filter(and_(PostBookmark.user_id == current_user.id, PostBookmark.post_id == post.id))
        .first()
        is not None
    )
    is_following = (
        db.query(Follow)
        .filter(and_(Follow.follower_id == current_user.id, Follow.following_id == post.user_id))
        .first()
        is not None
    )
    poll_options = _parse_poll_options(getattr(post, "poll_options", None))
    poll_votes = _parse_poll_votes(getattr(post, "poll_votes", None), poll_options)
    data = {
        "id": post.id,
        "user_id": post.user_id,
        "user": (
            post_user_profile.display_name.strip()
            if post_user_profile and post_user_profile.display_name
            else (post_user.email.split("@")[0] if post_user else "creator")
        ),
        "avatar_url": post_user_profile.avatar_url if post_user_profile else "",
        "caption": post.caption,
        "media_url": post.media_url,
        "created_at": post.created_at.isoformat(),
        "is_following": is_following,
        "is_me": post.user_id == current_user.id,
        "likes_count": int(likes_count),
        "comments_count": int(comments_count),
        "shares_count": int(shares_count),
        "liked_by_me": liked_by_me,
        "saved_by_me": saved_by_me,
        "video_type": getattr(post, "video_type", "original") or "original",
        "video_duration_seconds": getattr(post, "video_duration_seconds", None),
        "remix_post_id": getattr(post, "remix_post_id", None),
        "duet_post_id": getattr(post, "duet_post_id", None),
        "collab_handle": getattr(post, "collab_handle", None),
        "poll_question": getattr(post, "poll_question", None),
        "poll_options": poll_options,
        "poll_votes": poll_votes,
        "poll_total_votes": int(getattr(post, "poll_total_votes", 0) or sum(poll_votes.values())),
    }
    data["product_tags"] = serialize_product_tags(db, post.id)
    poll = _serialize_poll(post)
    if poll:
        data["poll"] = poll
    return data


def _parse_meetup_time(raw: str | None) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _serialize_meetup(meetup: VirtualMeetup, current_user: User, db: Session) -> dict:
    host = db.query(User).filter(User.id == meetup.host_user_id).first()
    host_profile = db.query(UserProfile).filter(UserProfile.user_id == meetup.host_user_id).first()
    host_name = (
        host_profile.display_name.strip()
        if host_profile and host_profile.display_name
        else (host.email.split("@")[0] if host else "host")
    )
    return {
        "id": meetup.id,
        "title": meetup.title,
        "description": meetup.description,
        "scheduled_at": meetup.scheduled_at.isoformat() if meetup.scheduled_at else None,
        "room_code": meetup.room_code,
        "host_user_id": meetup.host_user_id,
        "host_name": host_name,
        "host_avatar_url": host_profile.avatar_url if host_profile else "",
        "is_host": meetup.host_user_id == current_user.id,
        "created_at": meetup.created_at.isoformat(),
    }


def _connected_user_ids(db: Session, current_user_id: int) -> set[int]:
    following = (
        db.query(Follow.following_id).filter(Follow.follower_id == current_user_id).all()
    )
    followers = (
        db.query(Follow.follower_id).filter(Follow.following_id == current_user_id).all()
    )
    ids = {int(row[0]) for row in following} | {int(row[0]) for row in followers}
    ids.discard(current_user_id)
    return ids


def _can_chat_with(db: Session, current_user_id: int, target_user_id: int) -> bool:
    if current_user_id == target_user_id:
        return False
    relation_exists = (
        db.query(Follow)
        .filter(
            or_(
                and_(Follow.follower_id == current_user_id, Follow.following_id == target_user_id),
                and_(Follow.follower_id == target_user_id, Follow.following_id == current_user_id),
            )
        )
        .first()
        is not None
    )
    if relation_exists:
        return True

    target_settings = db.query(UserSetting).filter(UserSetting.user_id == target_user_id).first()
    if target_settings is None:
        return True

    return bool(target_settings.allow_message_requests)


def _serialize_message(msg: DirectMessage, current_user_id: int) -> dict:
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "content": msg.content,
        "is_read": bool(msg.is_read),
        "created_at": msg.created_at.isoformat(),
        "is_me": msg.sender_id == current_user_id,
    }


def _get_or_create_profile(db: Session, user: User) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    if not profile:
        profile = UserProfile(user_id=user.id, display_name=user.email.split("@")[0], bio="", avatar_url="")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/users")
def list_users(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(User).outerjoin(UserProfile, UserProfile.user_id == User.id).order_by(User.created_at.desc())
    if q:
        search = q.strip().lower()
        query = query.filter(or_(User.email.ilike(f"%{search}%"), UserProfile.display_name.ilike(f"%{search}%")))

    users = query.limit(50).all()
    return [_profile_dict(u, current_user, db) for u in users]


@router.get("/profile/me")
def my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _profile_dict(current_user, current_user, db)
    settings = _get_or_create_settings(db, current_user.id)
    posts = (
        db.query(Post).filter(Post.user_id == current_user.id).order_by(Post.created_at.desc()).limit(30).all()
    )
    return {
        "profile": profile,
        "settings": _settings_dict(settings),
        "posts": [_serialize_post(p, current_user, db) for p in posts],
    }


@router.get("/settings")
def get_user_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db, current_user.id)
    return _settings_dict(settings)


@router.post("/settings")
def update_user_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db, current_user.id)

    if payload.is_private_account is not None:
        settings.is_private_account = bool(payload.is_private_account)
    if payload.show_activity_status is not None:
        settings.show_activity_status = bool(payload.show_activity_status)
    if payload.allow_message_requests is not None:
        settings.allow_message_requests = bool(payload.allow_message_requests)

    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)

    return {"status": "ok", "settings": _settings_dict(settings)}


@router.post("/profile/update")
async def update_profile(
    display_name: str = Form(default=""),
    bio: str = Form(default=""),
    avatar: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(db, current_user)

    if display_name.strip():
        profile.display_name = display_name.strip()[:100]
    profile.bio = bio.strip()[:500]

    if avatar is not None:
        temp_dir = Path(tempfile.gettempdir())
        avatar_path = str(temp_dir / f"{uuid.uuid4()}.jpg")
        with open(avatar_path, "wb") as f:
            f.write(await avatar.read())
        try:
            profile.avatar_url = upload_media(avatar_path, "image")
        except Exception:
            profile.avatar_url = f"https://example.com/looksgood/avatar-{uuid.uuid4()}.jpg"

    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)

    return {
        "status": "ok",
        "profile": _profile_dict(current_user, current_user, db),
    }


@router.get("/profile/{user_id}")
def user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    profile = _profile_dict(target, current_user, db)
    posts = db.query(Post).filter(Post.user_id == user_id).order_by(Post.created_at.desc()).limit(30).all()
    return {"profile": profile, "posts": [_serialize_post(p, current_user, db) for p in posts]}


@router.post("/follow/{user_id}")
def follow_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(Follow)
        .filter(and_(Follow.follower_id == current_user.id, Follow.following_id == user_id))
        .first()
    )
    if not existing:
        db.add(Follow(follower_id=current_user.id, following_id=user_id))
        _add_notification(
            db=db,
            user_id=user_id,
            actor_user_id=current_user.id,
            type_="follow",
            message=f"{current_user.email.split('@')[0]} started following you",
        )
        db.commit()

    return {"status": "following", "user_id": user_id}


@router.delete("/follow/{user_id}")
def unfollow_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(Follow)
        .filter(and_(Follow.follower_id == current_user.id, Follow.following_id == user_id))
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
    return {"status": "unfollowed", "user_id": user_id}


@router.post("/posts/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = db.query(Like).filter(and_(Like.user_id == current_user.id, Like.post_id == post_id)).first()
    if not existing:
        db.add(Like(user_id=current_user.id, post_id=post_id))
        _add_notification(
            db=db,
            user_id=post.user_id,
            actor_user_id=current_user.id,
            type_="like",
            message=f"{current_user.email.split('@')[0]} liked your post",
            ref_post_id=post_id,
        )
        db.commit()

    likes_count = db.query(func.count(Like.id)).filter(Like.post_id == post_id).scalar() or 0
    return {"status": "liked", "post_id": post_id, "likes_count": int(likes_count)}


@router.delete("/posts/{post_id}/like")
def unlike_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Like).filter(and_(Like.user_id == current_user.id, Like.post_id == post_id)).first()
    if existing:
        db.delete(existing)
        db.commit()

    likes_count = db.query(func.count(Like.id)).filter(Like.post_id == post_id).scalar() or 0
    return {"status": "unliked", "post_id": post_id, "likes_count": int(likes_count)}


@router.post("/posts/{post_id}/poll/vote")
def vote_poll(
    post_id: int,
    payload: PollVoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    poll = _serialize_poll(post)
    if not poll:
        raise HTTPException(status_code=400, detail="Poll not available")

    option = str(payload.option or "").strip()
    if option not in poll["options"]:
        raise HTTPException(status_code=400, detail="Invalid poll option")

    votes = _parse_poll_votes(post.poll_votes, poll["options"])
    votes[option] = int(votes.get(option, 0) or 0) + 1
    post.poll_votes = json.dumps(votes)
    post.poll_total_votes = int(getattr(post, "poll_total_votes", 0) or 0) + 1
    db.commit()
    db.refresh(post)

    return {"status": "voted", "post_id": post_id, "poll": _serialize_poll(post)}


@router.get("/posts/{post_id}/comments")
def list_comments(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.created_at.desc()).limit(100).all()
    data = []
    for c in comments:
        user = db.query(User).filter(User.id == c.user_id).first()
        data.append(
            {
                "id": c.id,
                "post_id": c.post_id,
                "user_id": c.user_id,
                "user": user.email.split("@")[0] if user else "creator",
                "content": c.content,
                "created_at": c.created_at.isoformat(),
                "is_me": c.user_id == current_user.id,
            }
        )
    return data


@router.post("/posts/{post_id}/comments")
def add_comment(
    post_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = Comment(
        post_id=post_id,
        user_id=current_user.id,
        content=payload.content.strip(),
    )
    db.add(comment)
    _add_notification(
        db=db,
        user_id=post.user_id,
        actor_user_id=current_user.id,
        type_="comment",
        message=f"{current_user.email.split('@')[0]} commented on your post",
        ref_post_id=post_id,
    )
    db.commit()
    db.refresh(comment)

    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "user": current_user.email.split("@")[0],
        "content": comment.content,
        "created_at": comment.created_at.isoformat(),
        "is_me": True,
    }


@router.post("/posts/{post_id}/share")
def share_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = db.query(PostShare).filter(and_(PostShare.user_id == current_user.id, PostShare.post_id == post_id)).first()
    if not existing:
        db.add(PostShare(user_id=current_user.id, post_id=post_id))
        _add_notification(
            db=db,
            user_id=post.user_id,
            actor_user_id=current_user.id,
            type_="share",
            message=f"{current_user.email.split('@')[0]} shared your post",
            ref_post_id=post_id,
        )
        db.commit()

    shares_count = db.query(func.count(PostShare.id)).filter(PostShare.post_id == post_id).scalar() or 0
    return {"status": "shared", "post_id": post_id, "shares_count": int(shares_count)}


@router.post("/posts/{post_id}/save")
def save_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = (
        db.query(PostBookmark)
        .filter(and_(PostBookmark.user_id == current_user.id, PostBookmark.post_id == post_id))
        .first()
    )
    if not existing:
        db.add(PostBookmark(user_id=current_user.id, post_id=post_id))
        db.commit()

    saves_count = db.query(func.count(PostBookmark.id)).filter(PostBookmark.post_id == post_id).scalar() or 0
    return {"status": "saved", "post_id": post_id, "saves_count": int(saves_count), "saved_by_me": True}


@router.delete("/posts/{post_id}/save")
def unsave_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(PostBookmark)
        .filter(and_(PostBookmark.user_id == current_user.id, PostBookmark.post_id == post_id))
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()

    saves_count = db.query(func.count(PostBookmark.id)).filter(PostBookmark.post_id == post_id).scalar() or 0
    return {"status": "unsaved", "post_id": post_id, "saves_count": int(saves_count), "saved_by_me": False}


@router.get("/posts/saved")
def list_saved_posts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookmarks = (
        db.query(PostBookmark)
        .filter(PostBookmark.user_id == current_user.id)
        .order_by(PostBookmark.created_at.desc())
        .limit(100)
        .all()
    )
    if not bookmarks:
        return []

    post_ids = [bookmark.post_id for bookmark in bookmarks]
    posts = db.query(Post).filter(Post.id.in_(post_ids)).all()
    post_map = {post.id: post for post in posts}

    payload = []
    for bookmark in bookmarks:
        post = post_map.get(bookmark.post_id)
        if not post:
            continue
        payload.append(_serialize_post(post, current_user, db))
    return payload


@router.get("/posts/reposted")
def list_reposted_posts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shares = (
        db.query(PostShare)
        .filter(PostShare.user_id == current_user.id)
        .order_by(PostShare.created_at.desc())
        .limit(100)
        .all()
    )
    if not shares:
        return []

    post_ids = [share.post_id for share in shares]
    posts = db.query(Post).filter(Post.id.in_(post_ids)).all()
    post_map = {post.id: post for post in posts}

    payload = []
    for share in shares:
        post = post_map.get(share.post_id)
        if not post:
            continue
        item = _serialize_post(post, current_user, db)
        item["reposted_at"] = share.created_at.isoformat()
        payload.append(item)
    return payload


@router.get("/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    data = []
    for item in items:
        actor = db.query(User).filter(User.id == item.actor_user_id).first() if item.actor_user_id else None
        data.append(
            {
                "id": item.id,
                "type": item.type,
                "message": item.message,
                "user_id": item.user_id,
                "actor_user_id": item.actor_user_id,
                "actor": actor.email.split("@")[0] if actor else None,
                "ref_post_id": item.ref_post_id,
                "is_read": item.is_read,
                "created_at": item.created_at.isoformat(),
            }
        )
    return data


@router.post("/notifications/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update(  # noqa: E712
        {"is_read": True}
    )
    db.commit()
    return {"status": "ok"}


@router.get("/meetups")
def list_meetups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meetups = (
        db.query(VirtualMeetup)
        .order_by(VirtualMeetup.created_at.desc())
        .limit(50)
        .all()
    )
    return [_serialize_meetup(meetup, current_user, db) for meetup in meetups]


@router.post("/meetups")
def create_meetup(
    payload: MeetupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = str(payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    scheduled_at = _parse_meetup_time(payload.scheduled_at)
    room_code = f"lsg-meet-{uuid.uuid4().hex[:10]}"
    meetup = VirtualMeetup(
        host_user_id=current_user.id,
        title=title[:200],
        description=str(payload.description or "").strip()[:800],
        scheduled_at=scheduled_at,
        room_code=room_code,
    )
    db.add(meetup)
    db.commit()
    db.refresh(meetup)
    return {"status": "created", "meetup": _serialize_meetup(meetup, current_user, db)}


@router.delete("/meetups/{meetup_id}")
def delete_meetup(
    meetup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meetup = db.query(VirtualMeetup).filter(VirtualMeetup.id == meetup_id).first()
    if not meetup:
        raise HTTPException(status_code=404, detail="Meetup not found")
    if meetup.host_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own meetup")
    db.delete(meetup)
    db.commit()
    return {"status": "deleted", "meetup_id": meetup_id}


@router.get("/chat/contacts")
def list_chat_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ids = _connected_user_ids(db, current_user.id)
    if not ids:
        return []
    users = db.query(User).filter(User.id.in_(ids)).order_by(User.created_at.desc()).all()
    return [_profile_dict(user, current_user, db) for user in users]


@router.get("/chat/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    messages = (
        db.query(DirectMessage)
        .filter(or_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == current_user.id))
        .order_by(DirectMessage.created_at.desc())
        .limit(500)
        .all()
    )
    if not messages:
        return []

    latest_by_other: dict[int, DirectMessage] = {}
    ordered_other_ids: list[int] = []
    for msg in messages:
        other_id = msg.receiver_id if msg.sender_id == current_user.id else msg.sender_id
        if other_id in latest_by_other:
            continue
        latest_by_other[other_id] = msg
        ordered_other_ids.append(other_id)

    users = db.query(User).filter(User.id.in_(ordered_other_ids)).all()
    user_map = {user.id: user for user in users}

    payload = []
    for other_id in ordered_other_ids:
        other_user = user_map.get(other_id)
        if not other_user:
            continue
        latest = latest_by_other[other_id]
        unread_count = (
            db.query(func.count(DirectMessage.id))
            .filter(
                DirectMessage.sender_id == other_id,
                DirectMessage.receiver_id == current_user.id,
                DirectMessage.is_read == False,  # noqa: E712
            )
            .scalar()
            or 0
        )
        payload.append(
            {
                "user": _profile_dict(other_user, current_user, db),
                "last_message": latest.content,
                "last_message_at": latest.created_at.isoformat(),
                "last_message_is_me": latest.sender_id == current_user.id,
                "unread_count": int(unread_count),
            }
        )
    return payload


@router.get("/chat/{user_id}")
def get_chat_with_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot open chat with yourself")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    has_existing = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id),
            )
        )
        .first()
        is not None
    )

    if not has_existing and not _can_chat_with(db, current_user.id, user_id):
        raise HTTPException(status_code=403, detail="Chat is allowed only with friends or followers")

    db.query(DirectMessage).filter(
        DirectMessage.sender_id == user_id,
        DirectMessage.receiver_id == current_user.id,
        DirectMessage.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()

    messages = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .limit(500)
        .all()
    )
    return {
        "contact": _profile_dict(target_user, current_user, db),
        "messages": [_serialize_message(msg, current_user.id) for msg in messages],
    }


@router.post("/chat/{user_id}")
def send_chat_message(
    user_id: int,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not _can_chat_with(db, current_user.id, user_id):
        raise HTTPException(status_code=403, detail="Chat is allowed only with friends or followers")

    msg = DirectMessage(
        sender_id=current_user.id,
        receiver_id=user_id,
        content=payload.content.strip(),
        is_read=False,
    )
    db.add(msg)
    _add_notification(
        db=db,
        user_id=user_id,
        actor_user_id=current_user.id,
        type_="message",
        message=f"{current_user.email.split('@')[0]} sent you a message",
    )
    db.commit()
    db.refresh(msg)
    return {"status": "sent", "message": _serialize_message(msg, current_user.id)}


@router.post("/chat/{user_id}/read")
def mark_chat_read(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(DirectMessage).filter(
        DirectMessage.sender_id == user_id,
        DirectMessage.receiver_id == current_user.id,
        DirectMessage.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}



