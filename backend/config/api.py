from ninja import NinjaAPI

from apps.accounts.admin_api import admin_router
from apps.accounts.api import auth_router, settings_router
from apps.accounts.billing_api import billing_router
from apps.accounts.models import PlanLimitExceeded
from apps.catalog.api import catalog_router
from apps.valuation.api import analytics_router, valuation_router
from apps.vision.api import vision_router

api = NinjaAPI(
    title="Stacker Stash API",
    version="1.0.0",
    description="Enterprise-grade multi-tenant API for coins, paper currency, and bullion collection tracking.",
    docs_url="/docs",
)


@api.exception_handler(PlanLimitExceeded)
def handle_plan_limit_exceeded(request, exc: PlanLimitExceeded):
    return api.create_response(
        request,
        {
            "detail": exc.detail,
            "code": "PLAN_LIMIT_REACHED",
            "limit_type": exc.limit_type,
            "current_usage": exc.current_usage,
            "limit": exc.limit,
            "current_tier": exc.current_tier,
        },
        status=402,
    )


api.add_router("/auth", auth_router)
api.add_router("/admin", admin_router)
api.add_router("/billing", billing_router)
api.add_router("/settings", settings_router)
api.add_router("/catalog", catalog_router)
api.add_router("/valuation", valuation_router)
api.add_router("/analytics", analytics_router)
api.add_router("/vision", vision_router)

