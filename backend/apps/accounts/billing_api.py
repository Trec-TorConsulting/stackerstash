from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import stripe
from django.conf import settings
from django.db import transaction
from ninja import Router, Schema
from ninja.errors import HttpError

from .auth import WorkspaceAuth
from .models import (
    PLAN_CATALOG,
    AccountSubscription,
    DedicatedServerInstance,
    PlanTier,
    User,
    ensure_dedicated_instance,
    get_or_create_subscription,
    get_user_entitlement_status,
)

billing_router = Router(tags=["Billing"])

_STRIPE_STATUS_MAP: dict[str, str] = {
    "active": AccountSubscription.Status.ACTIVE,
    "trialing": AccountSubscription.Status.TRIALING,
    "past_due": AccountSubscription.Status.PAST_DUE,
    "canceled": AccountSubscription.Status.CANCELED,
    "unpaid": AccountSubscription.Status.CANCELED,
    "incomplete": AccountSubscription.Status.INCOMPLETE,
    "incomplete_expired": AccountSubscription.Status.CANCELED,
}


class PlanOut(Schema):
    tier: str
    name: str
    monthly_price_cents: int
    price_display: str
    max_vaults: int | None = None
    max_items: int | None = None
    dedicated_server: bool = False
    summary: str
    checkout_enabled: bool = False


class DedicatedInstanceOut(Schema):
    id: UUID
    status: str
    requested_subdomain: str
    dedicated_url: str
    admin_notes: str
    provisioned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BillingStatusOut(Schema):
    tier: str
    plan_name: str
    price_display: str
    source: str
    status: str
    enforce_tiers: bool
    max_vaults: int | None = None
    max_items: int | None = None
    owned_vault_count: int
    active_item_count: int
    cancel_at_period_end: bool
    current_period_end: datetime | None = None
    has_stripe_customer: bool
    checkout_configured: bool
    dedicated_instance: DedicatedInstanceOut | None = None


class CheckoutIn(Schema):
    tier: str
    requested_subdomain: str = ""


class CheckoutSessionOut(Schema):
    url: str
    session_id: str


class PortalSessionOut(Schema):
    url: str


def _price_id_for_tier(tier: str) -> str:
    return {
        PlanTier.PLUS: getattr(settings, "STRIPE_PRICE_PLUS", ""),
        PlanTier.UNLIMITED: getattr(settings, "STRIPE_PRICE_UNLIMITED", ""),
        PlanTier.DEDICATED: getattr(settings, "STRIPE_PRICE_DEDICATED", ""),
    }.get(tier, "")


def _tier_for_price_id(price_id: str) -> str | None:
    if not price_id:
        return None
    for tier in (PlanTier.PLUS, PlanTier.UNLIMITED, PlanTier.DEDICATED):
        configured = _price_id_for_tier(tier)
        if configured and configured == price_id:
            return tier
    return None


def _serialize_dedicated_instance(
    inst: DedicatedServerInstance | None,
) -> DedicatedInstanceOut | None:
    if inst is None:
        return None
    return DedicatedInstanceOut(
        id=inst.id,
        status=inst.status,
        requested_subdomain=inst.requested_subdomain,
        dedicated_url=inst.dedicated_url,
        admin_notes=inst.admin_notes,
        provisioned_at=inst.provisioned_at,
        created_at=inst.created_at,
        updated_at=inst.updated_at,
    )


@billing_router.get("/plans", response=list[PlanOut])
def list_plans(request):
    secret_ready = bool(getattr(settings, "STRIPE_SECRET_KEY", ""))
    ordered = (PlanTier.FREE, PlanTier.PLUS, PlanTier.UNLIMITED, PlanTier.DEDICATED)
    out: list[PlanOut] = []
    for tier in ordered:
        meta = PLAN_CATALOG[tier]
        out.append(
            PlanOut(
                **meta,
                checkout_enabled=bool(secret_ready and _price_id_for_tier(tier)),
            )
        )
    return out


