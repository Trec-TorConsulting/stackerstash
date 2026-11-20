from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import models


class StaticNumismaticSpec(models.Model):
    """Authoritative reference specifications for coins, bullion, and varieties."""

    class ItemKind(models.TextChoices):
        COIN = "COIN", "Coin"
        BULLION = "BULLION", "Bullion"
        VINTAGE_BAR = "VINTAGE_BAR", "Vintage Bar / Ingot"
        VARIETY = "VARIETY", "Variety / Error"
        ANCIENT = "ANCIENT", "Ancient Coin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_key = models.CharField(max_length=120, unique=True, db_index=True)
    item_kind = models.CharField(
        max_length=24, choices=ItemKind.choices, default=ItemKind.COIN, db_index=True
    )
    title = models.CharField(max_length=200)
    country = models.CharField(max_length=100, blank=True, default="")
    series = models.CharField(max_length=120, blank=True, default="")
    denomination = models.CharField(max_length=64, blank=True, default="")
    year_start = models.IntegerField(null=True, blank=True)
    year_end = models.IntegerField(null=True, blank=True)
    mint_or_refiner = models.CharField(max_length=120, blank=True, default="")
    valid_mint_marks = models.JSONField(default=list, blank=True)
    metal_type = models.CharField(max_length=16, default="NONE")
    purity = models.DecimalField(max_digits=7, decimal_places=6, default=Decimal("0.999000"))
    weight_value = models.DecimalField(max_digits=14, decimal_places=6, default=Decimal("0.000000"))
    weight_unit = models.CharField(max_length=12, default="OZ_T")
    fine_troy_oz = models.DecimalField(max_digits=14, decimal_places=6, default=Decimal("0.000000"))
    gross_weight_grams = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    diameter_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    thickness_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    edge_type = models.CharField(max_length=64, blank=True, default="")
    composition = models.CharField(max_length=120, blank=True, default="")
    mintage = models.PositiveBigIntegerField(null=True, blank=True)
    is_key_date = models.BooleanField(default=False)
    is_high_counterfeit_risk = models.BooleanField(default=False)
    catalog_numbers = models.JSONField(default=dict, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    secondary_keywords = models.JSONField(default=list, blank=True)
    extra_specs = models.JSONField(default=dict, blank=True)
    sync_tier = models.CharField(max_length=12, default="STATIC")
    source_name = models.CharField(max_length=64, blank=True, default="STATIC_SEED")
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["series", "title"]
        indexes = [
            models.Index(fields=["item_kind", "country", "series"]),
            models.Index(fields=["country", "denomination"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} [{self.ref_key}]"


class StaticBanknoteSpec(models.Model):
    """Authoritative reference specifications for banknotes, charters, and star notes."""

    class RecordKind(models.TextChoices):
        BANKNOTE = "BANKNOTE", "Banknote"
        STAR_RUN = "STAR_RUN", "Star Note Run"
        CHARTER = "CHARTER", "National Bank Charter"
        GOLDBACK = "GOLDBACK", "Goldback"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_key = models.CharField(max_length=120, unique=True, db_index=True)
    record_kind = models.CharField(
        max_length=24, choices=RecordKind.choices, default=RecordKind.BANKNOTE, db_index=True
    )
    country = models.CharField(max_length=100, blank=True, default="United States")
    title = models.CharField(max_length=200)
    series = models.CharField(max_length=64, blank=True, default="")
    denomination = models.CharField(max_length=64, blank=True, default="")
    friedberg_number = models.CharField(max_length=32, blank=True, default="", db_index=True)
    pick_number = models.CharField(max_length=32, blank=True, default="", db_index=True)
    charter_number = models.IntegerField(null=True, blank=True, db_index=True)
    frb_district = models.CharField(max_length=16, blank=True, default="")
    seal_color = models.CharField(max_length=32, blank=True, default="")
    size_class = models.CharField(max_length=16, default="SMALL")
    width_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    height_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    signatures = models.JSONField(default=list, blank=True)
    serial_range_start = models.PositiveBigIntegerField(null=True, blank=True)
    serial_range_end = models.PositiveBigIntegerField(null=True, blank=True)
    print_run_size = models.PositiveBigIntegerField(null=True, blank=True)
    is_scarce_run = models.BooleanField(default=False)
    keywords = models.JSONField(default=list, blank=True)
    extra_specs = models.JSONField(default=dict, blank=True)
    sync_tier = models.CharField(max_length=12, default="STATIC")
    source_name = models.CharField(max_length=64, blank=True, default="STATIC_SEED")
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["denomination", "title"]
        indexes = [
            models.Index(fields=["record_kind", "country", "denomination"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.record_kind})"


class StaticCardSpec(models.Model):
    """Authoritative reference specifications for multi-franchise trading cards."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_key = models.CharField(max_length=120, unique=True, db_index=True)
    card_game = models.CharField(max_length=64, db_index=True)
    set_name = models.CharField(max_length=160, db_index=True)
    set_code = models.CharField(max_length=32, blank=True, default="", db_index=True)
    card_number = models.CharField(max_length=32, db_index=True)
    card_name = models.CharField(max_length=200)
    release_year = models.IntegerField(null=True, blank=True)
    rarity = models.CharField(max_length=64, blank=True, default="")
    card_finish = models.CharField(max_length=64, blank=True, default="")
    card_edition = models.CharField(max_length=64, blank=True, default="")
    language = models.CharField(max_length=32, default="English")
    artist = models.CharField(max_length=120, blank=True, default="")
    width_mm = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("63.50"))
    height_mm = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("88.90"))
    thickness_pt = models.PositiveSmallIntegerField(default=35)
    external_ids = models.JSONField(default=dict, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    extra_specs = models.JSONField(default=dict, blank=True)
    sync_tier = models.CharField(max_length=12, default="STATIC")
    source_name = models.CharField(max_length=64, blank=True, default="STATIC_SEED")
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["card_game", "set_name", "card_number"]
        indexes = [
            models.Index(fields=["card_game", "set_code", "card_number"]),
            models.Index(fields=["card_game", "set_name"]),
        ]

    def __str__(self) -> str:
        return f"{self.card_name} [{self.set_name} #{self.card_number}]"


class StaticGradingReference(models.Model):
    """Fee tiers, declared-value ceilings, and population baselines for grading services."""

    class RecordKind(models.TextChoices):
        FEE_SCHEDULE = "FEE_SCHEDULE", "Fee Schedule"
        POPULATION = "POPULATION", "Population"

    class AssetClass(models.TextChoices):
        COIN = "COIN", "Coin"
        PAPER = "PAPER", "Paper Currency"
        CARD = "CARD", "Trading Card"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_key = models.CharField(max_length=120, unique=True, db_index=True)
    record_kind = models.CharField(
        max_length=20, choices=RecordKind.choices, default=RecordKind.FEE_SCHEDULE, db_index=True
    )
    grading_service = models.CharField(max_length=20, db_index=True)
    asset_class = models.CharField(
        max_length=20, choices=AssetClass.choices, default=AssetClass.COIN
    )
    tier_name = models.CharField(max_length=64, blank=True, default="")
    fee_usd = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    max_declared_value_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    shipping_buffer_usd = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("15.00"))
    turnaround_days = models.PositiveSmallIntegerField(null=True, blank=True)
    catalog_ref_key = models.CharField(max_length=120, blank=True, default="", db_index=True)
    grade = models.CharField(max_length=32, blank=True, default="")
    total_population = models.PositiveIntegerField(null=True, blank=True)
    population_higher = models.PositiveIntegerField(null=True, blank=True)
    extra_specs = models.JSONField(default=dict, blank=True)
    sync_tier = models.CharField(max_length=12, default="STATIC")
    source_name = models.CharField(max_length=64, blank=True, default="STATIC_SEED")
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["grading_service", "fee_usd"]
        indexes = [
            models.Index(fields=["record_kind", "grading_service", "asset_class"]),
            models.Index(fields=["catalog_ref_key", "grading_service", "grade"]),
        ]

    def __str__(self) -> str:
        return f"{self.grading_service} {self.tier_name or self.grade} [{self.record_kind}]"


class StaticMarketBaseline(models.Model):
    """Historical spot curves, hourly GSR rollups, and fiat FX rates."""

    class MetricKind(models.TextChoices):
        FX_RATE = "FX_RATE", "FX Rate"
        HISTORICAL_SPOT = "HISTORICAL_SPOT", "Historical Spot"
        HOURLY_BENCHMARK = "HOURLY_BENCHMARK", "Hourly Benchmark"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_key = models.CharField(max_length=120, unique=True, db_index=True)
    metric_kind = models.CharField(max_length=24, choices=MetricKind.choices, db_index=True)
    symbol = models.CharField(max_length=16, db_index=True)
    as_of_date = models.DateField(null=True, blank=True, db_index=True)
    as_of_timestamp = models.DateTimeField(null=True, blank=True)
    value = models.DecimalField(max_digits=14, decimal_places=6)
    extra_metrics = models.JSONField(default=dict, blank=True)
    source_name = models.CharField(max_length=64, blank=True, default="STATIC_SEED")
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-as_of_date", "-as_of_timestamp"]
        indexes = [
            models.Index(fields=["metric_kind", "symbol", "-as_of_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.metric_kind} {self.symbol}: {self.value}"


class ReferenceSyncLog(models.Model):
    """Audit log of tiered static reference synchronization runs."""

    class SyncTier(models.TextChoices):
        SEED = "SEED", "Seed Fixture"
        WEEKLY = "WEEKLY", "Weekly Sync"
        DAILY = "DAILY", "Daily Sync"
        HOURLY = "HOURLY", "Hourly Benchmark"

    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        SUCCESS = "SUCCESS", "Success"
        PARTIAL = "PARTIAL", "Partial / Degraded"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sync_tier = models.CharField(max_length=16, choices=SyncTier.choices, db_index=True)
    source_name = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    records_upserted = models.PositiveIntegerField(default=0)
    records_skipped = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["sync_tier", "-started_at"]),
        ]

    def __str__(self) -> str:
        return f"Sync [{self.sync_tier}] {self.source_name}: {self.status} (+{self.records_upserted})"
