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

