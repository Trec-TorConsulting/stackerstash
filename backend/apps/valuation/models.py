from __future__ import annotations

import uuid

from django.db import models

from apps.accounts.models import Workspace
from apps.catalog.models import CollectionItem


class SpotPriceSnapshot(models.Model):
    """Cached spot metal quote normalized to USD per troy ounce."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    metal_type = models.CharField(
        max_length=16, choices=CollectionItem.MetalType.choices, db_index=True
    )
    price_usd_per_troy_oz = models.DecimalField(max_digits=12, decimal_places=4)
    source = models.CharField(max_length=64, default="gold-api.com")
    fetched_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self) -> str:
        return f"{self.metal_type}: ${self.price_usd_per_troy_oz}/ozt"


class ValuationHistory(models.Model):
    """Audit trail of item valuations over time."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        CollectionItem, on_delete=models.CASCADE, related_name="valuation_history"
    )
    melt_value_unit = models.DecimalField(max_digits=12, decimal_places=2)
    market_value_unit = models.DecimalField(max_digits=12, decimal_places=2)
    source = models.CharField(max_length=20)
    is_estimate = models.BooleanField(default=False)
    raw_payload = models.JSONField(default=dict, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]


class AppraisalJob(models.Model):
    """Background/progressive appraisal execution state for an item."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="appraisal_jobs"
    )
    item = models.ForeignKey(
        CollectionItem, on_delete=models.CASCADE, related_name="appraisal_jobs"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    steps = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["item", "status"]),
        ]

