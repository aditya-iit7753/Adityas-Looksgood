from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import SponsoredAd, User

router = APIRouter()


def _serialize_ad(ad: SponsoredAd) -> dict:
    return {
        "id": ad.id,
        "brand": ad.brand,
        "video_url": ad.video_url,
        "cta": ad.cta_text,
        "link": ad.target_url,
        "sponsored": True,
    }


@router.post("/create")
def create_ad(
    video_url: str,
    brand: str,
    cta: str,
    link: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clean_video_url = str(video_url or "").strip()
    clean_brand = str(brand or "").strip()
    clean_cta = str(cta or "").strip()
    clean_link = str(link or "").strip()

    if not clean_video_url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="video_url must be a valid URL")
    if not clean_link.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="link must be a valid URL")
    if not clean_brand:
        raise HTTPException(status_code=400, detail="brand is required")
    if not clean_cta:
        raise HTTPException(status_code=400, detail="cta is required")

    ad = SponsoredAd(
        creator_user_id=current_user.id,
        brand=clean_brand[:120],
        video_url=clean_video_url[:1024],
        cta_text=clean_cta[:120],
        target_url=clean_link[:1024],
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return _serialize_ad(ad)


@router.get("/all")
def list_ads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    rows = (
        db.query(SponsoredAd)
        .filter(SponsoredAd.is_active == True)  # noqa: E712
        .order_by(SponsoredAd.created_at.desc())
        .all()
    )
    return [_serialize_ad(row) for row in rows]