@billing_router.get("/status", response=BillingStatusOut, auth=WorkspaceAuth())
def billing_status(request):
    ent = get_user_entitlement_status(request.user)
    return BillingStatusOut(
        tier=ent["tier"],
        plan_name=ent["plan"]["name"],
        price_display=ent["plan"]["price_display"],
        source=ent["source"],
        status=ent["status"],
        enforce_tiers=ent["enforce_tiers"],
        max_vaults=ent["max_vaults"],
        max_items=ent["max_items"],
        owned_vault_count=ent["owned_vault_count"],
        active_item_count=ent["active_item_count"],
        cancel_at_period_end=ent["cancel_at_period_end"],
        current_period_end=ent["current_period_end"],
        has_stripe_customer=ent["has_stripe_customer"],
        checkout_configured=bool(getattr(settings, "STRIPE_SECRET_KEY", "")),
        dedicated_instance=_serialize_dedicated_instance(ent["dedicated_instance"]),
    )


@billing_router.post(
    "/checkout", response=CheckoutSessionOut, auth=WorkspaceAuth()
)
def create_checkout_session(request, payload: CheckoutIn):
    tier = (payload.tier or "").strip().upper()
    if tier not in {PlanTier.PLUS, PlanTier.UNLIMITED, PlanTier.DEDICATED}:
        raise HttpError(400, "Choose a paid plan tier: PLUS, UNLIMITED, or DEDICATED.")

    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    price_id = _price_id_for_tier(tier)
    if not secret_key or not price_id:
        raise HttpError(503, "Stripe Checkout is not configured on this server.")

    stripe.api_key = secret_key
    sub = get_or_create_subscription(request.user)
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(
            email=request.user.email,
            metadata={"user_id": str(request.user.id)},
        )
        sub.stripe_customer_id = str(customer["id"])
        sub.save(update_fields=["stripe_customer_id", "updated_at"])

    cleaned_subdomain = (payload.requested_subdomain or "").strip()[:80]
    if tier == PlanTier.DEDICATED and cleaned_subdomain:
        ensure_dedicated_instance(request.user, cleaned_subdomain)

    base_url = getattr(settings, "APP_BASE_URL", "http://localhost:5173").rstrip("/")
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=sub.stripe_customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{base_url}/settings?billing=success#billing",
        cancel_url=f"{base_url}/settings?billing=canceled#billing",
        metadata={
            "user_id": str(request.user.id),
            "tier": tier,
            "requested_subdomain": cleaned_subdomain,
        },
        subscription_data={
            "metadata": {
                "user_id": str(request.user.id),
                "tier": tier,
            }
        },
    )
    return CheckoutSessionOut(url=str(session["url"]), session_id=str(session["id"]))


@billing_router.post("/portal", response=PortalSessionOut, auth=WorkspaceAuth())
def create_portal_session(request):
    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not secret_key:
        raise HttpError(503, "Stripe Billing Portal is not configured on this server.")

    sub = get_or_create_subscription(request.user)
    if not sub.stripe_customer_id:
        raise HttpError(400, "No Stripe customer record is linked to this account yet.")

    stripe.api_key = secret_key
    base_url = getattr(settings, "APP_BASE_URL", "http://localhost:5173").rstrip("/")
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{base_url}/settings#billing",
    )
    return PortalSessionOut(url=str(session["url"]))


def _resolve_webhook_user(obj: dict[str, Any]) -> User | None:
    meta = obj.get("metadata") or {}
    user_id = meta.get("user_id")
    if user_id:
        user = User.objects.filter(id=user_id).first()
        if user is not None:
            return user
    customer_id = obj.get("customer") or ""
    if customer_id:
        sub = AccountSubscription.objects.select_related("user").filter(
            stripe_customer_id=customer_id
        ).first()
        if sub is not None:
            return sub.user
    subscription_id = obj.get("id") or obj.get("subscription") or ""
    if subscription_id:
        sub = AccountSubscription.objects.select_related("user").filter(
            stripe_subscription_id=subscription_id
        ).first()
        if sub is not None:
            return sub.user
    return None


