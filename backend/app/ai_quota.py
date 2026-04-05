from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.auth import get_user_subscription_plan
from app.models import AIGenerationUsage
from app.subscription_plans import PLAN_LIMITS


def _current_period(now: datetime | None = None) -> str:
    dt = now or datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_ai_quota(db: Session, user_id: int, plan: str | None = None) -> dict:
    safe_plan = (plan or get_user_subscription_plan(db, user_id)).strip().lower() or "free"
    limits = PLAN_LIMITS.get(safe_plan) or PLAN_LIMITS["free"]
    limit = int(limits.get("ai_generations_remaining", 0) or 0)
    period = _current_period()

    usage = (
        db.query(AIGenerationUsage)
        .filter(and_(AIGenerationUsage.user_id == user_id, AIGenerationUsage.period == period))
        .first()
    )
    used = int(getattr(usage, "used", 0) or 0)
    remaining = max(0, limit - used)

    return {"plan": safe_plan, "period": period, "limit": limit, "used": used, "remaining": remaining}


def consume_ai_generation(db: Session, user_id: int) -> dict:
    quota = get_ai_quota(db, user_id)
    plan = quota["plan"]
    limit = int(quota["limit"] or 0)
    used = int(quota["used"] or 0)
    period = quota["period"]

    if limit <= 0 or used >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "msg": "AI credits exhausted. Upgrade to Pro to unlock more AI features and remove ads.",
                "plan": plan,
                "period": period,
                "limit": limit,
                "used": used,
                "remaining": max(0, limit - used),
            },
        )

    usage = (
        db.query(AIGenerationUsage)
        .filter(and_(AIGenerationUsage.user_id == user_id, AIGenerationUsage.period == period))
        .first()
    )
    if not usage:
        usage = AIGenerationUsage(user_id=user_id, period=period, used=0)
        db.add(usage)
        db.commit()
        db.refresh(usage)

    usage.used = int(usage.used or 0) + 1
    usage.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(usage)

    return get_ai_quota(db, user_id, plan=plan)

