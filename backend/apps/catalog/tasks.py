from __future__ import annotations

import logging
from typing import Any

from celery import shared_task

from .reference_sync import (
    run_daily_reference_sync,
    run_hourly_market_sync,
    run_weekly_static_sync,
)

logger = logging.getLogger(__name__)


@shared_task(name="apps.catalog.tasks.sync_weekly_static_catalog_task")
def sync_weekly_static_catalog_task(offline: bool = False) -> dict[str, Any]:
    """Celery task: weekly refresh of static catalog specifications and open TCG checklists."""
    logger.info("Starting sync_weekly_static_catalog_task (offline=%s)", offline)
    res = run_weekly_static_sync(offline=offline)
    logger.info("Completed sync_weekly_static_catalog_task: %s", res)
    return res


@shared_task(name="apps.catalog.tasks.sync_daily_reference_baselines_task")
def sync_daily_reference_baselines_task(offline: bool = False) -> dict[str, Any]:
    """Celery task: daily refresh of fiat FX rates, EOD spot curves, and population rollups."""
    logger.info("Starting sync_daily_reference_baselines_task (offline=%s)", offline)
    res = run_daily_reference_sync(offline=offline)
    logger.info("Completed sync_daily_reference_baselines_task: %s", res)
    return res


@shared_task(name="apps.catalog.tasks.sync_hourly_market_baselines_task")
def sync_hourly_market_baselines_task() -> dict[str, Any]:
    """Celery task: hourly benchmark rollup and hot Redis lookup cache warming."""
    logger.info("Starting sync_hourly_market_baselines_task")
    res = run_hourly_market_sync()
    logger.info("Completed sync_hourly_market_baselines_task: %s", res)
    return res
