import json
import math
import random
import re
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Comment, Follow, Like, Post, PostBookmark, PostShare, SponsoredAd, User, UserProfile
from app.utils.commerce import serialize_product_tags

router = APIRouter()

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "if", "in", "is", "it", "its", "of", "on", "or", "that",
    "the", "this", "to", "was", "were", "with", "you", "your", "we", "our",
}


def _tokenize(text: str) -> list[str]:
    raw = str(text or "").lower()
    words = re.findall(r"[a-z0-9]{3,}", raw)
    return [word for word in words if word not in STOPWORDS]


def _build_interest_profile(db: Session, user_id: int) -> Counter:
    post_ids: set[int] = set()
    post_ids.update(
        row.post_id for row in db.query(Like.post_id).filter(Like.user_id == user_id).all()
    )
    post_ids.update(
        row.post_id for row in db.query(PostBookmark.post_id).filter(PostBookmark.user_id == user_id).all()
    )
    post_ids.update(
        row.post_id for row in db.query(PostShare.post_id).filter(PostShare.user_id == user_id).all()
    )
    post_ids.update(
        row.post_id for row in db.query(Comment.post_id).filter(Comment.user_id == user_id).all()
    )

    if not post_ids:
        return Counter()

    posts = db.query(Post).filter(Post.id.in_(post_ids)).all()
    interest = Counter()
    for post in posts:
        interest.update(_tokenize(post.caption))
    return interest


