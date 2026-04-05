import re
import secrets

from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException

from app.auth import create_access_token, get_current_user, get_user_subscription_plan, hash_password, verify_password
from app.database import get_db
from app.models import User, UserSubscription
from app.schemas import AuthRequest, AuthResponse, SocialAuthRequest

router = APIRouter()
SOCIAL_PROVIDERS = {"instagram", "snapchat", "facebook", "whatsapp"}


class ForgotPasswordRequest(AuthRequest):
    pass


def _social_email(provider: str, device_id: str) -> str:
    safe_device = re.sub(r"[^a-zA-Z0-9]", "", device_id or "")[:32]
    if not safe_device:
        safe_device = secrets.token_hex(8)
    return f"{provider}.{safe_device}@social.looksgood.local"


@router.post("/signup", response_model=AuthResponse)
def signup(data: AuthRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=email, hashed_password=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
    if not subscription:
        db.add(UserSubscription(user_id=user.id, plan="free"))
        db.commit()

    token = create_access_token(subject=user.email)
    return {"token": token, "subscription": get_user_subscription_plan(db, user.id), "user": user}


@router.post("/login", response_model=AuthResponse)
def login(data: AuthRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(subject=user.email)
    return {"token": token, "subscription": get_user_subscription_plan(db, user.id), "user": user}


@router.post("/social", response_model=AuthResponse)
def social_login(data: SocialAuthRequest, db: Session = Depends(get_db)):
    provider = data.provider.strip().lower()
    if provider not in SOCIAL_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    device_id = data.device_id.strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="Missing device id")

    email = _social_email(provider, device_id)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, hashed_password=hash_password(secrets.token_urlsafe(24)))
        db.add(user)
        db.commit()
        db.refresh(user)

        subscription = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
        if not subscription:
            db.add(UserSubscription(user_id=user.id, plan="free"))
            db.commit()

    token = create_access_token(subject=user.email)
    return {"token": token, "subscription": get_user_subscription_plan(db, user.id), "user": user}


@router.get("/me", response_model=AuthResponse)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = create_access_token(subject=current_user.email)
    return {"token": token, "subscription": get_user_subscription_plan(db, current_user.id), "user": current_user}


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(data.password)
    db.commit()
    return {"status": "ok", "message": "Password updated successfully"}
