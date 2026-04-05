from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
import stripe
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_current_user
from app.ai_quota import get_ai_quota
from app.config import (
    IS_PRODUCTION,
    STRIPE_CANCEL_URL,
    STRIPE_SECRET_KEY,
    STRIPE_SUBSCRIPTION_PRICE_CREATOR,
    STRIPE_SUBSCRIPTION_PRICE_PRO,
    STRIPE_SUCCESS_URL,
)
from app.database import get_db
from app.models import User, UserSubscription
from app.subscription_plans import ALLOWED_PLANS, PLAN_LIMITS

router = APIRouter()


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

    quota = get_ai_quota(db, current_user.id, plan=plan)
    limits = {**PLAN_LIMITS[plan]}
    limits["ai_generations_remaining"] = int(quota["remaining"])

    return {
        "plan": plan,
        "limits": limits,
        "usage": {
            "period": quota["period"],
            "ai_generations_used": int(quota["used"]),
            "ai_generations_limit": int(quota["limit"]),
        },
        "ads_enabled": plan == "free",
    }


@router.post("/upgrade")
def upgrade(
    plan: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if IS_PRODUCTION:
        raise HTTPException(status_code=403, detail="Manual plan changes are disabled in production")

    normalized_plan = _normalize_plan(plan)
    row = _get_or_create_subscription(db, current_user.id)
    row.plan = normalized_plan
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"status": "success", "plan": row.plan, "limits": PLAN_LIMITS[row.plan]}


def _require_stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    stripe.api_key = STRIPE_SECRET_KEY


def _price_for_plan(plan: str) -> str:
    if plan == "pro":
        return str(STRIPE_SUBSCRIPTION_PRICE_PRO or "").strip()
    if plan == "creator":
        return str(STRIPE_SUBSCRIPTION_PRICE_CREATOR or "").strip()
    return ""


@router.post("/checkout")
def create_checkout_session(
    plan: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized_plan = _normalize_plan(plan)
    if normalized_plan == "free":
        raise HTTPException(status_code=400, detail="Free plan does not require checkout")

    _require_stripe()
    if not STRIPE_SUCCESS_URL or not STRIPE_CANCEL_URL:
        raise HTTPException(
            status_code=500,
            detail="STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL must be configured for subscriptions",
        )

    price_id = _price_for_plan(normalized_plan)
    if not price_id:
        raise HTTPException(status_code=500, detail="Stripe subscription price is not configured for this plan")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=STRIPE_SUCCESS_URL,
        cancel_url=STRIPE_CANCEL_URL,
        client_reference_id=str(current_user.id),
        metadata={"subscription_plan": normalized_plan, "user_id": str(current_user.id)},
        subscription_data={"metadata": {"subscription_plan": normalized_plan, "user_id": str(current_user.id)}},
    )

    # Ensure a row exists so /subscription/status always has data.
    _ = _get_or_create_subscription(db, current_user.id)

    return {"url": session.get("url"), "id": session.get("id")}