@billing_router.post("/webhook")
@transaction.atomic
def stripe_webhook(request):
    webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HttpError(503, "Stripe webhook secret is not configured.")

    sig_header = (
        request.headers.get("Stripe-Signature")
        or request.META.get("HTTP_STRIPE_SIGNATURE")
        or ""
    )
    try:
        event = stripe.Webhook.construct_event(
            payload=request.body,
            sig_header=sig_header,
            secret=webhook_secret,
        )
    except Exception as exc:
        raise HttpError(400, f"Invalid Stripe webhook signature: {exc}") from exc

    event_type = str(event.get("type") or "")
    obj = (event.get("data") or {}).get("object") or {}
    user = _resolve_webhook_user(obj)
    if user is None:
        return {"received": True}

    sub = get_or_create_subscription(user)
    if sub.source == AccountSubscription.Source.ADMIN_OVERRIDE:
        customer_id = obj.get("customer") or ""
        if customer_id and not sub.stripe_customer_id:
            sub.stripe_customer_id = str(customer_id)
            sub.save(update_fields=["stripe_customer_id", "updated_at"])
        return {"received": True}

    meta = obj.get("metadata") or {}

    if event_type == "checkout.session.completed":
        tier = str(meta.get("tier") or "").upper()
        if tier in PlanTier.values:
            sub.tier = tier
        if obj.get("customer"):
            sub.stripe_customer_id = str(obj["customer"])
        if obj.get("subscription"):
            sub.stripe_subscription_id = str(obj["subscription"])
        sub.source = AccountSubscription.Source.STRIPE
        sub.status = AccountSubscription.Status.ACTIVE
        sub.cancel_at_period_end = False
        sub.save()
        if sub.tier == PlanTier.DEDICATED:
            ensure_dedicated_instance(user, str(meta.get("requested_subdomain") or ""))

    elif event_type == "customer.subscription.updated":
        items_data = ((obj.get("items") or {}).get("data")) or []
        price_id = ""
        if items_data and isinstance(items_data[0], dict):
            price_obj = items_data[0].get("price") or {}
            price_id = str(price_obj.get("id") or "")
        mapped_tier = _tier_for_price_id(price_id) or str(meta.get("tier") or "").upper()
        if mapped_tier in PlanTier.values:
            sub.tier = mapped_tier
        if price_id:
            sub.stripe_price_id = price_id
        if obj.get("id"):
            sub.stripe_subscription_id = str(obj["id"])
        if obj.get("customer"):
            sub.stripe_customer_id = str(obj["customer"])

        raw_status = str(obj.get("status") or "active").lower()
        sub.status = _STRIPE_STATUS_MAP.get(raw_status, AccountSubscription.Status.ACTIVE)
        sub.cancel_at_period_end = bool(obj.get("cancel_at_period_end", False))
        period_end_ts = obj.get("current_period_end")
        if isinstance(period_end_ts, (int, float)) and period_end_ts > 0:
            sub.current_period_end = datetime.fromtimestamp(
                float(period_end_ts), tz=UTC
            )
        if sub.status == AccountSubscription.Status.CANCELED:
            sub.tier = PlanTier.FREE
        sub.source = AccountSubscription.Source.STRIPE
        sub.save()
        if (
            sub.tier == PlanTier.DEDICATED
            and sub.status
            in {AccountSubscription.Status.ACTIVE, AccountSubscription.Status.TRIALING}
        ):
            ensure_dedicated_instance(user)

    elif event_type == "customer.subscription.deleted":
        sub.tier = PlanTier.FREE
        sub.source = AccountSubscription.Source.STRIPE
        sub.status = AccountSubscription.Status.CANCELED
        sub.stripe_subscription_id = ""
        sub.cancel_at_period_end = False
        sub.save()

    return {"received": True}
