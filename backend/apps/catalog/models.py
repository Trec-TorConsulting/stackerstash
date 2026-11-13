from __future__ import annotations

import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.db import models

from apps.accounts.models import Workspace

TROY_OZ_GRAMS = Decimal("31.1034768")
AVDP_OZ_GRAMS = Decimal("28.349523125")
KG_GRAMS = Decimal("1000")


def compute_fine_troy_oz(
    weight_value: Decimal | None,
    weight_unit: str,
    purity: Decimal | None,
    metal_type: str,
) -> Decimal:
    """Normalize any weight unit and purity into fine troy ounces."""
    if metal_type == "NONE" or not weight_value or weight_value <= 0:
        return Decimal("0.000000")

    effective_purity = purity if (purity and purity > 0) else Decimal("1.000000")
    if weight_unit == "OZ_T":
        troy_oz = weight_value
    elif weight_unit == "G":
        troy_oz = weight_value / TROY_OZ_GRAMS
    elif weight_unit == "KG":
        troy_oz = (weight_value * KG_GRAMS) / TROY_OZ_GRAMS
    elif weight_unit == "OZ_AVDP":
        troy_oz = (weight_value * AVDP_OZ_GRAMS) / TROY_OZ_GRAMS
    else:
        troy_oz = Decimal("0")

    fine = troy_oz * effective_purity
    return fine.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


class Container(models.Model):
    """Hierarchical physical storage container (Safe -> Box -> Tube / Binder)."""

    class ContainerType(models.TextChoices):
        SAFE = "SAFE", "Safe / Vault"
        BOX = "BOX", "Monster Box / Storage Box"
        TUBE = "TUBE", "Coin Tube"
        BINDER = "BINDER", "Binder / Album"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="containers"
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
    )
    name = models.CharField(max_length=120)
    container_type = models.CharField(
        max_length=16, choices=ContainerType.choices, default=ContainerType.BOX
    )
    location_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_container_type_display()})"


