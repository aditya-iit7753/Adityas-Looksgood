from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import (
    PUBLIC_BASE_URL,
    STRIPE_CANCEL_URL,
    STRIPE_SECRET_KEY,
    STRIPE_SUBSCRIPTION_PRICE_CREATOR,
    STRIPE_SUBSCRIPTION_PRICE_PRO,
    STRIPE_SUCCESS_URL,
    STRIPE_WEBHOOK_SECRET,
)
from app.database import get_db
from app.models import Order, OrderItem, Post, Product, User, UserSubscription
from app.utils.commerce import apply_post_product_tags, parse_product_ids, serialize_product, serialize_product_tags

router = APIRouter()


def _require_stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    stripe.api_key = STRIPE_SECRET_KEY


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = ""
    price_cents: int | None = None
    price: float | None = None
    currency: str | None = "USD"
    inventory_count: int | None = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_cents: int | None = None
    price: float | None = None
    currency: str | None = None
    inventory_count: int | None = None
    is_active: bool | None = None


class PostTagsUpdate(BaseModel):
    product_ids: list[int] | str | None = None


class CheckoutItem(BaseModel):
    product_id: int
    quantity: int = 1


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem]

class PaymentSheetResponse(BaseModel):
    payment_intent_client_secret: str
    order_id: int


def _resolve_price_cents(price_cents: int | None, price: float | None) -> int:
    if price_cents is not None:
        cents = int(price_cents)
        if cents < 0:
            raise HTTPException(status_code=400, detail="price_cents must be >= 0")
        return cents
    if price is None:
        raise HTTPException(status_code=400, detail="price or price_cents is required")
    try:
        cents = int(round(float(price) * 100))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="price must be a number")
    if cents < 0:
        raise HTTPException(status_code=400, detail="price must be >= 0")
    return cents


def _clean_currency(value: str | None) -> str:
    clean = str(value or "USD").strip().upper()
    return clean[:8] if clean else "USD"


def _load_creator_products(db: Session, user_id: int, ids: list[int]) -> list[Product]:
    if not ids:
        return []
    products = (
        db.query(Product)
        .filter(Product.id.in_(ids), Product.creator_user_id == user_id)
        .all()
    )
    return products


@router.get("/products")
def list_products(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Product).filter(Product.creator_user_id == current_user.id)
    if q:
        search = f"%{q.strip()}%"
        query = query.filter(Product.name.ilike(search))
    products = query.order_by(Product.created_at.desc()).limit(200).all()
    return [serialize_product(product) for product in products]


