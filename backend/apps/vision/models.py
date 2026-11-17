from __future__ import annotations

import uuid

from django.db import models

from apps.accounts.models import Workspace


class IdentificationJob(models.Model):
    """Audit log of Vision AI identification attempts per workspace."""

    class Status(models.TextChoices):
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        MANUAL_FALLBACK = "MANUAL_FALLBACK", "Manual Fallback"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="identification_jobs"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUCCEEDED)
    provider_used = models.CharField(max_length=32, default="MANUAL")
    parsed_candidate = models.JSONField(default=dict, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ImageIdentificationCache(models.Model):
    """Cached item identification results keyed by SHA-256 and perceptual dHash."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="image_id_caches"
    )
    sha256 = models.CharField(max_length=64, db_index=True)
    dhash = models.CharField(max_length=32, db_index=True, blank=True, default="")
    provider_used = models.CharField(max_length=32, default="CACHE")
    parsed_candidate = models.JSONField(default=dict, blank=True)
    hit_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("workspace", "sha256")]
        ordering = ["-updated_at"]


class CertLookupCache(models.Model):
    """Server-side cache for verified grading slab cert & numismatic lookups."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grading_service = models.CharField(max_length=24, db_index=True)
    cert_number = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    source = models.CharField(max_length=32, default="CERT_LOOKUP")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("grading_service", "cert_number")]
        ordering = ["-updated_at"]

