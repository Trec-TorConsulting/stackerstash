from __future__ import annotations

import json
import logging
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from pydantic import BaseModel, Field

from .reference_models import (
    ReferenceSyncLog,
    StaticBanknoteSpec,
    StaticCardSpec,
    StaticGradingReference,
    StaticMarketBaseline,
    StaticNumismaticSpec,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic v2 Validation Schemas
# ---------------------------------------------------------------------------
class NumismaticSpecSchema(BaseModel):
    ref_key: str
    item_kind: str = "COIN"
    title: str
    country: str = ""
    series: str = ""
    denomination: str = ""
    year_start: int | None = None
    year_end: int | None = None
    mint_or_refiner: str = ""
    valid_mint_marks: list[str] = Field(default_factory=list)
    metal_type: str = "NONE"
    purity: Decimal = Decimal("0.999000")
    weight_value: Decimal = Decimal("0.000000")
    weight_unit: str = "OZ_T"
    fine_troy_oz: Decimal = Decimal("0.000000")
    gross_weight_grams: Decimal | None = None
    diameter_mm: Decimal | None = None
    thickness_mm: Decimal | None = None
    edge_type: str = ""
    composition: str = ""
    mintage: int | None = None
    is_key_date: bool = False
    is_high_counterfeit_risk: bool = False
    catalog_numbers: dict[str, Any] = Field(default_factory=dict)
    keywords: list[str] = Field(default_factory=list)
    secondary_keywords: list[str] = Field(default_factory=list)
    extra_specs: dict[str, Any] = Field(default_factory=dict)
    sync_tier: str = "STATIC"
    source_name: str = "STATIC_SEED"


class BanknoteSpecSchema(BaseModel):
    ref_key: str
    record_kind: str = "BANKNOTE"
    country: str = "United States"
    title: str
    series: str = ""
    denomination: str = ""
    friedberg_number: str = ""
    pick_number: str = ""
    charter_number: int | None = None
    frb_district: str = ""
    seal_color: str = ""
    size_class: str = "SMALL"
    width_mm: Decimal | None = None
    height_mm: Decimal | None = None
    signatures: list[str] = Field(default_factory=list)
    serial_range_start: int | None = None
    serial_range_end: int | None = None
    print_run_size: int | None = None
    is_scarce_run: bool = False
    keywords: list[str] = Field(default_factory=list)
    extra_specs: dict[str, Any] = Field(default_factory=dict)
    sync_tier: str = "STATIC"
    source_name: str = "STATIC_SEED"


class CardSpecSchema(BaseModel):
    ref_key: str
    card_game: str
    set_name: str
    set_code: str = ""
    card_number: str
    card_name: str
    release_year: int | None = None
    rarity: str = ""
    card_finish: str = ""
    card_edition: str = ""
    language: str = "English"
    artist: str = ""
    width_mm: Decimal = Decimal("63.50")
    height_mm: Decimal = Decimal("88.90")
    thickness_pt: int = 35
    external_ids: dict[str, Any] = Field(default_factory=dict)
    keywords: list[str] = Field(default_factory=list)
    extra_specs: dict[str, Any] = Field(default_factory=dict)
    sync_tier: str = "STATIC"
    source_name: str = "STATIC_SEED"


class GradingReferenceSchema(BaseModel):
    ref_key: str
    record_kind: str = "FEE_SCHEDULE"
    grading_service: str
    asset_class: str = "COIN"
    tier_name: str = ""
    fee_usd: Decimal | None = None
    max_declared_value_usd: Decimal | None = None
    shipping_buffer_usd: Decimal = Decimal("15.00")
    turnaround_days: int | None = None
    catalog_ref_key: str = ""
    grade: str = ""
    total_population: int | None = None
    population_higher: int | None = None
    extra_specs: dict[str, Any] = Field(default_factory=dict)
    sync_tier: str = "STATIC"
    source_name: str = "STATIC_SEED"


# ---------------------------------------------------------------------------
# Fixture Loader (Idempotent Seed)
# ---------------------------------------------------------------------------
def seed_static_reference_catalog() -> dict[str, int]:
    """Load bundled JSON fixtures into static reference tables idempotently."""
    fixtures_dir = Path(settings.BASE_DIR) / "apps" / "catalog" / "fixtures" / "reference"
    counts: dict[str, int] = {"numismatics": 0, "banknotes": 0, "cards": 0, "grading": 0}

    # 1. Numismatics
    num_path = fixtures_dir / "numismatics.json"
    if num_path.exists():
        with open(num_path, encoding="utf-8") as f:
            items = json.load(f)
        with transaction.atomic():
            for raw in items:
                spec = NumismaticSpecSchema.model_validate(raw)
                StaticNumismaticSpec.objects.update_or_create(
                    ref_key=spec.ref_key,
                    defaults=spec.model_dump(exclude={"ref_key"}),
                )
                counts["numismatics"] += 1

    # 2. Banknotes
    note_path = fixtures_dir / "banknotes.json"
    if note_path.exists():
        with open(note_path, encoding="utf-8") as f:
            items = json.load(f)
        with transaction.atomic():
            for raw in items:
                spec = BanknoteSpecSchema.model_validate(raw)
                StaticBanknoteSpec.objects.update_or_create(
                    ref_key=spec.ref_key,
                    defaults=spec.model_dump(exclude={"ref_key"}),
                )
                counts["banknotes"] += 1

    # 3. Trading Cards
    card_path = fixtures_dir / "trading_cards.json"
    if card_path.exists():
        with open(card_path, encoding="utf-8") as f:
            items = json.load(f)
        with transaction.atomic():
            for raw in items:
                spec = CardSpecSchema.model_validate(raw)
                StaticCardSpec.objects.update_or_create(
                    ref_key=spec.ref_key,
                    defaults=spec.model_dump(exclude={"ref_key"}),
                )
                counts["cards"] += 1

    # 4. Grading Reference
    grade_path = fixtures_dir / "grading_reference.json"
    if grade_path.exists():
        with open(grade_path, encoding="utf-8") as f:
            items = json.load(f)
        with transaction.atomic():
            for raw in items:
                spec = GradingReferenceSchema.model_validate(raw)
                StaticGradingReference.objects.update_or_create(
                    ref_key=spec.ref_key,
                    defaults=spec.model_dump(exclude={"ref_key"}),
                )
                counts["grading"] += 1

    total_upserted = sum(counts.values())
    ReferenceSyncLog.objects.create(
        sync_tier=ReferenceSyncLog.SyncTier.SEED,
        source_name="JSON_FIXTURES",
        status=ReferenceSyncLog.Status.SUCCESS,
        records_upserted=total_upserted,
        completed_at=timezone.now(),
    )
    return counts


# ---------------------------------------------------------------------------
# Weekly Sync: Fixtures + Open TCG Set Indexes (Scryfall, Pokémon, Yugioh)
# ---------------------------------------------------------------------------
def run_weekly_static_sync(
    offline: bool = False,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Execute weekly sync of immutable reference data and public TCG catalogs."""
    log = ReferenceSyncLog.objects.create(
        sync_tier=ReferenceSyncLog.SyncTier.WEEKLY,
        source_name="WEEKLY_CATALOG_SYNC",
        status=ReferenceSyncLog.Status.RUNNING,
    )
    total_upserted = 0
    errors: list[str] = []

    # Always re-sync bundled fixtures first
    try:
        seed_counts = seed_static_reference_catalog()
        total_upserted += sum(seed_counts.values())
    except Exception as exc:
        logger.warning("Fixture seed failed during weekly sync: %s", exc)
        errors.append(f"Fixture seed: {exc}")

    if not offline:
        http_client = client or httpx.Client(timeout=15.0)
        close_client = client is None

        try:
            # 1. Scryfall MTG Sets
            try:
                resp = http_client.get("https://api.scryfall.com/sets")
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    for s in data[:15]:  # index top recent/key sets
                        code = str(s.get("code") or "").upper()
                        name = str(s.get("name") or "")
                        if code and name:
                            ref_key = f"mtg_set_{code.lower()}"
                            StaticCardSpec.objects.update_or_create(
                                ref_key=ref_key,
                                defaults={
                                    "card_game": "Magic: The Gathering",
                                    "set_name": name,
                                    "set_code": code,
                                    "card_number": "SET_INDEX",
                                    "card_name": f"{name} Set Index",
                                    "release_year": int(str(s.get("released_at", "2000"))[:4]) if s.get("released_at") else None,
                                    "sync_tier": "WEEKLY",
                                    "source_name": "SCRYFALL_PUBLIC",
                                    "external_ids": {"scryfall_set_id": s.get("id")},
                                },
                            )
                            total_upserted += 1
            except Exception as exc:
                logger.warning("Scryfall sets sync skipped: %s", exc)
                errors.append(f"Scryfall: {exc}")

            # 2. Pokémon TCG Sets
            try:
                resp = http_client.get("https://api.pokemontcg.io/v2/sets")
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    for s in data[:15]:
                        sid = str(s.get("id") or "").lower()
                        name = str(s.get("name") or "")
                        if sid and name:
                            ref_key = f"pokemon_set_{sid}"
                            StaticCardSpec.objects.update_or_create(
                                ref_key=ref_key,
                                defaults={
                                    "card_game": "Pokémon",
                                    "set_name": name,
                                    "set_code": str(s.get("ptcgoCode") or sid).upper(),
                                    "card_number": "SET_INDEX",
                                    "card_name": f"{name} Set Index",
                                    "release_year": int(str(s.get("releaseDate", "2000"))[:4]) if s.get("releaseDate") else None,
                                    "sync_tier": "WEEKLY",
                                    "source_name": "POKEMON_TCG_PUBLIC",
                                    "external_ids": {"pokemon_tcg_set_id": sid},
                                },
                            )
                            total_upserted += 1
            except Exception as exc:
                logger.warning("Pokemon TCG sets sync skipped: %s", exc)
                errors.append(f"PokemonTCG: {exc}")

            # 3. YGOProDeck Yu-Gi-Oh! Sets
            try:
                resp = http_client.get("https://db.ygoprodeck.com/api/v7/cardsets.php")
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        for s in data[:15]:
                            code = str(s.get("set_code") or "").upper()
                            name = str(s.get("set_name") or "")
                            if code and name:
                                ref_key = f"yugioh_set_{code.lower()}"
                                StaticCardSpec.objects.update_or_create(
                                    ref_key=ref_key,
                                    defaults={
                                        "card_game": "Yu-Gi-Oh!",
                                        "set_name": name,
                                        "set_code": code,
                                        "card_number": "SET_INDEX",
                                        "card_name": f"{name} Set Index",
                                        "sync_tier": "WEEKLY",
                                        "source_name": "YGOPRODECK_PUBLIC",
                                    },
                                )
                                total_upserted += 1
            except Exception as exc:
                logger.warning("YGOProDeck sets sync skipped: %s", exc)
                errors.append(f"YGOProDeck: {exc}")

        finally:
            if close_client:
                http_client.close()

    # Clear hot Redis cache pattern
    try:
        cache.delete_many(cache.keys("ref:match:*") if hasattr(cache, "keys") else [])
    except Exception as exc:
        logger.debug("Redis cache clear skipped: %s", exc)

    status = (
        ReferenceSyncLog.Status.SUCCESS
        if not errors
        else (ReferenceSyncLog.Status.PARTIAL if total_upserted > 0 else ReferenceSyncLog.Status.FAILED)
    )
    log.status = status
    log.records_upserted = total_upserted
    log.error_message = "; ".join(errors)
    log.completed_at = timezone.now()
    log.save()

    return {"status": status, "records_upserted": total_upserted, "errors": errors}


# ---------------------------------------------------------------------------
# Daily Sync: ECB Fiat FX Rates + EOD Spot/GSR Baselines + Pop Rollups
# ---------------------------------------------------------------------------
def run_daily_reference_sync(
    offline: bool = False,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Execute daily sync of fiat FX rates, EOD spot curves, and population rollups."""
    log = ReferenceSyncLog.objects.create(
        sync_tier=ReferenceSyncLog.SyncTier.DAILY,
        source_name="DAILY_BASELINES_SYNC",
        status=ReferenceSyncLog.Status.RUNNING,
    )
    total_upserted = 0
    errors: list[str] = []
    today = date.today()

    if not offline:
        http_client = client or httpx.Client(timeout=15.0)
        close_client = client is None

        try:
            # 1. Frankfurter ECB FX rates
            try:
                resp = http_client.get(
                    "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD,MXN,AUD,CHF,JPY"
                )
                if resp.status_code == 200:
                    rates = resp.json().get("rates", {})
                    for curr, rate in rates.items():
                        ref_key = f"fx_usd_{curr.lower()}_{today.isoformat()}"
                        StaticMarketBaseline.objects.update_or_create(
                            ref_key=ref_key,
                            defaults={
                                "metric_kind": StaticMarketBaseline.MetricKind.FX_RATE,
                                "symbol": curr.upper(),
                                "as_of_date": today,
                                "as_of_timestamp": timezone.now(),
                                "value": Decimal(str(rate)),
                                "source_name": "FRANKFURTER_ECB",
                            },
                        )
                        total_upserted += 1
            except Exception as exc:
                logger.warning("Frankfurter FX sync skipped: %s", exc)
                errors.append(f"FX: {exc}")

        finally:
            if close_client:
                http_client.close()

    # 2. Archive EOD Historical Spot & GSR from SpotPriceSnapshot
    try:
        from apps.valuation.models import SpotPriceSnapshot

        gold_snap = SpotPriceSnapshot.objects.filter(metal_type="GOLD").first()
        silver_snap = SpotPriceSnapshot.objects.filter(metal_type="SILVER").first()

        if gold_snap and silver_snap and silver_snap.price_usd_per_troy_oz > 0:
            gsr = (gold_snap.price_usd_per_troy_oz / silver_snap.price_usd_per_troy_oz).quantize(
                Decimal("0.01")
            )
            ref_key = f"spot_gsr_eod_{today.isoformat()}"
            StaticMarketBaseline.objects.update_or_create(
                ref_key=ref_key,
                defaults={
                    "metric_kind": StaticMarketBaseline.MetricKind.HISTORICAL_SPOT,
                    "symbol": "GSR",
                    "as_of_date": today,
                    "as_of_timestamp": timezone.now(),
                    "value": gsr,
                    "extra_metrics": {
                        "gold_spot": str(gold_snap.price_usd_per_troy_oz),
                        "silver_spot": str(silver_snap.price_usd_per_troy_oz),
                    },
                    "source_name": "SPOT_SNAPSHOT_EOD",
                },
            )
            total_upserted += 1
    except Exception as exc:
        logger.warning("EOD spot baseline archiving skipped: %s", exc)
        errors.append(f"EOD Spot: {exc}")

    # 3. Roll up cached pop counts from CertLookupCache into StaticGradingReference
    try:
        from apps.vision.models import CertLookupCache

        cert_rows = CertLookupCache.objects.exclude(payload={})[:100]
        for c in cert_rows:
            raw = c.payload or {}
            pop = raw.get("TotalPopulation") or raw.get("total_population")
            if pop is not None:
                try:
                    pop_val = int(pop)
                    ref_key = f"pop_{c.grading_service.lower()}_{c.cert_number}"
                    StaticGradingReference.objects.update_or_create(
                        ref_key=ref_key,
                        defaults={
                            "record_kind": StaticGradingReference.RecordKind.POPULATION,
                            "grading_service": c.grading_service,
                            "catalog_ref_key": c.cert_number,
                            "total_population": pop_val,
                            "source_name": "CERT_CACHE_ROLLUP",
                        },
                    )
                    total_upserted += 1
                except (ValueError, TypeError):
                    pass
    except Exception as exc:
        logger.warning("Pop rollup skipped: %s", exc)
        errors.append(f"Pop Rollup: {exc}")

    status = (
        ReferenceSyncLog.Status.SUCCESS
        if not errors
        else (ReferenceSyncLog.Status.PARTIAL if total_upserted > 0 else ReferenceSyncLog.Status.FAILED)
    )
    log.status = status
    log.records_upserted = total_upserted
    log.error_message = "; ".join(errors)
    log.completed_at = timezone.now()
    log.save()

    return {"status": status, "records_upserted": total_upserted, "errors": errors}


# ---------------------------------------------------------------------------
# Hourly Sync: Volatile Spot Benchmark & Hot Redis Cache Warming
# ---------------------------------------------------------------------------
def run_hourly_market_sync() -> dict[str, Any]:
    """Compute hourly market benchmark and refresh hot Redis lookup cache."""
    log = ReferenceSyncLog.objects.create(
        sync_tier=ReferenceSyncLog.SyncTier.HOURLY,
        source_name="HOURLY_SPOT_BENCHMARK",
        status=ReferenceSyncLog.Status.RUNNING,
    )
    total_upserted = 0
    now = timezone.now()
    hour_key = now.strftime("%Y%m%d%H")

    try:
        from apps.valuation.models import SpotPriceSnapshot

        gold = SpotPriceSnapshot.objects.filter(metal_type="GOLD").first()
        silver = SpotPriceSnapshot.objects.filter(metal_type="SILVER").first()
        copper = SpotPriceSnapshot.objects.filter(metal_type="COPPER").first()

        benchmarks: dict[str, str] = {}
        if gold and silver and silver.price_usd_per_troy_oz > 0:
            gsr = (gold.price_usd_per_troy_oz / silver.price_usd_per_troy_oz).quantize(Decimal("0.01"))
            ref_key = f"hourly_gsr_{hour_key}"
            StaticMarketBaseline.objects.update_or_create(
                ref_key=ref_key,
                defaults={
                    "metric_kind": StaticMarketBaseline.MetricKind.HOURLY_BENCHMARK,
                    "symbol": "GSR",
                    "as_of_date": now.date(),
                    "as_of_timestamp": now,
                    "value": gsr,
                    "extra_metrics": {
                        "gold": str(gold.price_usd_per_troy_oz),
                        "silver": str(silver.price_usd_per_troy_oz),
                        "copper": str(copper.price_usd_per_troy_oz) if copper else "",
                    },
                    "source_name": "HOURLY_ROLLUP",
                },
            )
            benchmarks["GSR"] = str(gsr)
            benchmarks["GOLD"] = str(gold.price_usd_per_troy_oz)
            benchmarks["SILVER"] = str(silver.price_usd_per_troy_oz)
            total_upserted += 1

        # Warm Redis cache key
        cache.set("ref:market:latest", benchmarks, timeout=7200)

        log.status = ReferenceSyncLog.Status.SUCCESS
        log.records_upserted = total_upserted
        log.completed_at = timezone.now()
        log.save()
        return {"status": "SUCCESS", "benchmarks": benchmarks}

    except Exception as exc:
        logger.warning("Hourly market sync error: %s", exc)
        log.status = ReferenceSyncLog.Status.FAILED
        log.error_message = str(exc)
        log.completed_at = timezone.now()
        log.save()
        return {"status": "FAILED", "error": str(exc)}
