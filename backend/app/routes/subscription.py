from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_current_user
from app.database import get_db
from app.models import User, UserSubscription

router = APIRouter()

ALLOWED_PLANS = {"free", "pro", "creator"}
PLAN_LIMITS = {
    "free": {"ai_generations_remaining": 2, "video_exports_remaining": 1},
    "pro": {"ai_generations_remaining": 60, "video_exports_remaining": 25},
    "creator": {"ai_generations_remaining": 200, "video_exports_remaining": 100},
}


def _normalize_plan(value: str | None) -> str:
    plan = str(value or "").strip().lower()
    if plan not in ALLOWED_PLANS:
        raise HTTPException(status_code=400, detail=f"Plan must be one of: {', '.join(sorted(ALLOWED_PLANS))}")
    return plan


def _get_or_create_subscription(db: Session, user_id: int) -> UserSubscription:
    row = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if row:
        return row

    row = UserSubscription(user_id=user_id, plan="free")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/status")
def subscription_status(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    if not current_user:
        return {"plan": "free", "limits": PLAN_LIMITS["free"]}

    row = _get_or_create_subscription(db, current_user.id)
    plan = str(row.plan or "free").strip().lower()
    if plan not in ALLOWED_PLANS:
        plan = "free"
    return {"plan": plan, "limits": PLAN_LIMITS[plan]}


@router.post("/upgrade")
def upgrade(
    plan: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized_plan = _normalize_plan(plan)
    row = _get_or_create_subscription(db, current_user.id)
    row.plan = normalized_plan
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"status": "success", "plan": row.plan, "limits": PLAN_LIMITS[row.plan]}

