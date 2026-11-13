from celery import shared_task

from .services import refresh_spot_prices


@shared_task(name="apps.valuation.tasks.refresh_spot_prices_task")
def refresh_spot_prices_task() -> dict[str, str]:
    spots = refresh_spot_prices()
    return {k: str(v) for k, v in spots.items()}