class CollectionItem(models.Model):
    """Unified polymorphic record for coins, paper currency, bars, rounds, slabs, and flips."""

    class Category(models.TextChoices):
        COIN = "COIN", "Coin"
        PAPER = "PAPER", "Paper Currency"
        BAR = "BAR", "Bar / Ingot"
        ROUND = "ROUND", "Round"
        SLAB = "SLAB", "Graded Slab"
        FLIPPER = "FLIPPER", "Coin Flip / Holder"
        OTHER = "OTHER", "Other Collectible"

    class SortCategory(models.TextChoices):
        COIN = "COIN", "Coins"
        PAPER = "PAPER", "Paper Currency"
        BAR = "BAR", "Bars / Ingots"
        ROUND = "ROUND", "Rounds"
        OTHER = "OTHER", "Other"

    class MetalType(models.TextChoices):
        NONE = "NONE", "None / Non-Bullion"
        GOLD = "GOLD", "Gold (Au)"
        SILVER = "SILVER", "Silver (Ag)"
        PLATINUM = "PLATINUM", "Platinum (Pt)"
        PALLADIUM = "PALLADIUM", "Palladium (Pd)"
        COPPER = "COPPER", "Copper (Cu)"

    class WeightUnit(models.TextChoices):
        OZ_T = "OZ_T", "Troy Ounces (ozt)"
        G = "G", "Grams (g)"
        KG = "KG", "Kilograms (kg)"
        OZ_AVDP = "OZ_AVDP", "Avoirdupois Ounces (oz)"

    class GradingService(models.TextChoices):
        NONE = "NONE", "Raw / Ungraded"
        PCGS = "PCGS", "PCGS"
        NGC = "NGC", "NGC"
        PMG = "PMG", "PMG"
        PCGS_BANKNOTE = "PCGS_BANKNOTE", "PCGS Banknote"
        CACG = "CACG", "CACG"
        ANACS = "ANACS", "ANACS"
        ICG = "ICG", "ICG"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        IN_COLLECTION = "IN_COLLECTION", "In Collection"
        FOR_SALE = "FOR_SALE", "For Sale"
        SOLD = "SOLD", "Sold"
        WISHLIST = "WISHLIST", "Wishlist"

    class ValuationSource(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        SPOT_MELT = "SPOT_MELT", "Live Spot Melt"
        PCGS = "PCGS", "PCGS Price Guide"
        GREYSHEET = "GREYSHEET", "Greysheet CDN"
        NUMISMEDIA = "NUMISMEDIA", "NumisMedia FMV"
        COMPS = "COMPS", "Realized Sold Comps"
        AI_ESTIMATE = "AI_ESTIMATE", "AI Estimate"

    class ValuationConfidence(models.TextChoices):
        HIGH = "HIGH", "High"
        MEDIUM = "MEDIUM", "Medium"
        LOW = "LOW", "Low"

    class CollectibilityTier(models.TextChoices):
        BULLION = "BULLION", "Bullion / Melt-Driven"
        SEMI_NUMISMATIC = "SEMI_NUMISMATIC", "Semi-Numismatic"
        KEY_DATE_COLLECTIBLE = "KEY_DATE_COLLECTIBLE", "Key Date / Scarce"
        NUMISMATIC = "NUMISMATIC", "Numismatic Collectible"

    class IntakeSource(models.TextChoices):
        CAMERA = "CAMERA", "Guided Camera"
        UPLOAD = "UPLOAD", "File Upload"
        CSV = "CSV", "CSV / Bulk Import"
        MANUAL = "MANUAL", "Manual Entry"

    class PhotoVerificationStatus(models.TextChoices):
        NONE = "NONE", "Not Checked"
        VERIFIED = "VERIFIED", "Verified Physical Photo"
        FLAGGED = "FLAGGED", "Flagged / Needs Review"
        OVERRIDDEN = "OVERRIDDEN", "User Overridden"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="items"
    )
    container = models.ForeignKey(
        Container,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="items",
    )

    category = models.CharField(max_length=16, choices=Category.choices, default=Category.COIN)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.IN_COLLECTION
    )
    title = models.CharField(max_length=200)
    country = models.CharField(max_length=100, blank=True, default="")
    year = models.CharField(max_length=32, blank=True, default="")
    mint_or_refiner = models.CharField(max_length=120, blank=True, default="")
    denomination = models.CharField(max_length=64, blank=True, default="")
    series = models.CharField(max_length=120, blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)

    # Bullion & Melt
    metal_type = models.CharField(
        max_length=16, choices=MetalType.choices, default=MetalType.NONE
    )
    weight_value = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0"))
    weight_unit = models.CharField(
        max_length=12, choices=WeightUnit.choices, default=WeightUnit.OZ_T
    )
    purity = models.DecimalField(max_digits=7, decimal_places=6, default=Decimal("0.999000"))
    fine_troy_oz = models.DecimalField(
        max_digits=14, decimal_places=6, default=Decimal("0.000000")
    )

    # Grading, Certs & Serials
    grading_service = models.CharField(
        max_length=20, choices=GradingService.choices, default=GradingService.NONE
    )
    cert_number = models.CharField(max_length=64, blank=True, default="", db_index=True)
    grade = models.CharField(max_length=32, blank=True, default="")
    estimated_grade = models.CharField(max_length=32, blank=True, default="")
    estimated_grade_range = models.CharField(max_length=32, blank=True, default="")
    estimated_grade_rationale = models.TextField(blank=True, default="")
    grading_upside_usd = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    ai_confidence = models.FloatField(null=True, blank=True)
    ai_enrichment_pending = models.BooleanField(default=False, db_index=True)
    ai_enrichment_attempts = models.PositiveSmallIntegerField(default=0)
    ai_enrichment_last_error = models.TextField(blank=True, default="")
    ai_enqueued_at = models.DateTimeField(null=True, blank=True)
    serial_number = models.CharField(max_length=64, blank=True, default="", db_index=True)

    # Cost Basis & Disposition
    purchase_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    purchase_date = models.DateField(null=True, blank=True)
    vendor = models.CharField(max_length=120, blank=True, default="")
    sold_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sold_date = models.DateField(null=True, blank=True)

    # Cached Valuation (per unit; multiply by quantity for lot total)
    melt_value_unit = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    market_value_unit = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    market_value_low = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    market_value_high = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    valuation_source = models.CharField(
        max_length=20, choices=ValuationSource.choices, default=ValuationSource.MANUAL
    )
    valuation_confidence = models.CharField(
        max_length=12, choices=ValuationConfidence.choices, blank=True, default=""
    )
    collectibility_tier = models.CharField(
        max_length=24, choices=CollectibilityTier.choices, blank=True, default=""
    )
    hold_outlook = models.TextField(blank=True, default="")
    valuation_drivers = models.JSONField(default=list, blank=True)
    is_estimate = models.BooleanField(default=False)
    valued_at = models.DateTimeField(null=True, blank=True)

    # Numismatic & Physical Specifications
    mint_mark = models.CharField(max_length=16, blank=True, default="")
    mintage = models.PositiveBigIntegerField(null=True, blank=True)
    variety = models.CharField(max_length=120, blank=True, default="")
    composition = models.CharField(max_length=120, blank=True, default="")
    gross_weight_grams = models.DecimalField(
        max_digits=10, decimal_places=4, null=True, blank=True
    )
    diameter_mm = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    thickness_mm = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    edge_type = models.CharField(max_length=64, blank=True, default="")
    designer = models.CharField(max_length=120, blank=True, default="")
    catalog_numbers = models.JSONField(default=dict, blank=True)
    specs_provenance = models.JSONField(default=dict, blank=True)

    # Intake & Photo Verification Provenance
    intake_source = models.CharField(
        max_length=16, choices=IntakeSource.choices, default=IntakeSource.MANUAL
    )
    photo_verification_status = models.CharField(
        max_length=16,
        choices=PhotoVerificationStatus.choices,
        default=PhotoVerificationStatus.NONE,
    )
    photo_verification_notes = models.JSONField(default=list, blank=True)

    # Auto-Sort Taxonomy
    sort_category = models.CharField(
        max_length=16, choices=SortCategory.choices, blank=True, default=""
    )
    sort_subcategory = models.CharField(max_length=120, blank=True, default="", db_index=True)
    sort_override = models.BooleanField(default=False)
    sort_updated_at = models.DateTimeField(null=True, blank=True)

    tags = models.JSONField(default=list, blank=True)
    attributes = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "category"]),
            models.Index(fields=["workspace", "sort_category", "sort_subcategory"]),
            models.Index(fields=["workspace", "metal_type"]),
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["workspace", "-market_value_unit"]),
        ]

    def save(self, *args, **kwargs) -> None:
        self.fine_troy_oz = compute_fine_troy_oz(
            self.weight_value, self.weight_unit, self.purity, self.metal_type
        )
        super().save(*args, **kwargs)

    @property
    def total_melt_value(self) -> Decimal:
        return (self.melt_value_unit * self.quantity).quantize(Decimal("0.01"))

    @property
    def is_graded(self) -> bool:
        return (
            self.category == self.Category.SLAB
            or self.grading_service not in ("", self.GradingService.NONE)
        )

    @property
    def total_market_value(self) -> Decimal:
        return (self.market_value_unit * self.quantity).quantize(Decimal("0.01"))

    @property
    def collector_premium_total(self) -> Decimal:
        if self.metal_type == self.MetalType.NONE:
            return self.total_market_value
        return (self.total_market_value - self.total_melt_value).quantize(Decimal("0.01"))

    @property
    def collector_premium_pct(self) -> float | None:
        if self.metal_type == self.MetalType.NONE or self.total_melt_value <= Decimal("0.00"):
            return None
        pct = ((self.total_market_value - self.total_melt_value) / self.total_melt_value) * Decimal("100")
        return float(pct.quantize(Decimal("0.1")))

    @property
    def unrealized_gain_loss(self) -> Decimal | None:
        if self.purchase_price is None:
            return None
        return (self.total_market_value - self.purchase_price).quantize(Decimal("0.01"))

    def __str__(self) -> str:
        return f"{self.title} (x{self.quantity})"


def item_photo_upload_path(instance: ItemPhoto, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    return f"workspaces/{instance.workspace_id}/items/{instance.item_id}/{uuid.uuid4()}.{ext}"


class ItemPhoto(models.Model):
    """Multi-photo attachment for an item (obverse, reverse, slab label, assay, receipt)."""

    class Label(models.TextChoices):
        OBVERSE = "OBVERSE", "Obverse / Front"
        REVERSE = "REVERSE", "Reverse / Back"
        SLAB_LABEL = "SLAB_LABEL", "Slab Label"
        ASSAY = "ASSAY", "Assay / Packaging"
        RECEIPT = "RECEIPT", "Receipt"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="item_photos"
    )
    item = models.ForeignKey(CollectionItem, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to=item_photo_upload_path, max_length=255)
    label = models.CharField(max_length=16, choices=Label.choices, default=Label.OBVERSE)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    verification_status = models.CharField(
        max_length=16,
        choices=CollectionItem.PhotoVerificationStatus.choices,
        default=CollectionItem.PhotoVerificationStatus.NONE,
    )
    verification_notes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "sort_order", "created_at"]

    def __str__(self) -> str:
        return f"{self.item.title} [{self.label}]"