@router.post("/products")
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Product name is required")

    price_cents = _resolve_price_cents(payload.price_cents, payload.price)
    currency = _clean_currency(payload.currency)
    inventory_count = int(payload.inventory_count or 0)
    if inventory_count < 0:
        raise HTTPException(status_code=400, detail="inventory_count must be >= 0")

    product = Product(
        creator_user_id=current_user.id,
        name=name[:200],
        description=str(payload.description or "").strip()[:1000],
        price_cents=price_cents,
        currency=currency,
        inventory_count=inventory_count,
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    return {"status": "created", "product": serialize_product(product)}


@router.patch("/products/{product_id}")
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.creator_user_id == current_user.id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.name is not None:
        name = str(payload.name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Product name cannot be empty")
        product.name = name[:200]
    if payload.description is not None:
        product.description = str(payload.description or "").strip()[:1000]
    if payload.price_cents is not None or payload.price is not None:
        product.price_cents = _resolve_price_cents(payload.price_cents, payload.price)
    if payload.currency is not None:
        product.currency = _clean_currency(payload.currency)
    if payload.inventory_count is not None:
        inventory_count = int(payload.inventory_count)
        if inventory_count < 0:
            raise HTTPException(status_code=400, detail="inventory_count must be >= 0")
        product.inventory_count = inventory_count
    if payload.is_active is not None:
        product.is_active = bool(payload.is_active)

    product.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return {"status": "updated", "product": serialize_product(product)}


@router.post("/posts/{post_id}/tags")
def tag_post_products(
    post_id: int,
    payload: PostTagsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only tag your own posts")

    product_ids = parse_product_ids(payload.product_ids)
    if product_ids:
        products = _load_creator_products(db, current_user.id, product_ids)
        if len(products) != len(set(product_ids)):
            raise HTTPException(status_code=400, detail="One or more product IDs are invalid")

    apply_post_product_tags(db, post.id, product_ids)
    db.commit()

    return {"status": "ok", "product_tags": serialize_product_tags(db, post.id)}


@router.get("/posts/{post_id}/tags")
def get_post_tags(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    if not db.query(Post).filter(Post.id == post_id).first():
        raise HTTPException(status_code=404, detail="Post not found")
    return serialize_product_tags(db, post_id)


@router.post("/checkout")
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_stripe()

    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    quantities: dict[int, int] = {}
    for item in payload.items:
        qty = int(item.quantity or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be at least 1")
        quantities[item.product_id] = quantities.get(item.product_id, 0) + qty

    product_ids = list(quantities.keys())
    products = db.query(Product).filter(Product.id.in_(product_ids), Product.is_active == True).all()  # noqa: E712
    if len(products) != len(product_ids):
        raise HTTPException(status_code=400, detail="One or more products are unavailable")

    currency_set = {product.currency.upper() for product in products}
    if len(currency_set) != 1:
        raise HTTPException(status_code=400, detail="All products must use the same currency")
    currency = currency_set.pop() if currency_set else "USD"

    line_items = []
    amount_cents = 0
    product_map = {product.id: product for product in products}
    for product_id, quantity in quantities.items():
        product = product_map[product_id]
        if product.inventory_count < quantity:
            raise HTTPException(status_code=400, detail=f"{product.name} is out of stock")
        line_items.append(
            {
                "price_data": {
                    "currency": currency.lower(),
                    "unit_amount": int(product.price_cents),
                    "product_data": {
                        "name": product.name,
                        "description": product.description or None,
                    },
                },
                "quantity": int(quantity),
            }
        )
        amount_cents += int(product.price_cents) * int(quantity)

    order = Order(
        buyer_user_id=current_user.id,
        status="pending",
        amount_cents=amount_cents,
        currency=currency,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()

    for product_id, quantity in quantities.items():
        product = product_map[product_id]
        unit_price = int(product.price_cents)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product_id,
                quantity=int(quantity),
                unit_price_cents=unit_price,
                total_price_cents=unit_price * int(quantity),
            )
        )

    success_url = STRIPE_SUCCESS_URL or f"{PUBLIC_BASE_URL}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = STRIPE_CANCEL_URL or f"{PUBLIC_BASE_URL}/checkout/cancel"

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(order.id),
        metadata={
            "order_id": str(order.id),
            "buyer_user_id": str(current_user.id),
        },
        customer_email=current_user.email,
    )

    order.stripe_session_id = session.id
    order.updated_at = datetime.utcnow()
    db.commit()

    return {"checkout_url": session.url, "order_id": order.id}

@router.post("/payment-sheet", response_model=PaymentSheetResponse)
def payment_sheet(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_stripe()

    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    quantities: dict[int, int] = {}
    for item in payload.items:
        qty = int(item.quantity or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be at least 1")
        quantities[item.product_id] = quantities.get(item.product_id, 0) + qty

    product_ids = list(quantities.keys())
    products = db.query(Product).filter(Product.id.in_(product_ids), Product.is_active == True).all()  # noqa: E712
    if len(products) != len(product_ids):
        raise HTTPException(status_code=400, detail="One or more products are unavailable")

    currency_set = {product.currency.upper() for product in products}
    if len(currency_set) != 1:
        raise HTTPException(status_code=400, detail="All products must use the same currency")
    currency = currency_set.pop() if currency_set else "USD"

    amount_cents = 0
    product_map = {product.id: product for product in products}
    for product_id, quantity in quantities.items():
        product = product_map[product_id]
        if product.inventory_count < quantity:
            raise HTTPException(status_code=400, detail=f"{product.name} is out of stock")
        amount_cents += int(product.price_cents) * int(quantity)

    order = Order(
        buyer_user_id=current_user.id,
        status="pending",
        amount_cents=amount_cents,
        currency=currency,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()

    for product_id, quantity in quantities.items():
        product = product_map[product_id]
        unit_price = int(product.price_cents)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product_id,
                quantity=int(quantity),
                unit_price_cents=unit_price,
                total_price_cents=unit_price * int(quantity),
            )
        )

    payment_intent = stripe.PaymentIntent.create(
        amount=amount_cents,
        currency=currency.lower(),
        automatic_payment_methods={"enabled": True},
        metadata={
            "order_id": str(order.id),
            "buyer_user_id": str(current_user.id),
        },
        receipt_email=current_user.email,
    )

    order.stripe_payment_intent_id = payment_intent.id
    order.updated_at = datetime.utcnow()
    db.commit()

    return PaymentSheetResponse(
        payment_intent_client_secret=payment_intent.client_secret,
        order_id=order.id,
    )


def _finalize_paid_order(db: Session, order: Order, payment_intent_id: str | None = None, session_id: str | None = None):
    if order.status == "paid":
        return
    order.status = "paid"
    if payment_intent_id:
        order.stripe_payment_intent_id = payment_intent_id
    if session_id:
        order.stripe_session_id = session_id
    order.updated_at = datetime.utcnow()

    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            product.inventory_count = max(0, int(product.inventory_count) - int(item.quantity))
            product.updated_at = datetime.utcnow()


def _get_or_create_subscription(db: Session, user_id: int) -> UserSubscription:
    row = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if row:
        return row
    row = UserSubscription(user_id=user_id, plan="free", updated_at=datetime.utcnow())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _plan_from_subscription_object(obj: dict) -> str | None:
    metadata = obj.get("metadata", {}) if isinstance(obj, dict) else {}
    meta_plan = str(metadata.get("subscription_plan") or "").strip().lower()
    if meta_plan in {"pro", "creator"}:
        return meta_plan

    # Infer plan from price id if metadata is missing.
    items = obj.get("items", {}).get("data", []) if isinstance(obj, dict) else []
    for item in items or []:
        price = (item.get("price") or {}) if isinstance(item, dict) else {}
        price_id = str(price.get("id") or "").strip()
        if price_id and STRIPE_SUBSCRIPTION_PRICE_CREATOR and price_id == STRIPE_SUBSCRIPTION_PRICE_CREATOR:
            return "creator"
        if price_id and STRIPE_SUBSCRIPTION_PRICE_PRO and price_id == STRIPE_SUBSCRIPTION_PRICE_PRO:
            return "pro"
    return None


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe webhook secret is not configured")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe signature header")

    stripe.api_key = STRIPE_SECRET_KEY
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Stripe payload")

    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        metadata = session.get("metadata", {}) if isinstance(session, dict) else {}
        order_id_raw = metadata.get("order_id")
        try:
            order_id = int(order_id_raw)
        except (TypeError, ValueError):
            order_id = None

        if order_id is not None:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                _finalize_paid_order(
                    db,
                    order,
                    payment_intent_id=session.get("payment_intent") if isinstance(session, dict) else None,
                    session_id=session.get("id") if isinstance(session, dict) else None,
                )
                db.commit()

        # Subscription checkout (AI features / ads removal)
        plan_raw = metadata.get("subscription_plan")
        user_id_raw = metadata.get("user_id") or session.get("client_reference_id")
        plan = str(plan_raw or "").strip().lower()
        if plan in {"pro", "creator"}:
            try:
                user_id = int(user_id_raw)
            except (TypeError, ValueError):
                user_id = None
            if user_id is not None:
                row = _get_or_create_subscription(db, user_id)
                row.plan = plan
                row.updated_at = datetime.utcnow()
                db.commit()

    if event.get("type") in {"customer.subscription.updated", "customer.subscription.deleted"}:
        subscription = event.get("data", {}).get("object", {})
        metadata = subscription.get("metadata", {}) if isinstance(subscription, dict) else {}
        user_id_raw = metadata.get("user_id")
        try:
            user_id = int(user_id_raw)
        except (TypeError, ValueError):
            user_id = None

        if user_id is not None:
            status = str(subscription.get("status") or "").strip().lower() if isinstance(subscription, dict) else ""
            next_plan = _plan_from_subscription_object(subscription) or "free"
            if status not in {"active", "trialing"}:
                next_plan = "free"

            row = _get_or_create_subscription(db, user_id)
            row.plan = next_plan
            row.updated_at = datetime.utcnow()
            db.commit()

    if event.get("type") == "payment_intent.succeeded":
        intent = event.get("data", {}).get("object", {})
        metadata = intent.get("metadata", {}) if isinstance(intent, dict) else {}
        order_id_raw = metadata.get("order_id")
        try:
            order_id = int(order_id_raw)
        except (TypeError, ValueError):
            order_id = None

        if order_id is not None:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                _finalize_paid_order(
                    db,
                    order,
                    payment_intent_id=intent.get("id") if isinstance(intent, dict) else None,
                )
                db.commit()

    if event.get("type") == "payment_intent.payment_failed":
        intent = event.get("data", {}).get("object", {})
        metadata = intent.get("metadata", {}) if isinstance(intent, dict) else {}
        order_id_raw = metadata.get("order_id")
        try:
            order_id = int(order_id_raw)
        except (TypeError, ValueError):
            order_id = None

        if order_id is not None:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order and order.status != "paid":
                order.status = "failed"
                order.stripe_payment_intent_id = intent.get("id") if isinstance(intent, dict) else None
                order.updated_at = datetime.utcnow()
                db.commit()

    return {"status": "ok"}