def _score_post(post: Post, interest: Counter, follow_ids: set[int], db: Session) -> float:
    tokens = set(_tokenize(post.caption))
    interest_score = sum(interest.get(token, 0) for token in tokens)
    follow_bonus = 2.0 if post.user_id in follow_ids else 0.0

    now = datetime.now(timezone.utc)
    age_days = max(0.0, (now - post.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 86400)
    recency = max(0.0, 30.0 - age_days) / 30.0

    likes_count = db.query(Like).filter(Like.post_id == post.id).count()
    comments_count = db.query(Comment).filter(Comment.post_id == post.id).count()
    shares_count = db.query(PostShare).filter(PostShare.post_id == post.id).count()
    engagement = math.log1p(likes_count + comments_count * 1.5 + shares_count * 2.0)

    return (interest_score * 0.7) + (follow_bonus * 1.2) + (recency * 1.4) + (engagement * 0.6)


def _pick_ai_reason(post: Post, interest: Counter, follow_ids: set[int]) -> str | None:
    if post.user_id in follow_ids:
        return "From someone you follow"

    tokens = _tokenize(post.caption)
    if not tokens:
        return None

    ranked = sorted(set(tokens), key=lambda token: (-interest.get(token, 0), token))
    top = [token for token in ranked if interest.get(token, 0) > 0][:2]
    if not top:
        return None
    if len(top) == 1:
        return f"Because you liked {top[0]} content"
    return f"Because you liked {top[0]} + {top[1]} content"


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


def _serialize_post(post: Post, current_user_id: int, db: Session, ai_reason: str | None = None):
    user = db.query(User).filter(User.id == post.user_id).first()
    profile = db.query(UserProfile).filter(UserProfile.user_id == post.user_id).first()
    is_following = (
        db.query(Follow)
        .filter(and_(Follow.follower_id == current_user_id, Follow.following_id == post.user_id))
        .first()
        is not None
    )
    likes_count = db.query(Like).filter(Like.post_id == post.id).count()
    comments_count = db.query(Comment).filter(Comment.post_id == post.id).count()
    shares_count = db.query(PostShare).filter(PostShare.post_id == post.id).count()
    liked_by_me = (
        db.query(Like)
        .filter(and_(Like.user_id == current_user_id, Like.post_id == post.id))
        .first()
        is not None
    )
    saved_by_me = (
        db.query(PostBookmark)
        .filter(and_(PostBookmark.user_id == current_user_id, PostBookmark.post_id == post.id))
        .first()
        is not None
    )

    poll_options = _parse_poll_options(getattr(post, "poll_options", None))
    poll_votes = _parse_poll_votes(getattr(post, "poll_votes", None), poll_options)
    data = {
        "id": post.id,
        "user_id": post.user_id,
        "user": profile.display_name if profile and profile.display_name else (user.email.split("@")[0] if user else "creator"),
        "avatar_url": profile.avatar_url if profile else "",
        "caption": post.caption,
        "media_url": post.media_url,
        "created_at": post.created_at.isoformat(),
        "is_following": is_following,
        "is_me": post.user_id == current_user_id,
        "likes_count": likes_count,
        "comments_count": comments_count,
        "shares_count": shares_count,
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
    if ai_reason:
        data["ai_reason"] = ai_reason
        data["ai_recommended"] = True
    return data


def _serialize_ad(ad: SponsoredAd, ai_reason: str | None = None) -> dict:
    data = {
        "id": ad.id,
        "brand": ad.brand,
        "video_url": ad.video_url,
        "cta": ad.cta_text,
        "link": ad.target_url,
        "sponsored": True,
    }
    if ai_reason:
        data["ai_reason"] = ai_reason
        data["ai_recommended"] = True
    return data


def _pick_ad_reason(interest: Counter) -> str:
    if not interest:
        return "Sponsored for you"
    top = [token for token, _count in interest.most_common(2)]
    if not top:
        return "Sponsored for you"
    if len(top) == 1:
        return f"Sponsored - Based on {top[0]} content"
    return f"Sponsored - Based on {top[0]} + {top[1]} content"


@router.get("")
@router.get("/")
def get_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    following_ids = [
        row.following_id for row in db.query(Follow).filter(Follow.follower_id == current_user.id).all()
    ]

    feed_user_ids = [current_user.id] + following_ids
    posts = (
        db.query(Post)
        .filter(Post.user_id.in_(feed_user_ids))
        .order_by(Post.created_at.desc())
        .limit(50)
        .all()
    )

    if not posts:
        posts = db.query(Post).order_by(Post.created_at.desc()).limit(50).all()

    content = [_serialize_post(post, current_user.id, db) for post in posts]

    ads = db.query(SponsoredAd).filter(SponsoredAd.is_active == True).all()  # noqa: E712
    if ads and len(content) >= 2:
        interest = _build_interest_profile(db, current_user.id)
        ad = random.choice(ads)
        content.insert(2, _serialize_ad(ad, _pick_ad_reason(interest)))

    return content


@router.get("/ai")
@router.get("/smart")
def get_smart_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    following_ids = {
        row.following_id for row in db.query(Follow).filter(Follow.follower_id == current_user.id).all()
    }
    interest = _build_interest_profile(db, current_user.id)

    # Fallback to regular feed if we don't have enough signals yet.
    if not interest:
        return get_feed(db=db, current_user=current_user)

    candidates = db.query(Post).order_by(Post.created_at.desc()).limit(300).all()
    scored = sorted(
        candidates,
        key=lambda post: (_score_post(post, interest, following_ids, db), post.created_at),
        reverse=True,
    )
    posts = scored[:50]
    content = [
        _serialize_post(post, current_user.id, db, _pick_ai_reason(post, interest, following_ids))
        for post in posts
    ]

    ads = db.query(SponsoredAd).filter(SponsoredAd.is_active == True).all()  # noqa: E712
    if ads and len(content) >= 2:
        ad = random.choice(ads)
        content.insert(2, _serialize_ad(ad, _pick_ad_reason(interest)))

    return content


@router.get("/style-dna")
def get_style_dna(
    limit: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    safe_limit = max(3, min(int(limit or 12), 24))

    like_post_ids = [row.post_id for row in db.query(Like.post_id).filter(Like.user_id == current_user.id).all()]
    save_post_ids = [row.post_id for row in db.query(PostBookmark.post_id).filter(PostBookmark.user_id == current_user.id).all()]
    share_post_ids = [row.post_id for row in db.query(PostShare.post_id).filter(PostShare.user_id == current_user.id).all()]
    comment_post_ids = [row.post_id for row in db.query(Comment.post_id).filter(Comment.user_id == current_user.id).all()]

    def build_counter(post_ids: list[int]) -> Counter:
        if not post_ids:
            return Counter()
        posts = db.query(Post).filter(Post.id.in_(post_ids)).all()
        counter = Counter()
        for post in posts:
            counter.update(_tokenize(post.caption))
        return counter

    likes_counter = build_counter(like_post_ids)
    saves_counter = build_counter(save_post_ids)
    shares_counter = build_counter(share_post_ids)
    comments_counter = build_counter(comment_post_ids)

    combined = Counter()
    combined.update(likes_counter)
    combined.update(saves_counter)
    combined.update(shares_counter)
    combined.update(comments_counter)

    if not combined:
        # Fallback: derive a lightweight fingerprint from the user's own recent captions.
        recent_posts = (
            db.query(Post)
            .filter(Post.user_id == current_user.id)
            .order_by(Post.created_at.desc())
            .limit(50)
            .all()
        )
        for post in recent_posts:
            combined.update(_tokenize(post.caption))

    ranked = combined.most_common(safe_limit)
    aura = [token for token, _count in ranked[:3]]

    top = []
    for token, count in ranked:
        sources = {
            "likes": int(likes_counter.get(token, 0)),
            "saves": int(saves_counter.get(token, 0)),
            "shares": int(shares_counter.get(token, 0)),
            "comments": int(comments_counter.get(token, 0)),
        }
        top.append({"tag": token, "score": int(count), "sources": sources})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "aura": aura,
        "signals": {
            "likes": len(like_post_ids),
            "saves": len(save_post_ids),
            "shares": len(share_post_ids),
            "comments": len(comment_post_ids),
        },
        "top": top,
    }



