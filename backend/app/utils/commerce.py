import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import PostProductTag, Product


def parse_product_ids(raw) -> list[int]:
    if raw is None:
        return []

    if isinstance(raw, (list, tuple, set)):
        values = list(raw)
    else:
        text = str(raw).strip()
        if not text:
            return []
        values = None
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    values = parsed
            except (TypeError, ValueError, json.JSONDecodeError):
                values = None
        if values is None:
            values = [item.strip() for item in text.replace(";", ",").split(",") if item.strip()]

    output: list[int] = []
    seen = set()
    for value in values:
        try:
            parsed = int(str(value).strip())
        except (TypeError, ValueError):
            continue
        if parsed <= 0:
            continue
        if parsed in seen:
            continue
        seen.add(parsed)
        output.append(parsed)
    return output


def apply_post_product_tags(db: Session, post_id: int, product_ids: list[int]) -> None:
    db.query(PostProductTag).filter(PostProductTag.post_id == post_id).delete()
    if not product_ids:
        return
    for product_id in product_ids:
        db.add(PostProductTag(post_id=post_id, product_id=product_id, created_at=datetime.utcnow()))


def serialize_product(product: Product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "price_cents": int(product.price_cents),
        "currency": product.currency,
        "inventory_count": int(product.inventory_count),
        "is_active": bool(product.is_active),
    }


def serialize_product_tags(db: Session, post_id: int) -> list[dict]:
    tags = db.query(PostProductTag).filter(PostProductTag.post_id == post_id).all()
    if not tags:
        return []
    ids = [tag.product_id for tag in tags]
    products = db.query(Product).filter(Product.id.in_(ids)).all()
    product_map = {product.id: product for product in products}
    return [serialize_product(product_map[tag_id]) for tag_id in ids if tag_id in product_map]
