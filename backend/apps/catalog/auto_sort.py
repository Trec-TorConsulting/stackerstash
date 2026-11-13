from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass
from typing import Any

import httpx
from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import ProviderCredential
from apps.catalog.models import CollectionItem

logger = logging.getLogger(__name__)

ANCIENT_KEYWORDS = (
    "ancient",
    "roman",
    "rome",
    "greek",
    "greece",
    "byzantine",
    "celtic",
    "denarius",
    "antoninianus",
    "aureus",
    "solidus",
    "sestertius",
    "tetradrachm",
    "drachm",
    "obol",
    "stater",
    "sasanian",
    "parthian",
    "ptolemaic",
    "seleucid",
    "judaean",
    "prutah",
    "shekel",
    "carthaginian",
)

ANCIENT_YEAR_RE = re.compile(r"\b\d+\s*(?:bc|bce)\b", re.IGNORECASE)

PAPER_KEYWORDS = (
    "banknote",
    "bank note",
    "paper currency",
    "paper money",
    "silver certificate",
    "gold certificate",
    "federal reserve note",
    "united states note",
    "treasury note",
    "fractional currency",
    "dollar bill",
    "confederate",
    "notgeld",
    "assignat",
    "note",
)

BAR_KEYWORDS = ("bar", "ingot", "loaf", "kit kat", "combibar")
ROUND_KEYWORDS = ("round", "medallion", "medal")
COIN_KEYWORDS = (
    "coin",
    "dollar",
    "cent",
    "dime",
    "quarter",
    "nickel",
    "penny",
    "peso",
    "sovereign",
    "eagle",
    "maple",
    "libertad",
    "krugerrand",
    "britannia",
    "philharmonic",
    "panda",
    "kookaburra",
    "denarius",
    "tetradrachm",
    "franc",
    "mark",
    "shilling",
    "crown",
    "florin",
    "rupee",
    "yen",
    "yuan",
)

COUNTRY_ALIASES: dict[str, str] = {
    "us": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "usa": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "america": "United States",
    "mx": "Mexico",
    "mex": "Mexico",
    "mexico": "Mexico",
    "estados unidos mexicanos": "Mexico",
    "ca": "Canada",
    "can": "Canada",
    "canada": "Canada",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "gb": "United Kingdom",
    "great britain": "United Kingdom",
    "united kingdom": "United Kingdom",
    "england": "United Kingdom",
    "britain": "United Kingdom",
    "de": "Germany",
    "germany": "Germany",
    "deutsches reich": "Germany",
    "fr": "France",
    "france": "France",
    "ch": "Switzerland",
    "switzerland": "Switzerland",
    "cn": "China",
    "china": "China",
    "prc": "China",
    "au": "Australia",
    "australia": "Australia",
    "at": "Austria",
    "austria": "Austria",
    "za": "South Africa",
    "south africa": "South Africa",
    "jp": "Japan",
    "japan": "Japan",
    "ru": "Russia",
    "russia": "Russia",
    "ussr": "Russia",
    "soviet union": "Russia",
    "es": "Spain",
    "spain": "Spain",
    "it": "Italy",
    "italy": "Italy",
    "in": "India",
    "india": "India",
    "ie": "Ireland",
    "ireland": "Ireland",
    "nz": "New Zealand",
    "new zealand": "New Zealand",
    "ancient": "Ancient",
    "roman": "Ancient",
    "roman empire": "Ancient",
    "roman republic": "Ancient",
    "ancient greece": "Ancient",
    "ancient rome": "Ancient",
    "byzantine": "Ancient",
    "byzantine empire": "Ancient",
}

SERIES_COUNTRY_HINTS: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        (
            "american silver eagle",
            "american gold eagle",
            "silver eagle",
            "gold eagle",
            "morgan dollar",
            "peace dollar",
            "walking liberty",
            "franklin half",
            "kennedy half",
            "mercury dime",
            "roosevelt dime",
            "barber",
            "standing liberty",
            "washington quarter",
            "buffalo nickel",
            "jefferson nickel",
            "indian head",
            "lincoln cent",
            "wheat cent",
            "federal reserve note",
            "silver certificate",
            "gold certificate",
            "united states note",
            "us mint",
        ),
        "United States",
    ),
    (("libertad", "onza", "centenario", "casa de moneda", "banco de mexico", "mexican"), "Mexico"),
    (("maple leaf", "royal canadian mint"), "Canada"),
    (("britannia", "sovereign", "royal mint", "queen's beasts", "tudor beasts"), "United Kingdom"),
    (("krugerrand", "south african mint"), "South Africa"),
    (("kookaburra", "koala", "kangaroo", "lunar", "perth mint"), "Australia"),
    (("philharmonic", "wiener philharmoniker"), "Austria"),
    (("panda",), "China"),
)

REFINER_ALIASES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("geiger", "schloss guldengossa"), "Geiger Edelmetalle"),
    (("engelhard",), "Engelhard"),
    (("johnson matthey", "j.m.", "jm bullion bar"), "Johnson Matthey"),
    (("pamp", "pamp suisse", "fortuna"), "PAMP Suisse"),
    (("valcambi",), "Valcambi"),
    (("scottsdale",), "Scottsdale Mint"),
    (("sunshine mint", "sunshine minting", "smi"), "Sunshine Minting"),
    (("royal canadian mint", "rcm"), "Royal Canadian Mint"),
    (("perth mint",), "Perth Mint"),
    (("silvertowne", "silver towne"), "SilverTowne"),
    (("asahi",), "Asahi Refining"),
    (("monarch precious", "monarch"), "Monarch Precious Metals"),
    (("germania mint", "germania"), "Germania Mint"),
    (("pioneer metals", "pioneer"), "Pioneer Metals"),
    (("nadir",), "Nadir Metal Rafineri"),
    (("argor", "heraeus"), "Argor-Heraeus"),
    (("a-mark", "amark"), "A-Mark"),
    (("generic", "secondary market"), "Generic / Secondary Market"),
)

POURED_KEYWORDS = ("hand poured", "hand-poured", "poured", "cast bar", "artisan pour")


@dataclass(frozen=True)
class SortResult:
    sort_category: str
    sort_subcategory: str


def _contains_any(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(n in haystack for n in needles)


def _determine_sort_category(item: CollectionItem) -> str:
    cat = (item.category or "").upper()
    if cat in (
        CollectionItem.SortCategory.COIN,
        CollectionItem.SortCategory.PAPER,
        CollectionItem.SortCategory.BAR,
        CollectionItem.SortCategory.ROUND,
    ):
        return cat

    grading = (item.grading_service or "").upper()
    if cat == CollectionItem.Category.SLAB and grading in (
        CollectionItem.GradingService.PMG,
        CollectionItem.GradingService.PCGS_BANKNOTE,
    ):
        return CollectionItem.SortCategory.PAPER

    text = " ".join(
        filter(None, [item.title, item.denomination, item.series, item.notes])
    ).lower()

    if _contains_any(text, PAPER_KEYWORDS):
        return CollectionItem.SortCategory.PAPER
    if _contains_any(text, BAR_KEYWORDS):
        return CollectionItem.SortCategory.BAR
    if _contains_any(text, ROUND_KEYWORDS):
        return CollectionItem.SortCategory.ROUND

    if cat in (CollectionItem.Category.SLAB, CollectionItem.Category.FLIPPER):
        return CollectionItem.SortCategory.COIN

    if _contains_any(text, COIN_KEYWORDS) or grading in (
        CollectionItem.GradingService.PCGS,
        CollectionItem.GradingService.NGC,
        CollectionItem.GradingService.CACG,
        CollectionItem.GradingService.ANACS,
        CollectionItem.GradingService.ICG,
    ):
        return CollectionItem.SortCategory.COIN

    return CollectionItem.SortCategory.OTHER


def _normalize_country_or_era(item: CollectionItem) -> str:
    raw_country = (item.country or "").strip()
    combined = " ".join(
        filter(None, [raw_country, item.title, item.series, item.denomination, item.year])
    ).lower()

    if _contains_any(combined, ANCIENT_KEYWORDS) or ANCIENT_YEAR_RE.search(item.year or ""):
        return "Ancient"

    if raw_country:
        key = raw_country.lower().strip()
        if key in COUNTRY_ALIASES:
            return COUNTRY_ALIASES[key]
        return raw_country.title() if raw_country.islower() or raw_country.isupper() else raw_country

    for hints, country_name in SERIES_COUNTRY_HINTS:
        if _contains_any(combined, hints):
            return country_name

    return "Uncategorized"


def _normalize_mint_or_pourer(item: CollectionItem) -> str:
    raw_mint = (item.mint_or_refiner or "").strip()
    combined = " ".join(filter(None, [raw_mint, item.title, item.series])).lower()

    for aliases, canonical in REFINER_ALIASES:
        if _contains_any(combined, aliases):
            return canonical

    if raw_mint:
        return raw_mint.title() if raw_mint.islower() or raw_mint.isupper() else raw_mint

    if _contains_any(combined, POURED_KEYWORDS):
        return "Hand-Poured"

    return "Uncategorized"


def classify_item_deterministic(item: CollectionItem) -> SortResult:
    """Classify an item into canonical sort_category and sort_subcategory using local rules."""
    sort_cat = _determine_sort_category(item)
    if sort_cat in (CollectionItem.SortCategory.COIN, CollectionItem.SortCategory.PAPER):
        subcat = _normalize_country_or_era(item)
    elif sort_cat in (CollectionItem.SortCategory.BAR, CollectionItem.SortCategory.ROUND):
        subcat = _normalize_mint_or_pourer(item)
    else:
        subcat = _normalize_country_or_era(item)
        if subcat == "Uncategorized":
            subcat = _normalize_mint_or_pourer(item)
    return SortResult(sort_category=sort_cat, sort_subcategory=subcat)


def _get_workspace_ollama_config(workspace_id: Any) -> tuple[str | None, str]:
    creds = {
        c.provider: c.get_secret().strip()
        for c in ProviderCredential.objects.filter(
            workspace_id=workspace_id,
            provider__in=[
                ProviderCredential.Provider.OLLAMA_URL,
                ProviderCredential.Provider.OLLAMA_MODEL,
            ],
        )
    }
    url = creds.get(ProviderCredential.Provider.OLLAMA_URL, "").rstrip("/")
    model = creds.get(ProviderCredential.Provider.OLLAMA_MODEL, "") or "llama3.2"
    return (url or None, model)


def _classify_with_local_ollama(
    item: CollectionItem, base_url: str, model: str, sort_cat: str
) -> str | None:
    """Ask a locally hosted Ollama instance for country/era or mint/pourer when rules yield Uncategorized."""
    target_kind = (
        "country or 'Ancient'"
        if sort_cat in (CollectionItem.SortCategory.COIN, CollectionItem.SortCategory.PAPER)
        else "mint, refiner, or pourer name (or 'Hand-Poured')"
    )
    prompt = (
        f"Classify this collectible item's {target_kind}. "
        "Reply with ONLY a JSON object: {\"subcategory\": \"<value or Uncategorized>\"}.\n"
        f"Title: {item.title}\n"
        f"Category: {item.category}\n"
        f"Country: {item.country}\n"
        f"Mint/Refiner: {item.mint_or_refiner}\n"
        f"Series: {item.series}\n"
        f"Year: {item.year}\n"
        f"Denomination: {item.denomination}"
    )
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                f"{base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "").strip()
            parsed = json.loads(raw)
            sub = str(parsed.get("subcategory", "")).strip()
            if sub and sub.lower() not in ("unknown", "none", "n/a", "uncategorized"):
                return sub[:120]
    except Exception as exc:
        logger.debug("Local Ollama auto-sort fallback skipped/failed for item %s: %s", item.id, exc)
    return None


def classify_and_save_item(item_id: Any, *, use_ollama: bool = True) -> bool:
    """Run auto-sort for a single item if unpinned, returning True if updated."""
    item = CollectionItem.objects.select_related("workspace").filter(id=item_id).first()
    if not item or item.sort_override:
        return False

    result = classify_item_deterministic(item)
    subcat = result.sort_subcategory

    if subcat == "Uncategorized" and use_ollama:
        ollama_url, ollama_model = _get_workspace_ollama_config(item.workspace_id)
        if ollama_url:
            ollama_sub = _classify_with_local_ollama(
                item, ollama_url, ollama_model, result.sort_category
            )
            if ollama_sub:
                subcat = ollama_sub

    item.sort_category = result.sort_category
    item.sort_subcategory = subcat
    item.sort_updated_at = timezone.now()
    item.save(update_fields=["sort_category", "sort_subcategory", "sort_updated_at", "updated_at"])
    return True


@shared_task(name="catalog.classify_item_task")
def classify_item_task(item_id: str) -> bool:
    return classify_and_save_item(item_id)


@shared_task(name="catalog.resort_workspace_task")
def resort_workspace_task(workspace_id: str) -> int:
    item_ids = list(
        CollectionItem.objects.filter(workspace_id=workspace_id, sort_override=False).values_list(
            "id", flat=True
        )
    )
    updated = 0
    for iid in item_ids:
        if classify_and_save_item(iid, use_ollama=False):
            updated += 1
    return updated


def _dispatch_background(fn, *args) -> None:
    """Run via Celery if a broker is reachable, else fall back to a daemon thread."""
    try:
        from django.conf import settings

        broker = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker and not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            # In local dev without Redis running, fall back cleanly to thread
            fn.delay(*args)
            return
    except Exception:
        pass

    t = threading.Thread(target=fn, args=args, daemon=True)
    t.start()


def enqueue_item_auto_sort(item: CollectionItem, *, force: bool = False) -> None:
    """Schedule background auto-sort for an item if workspace allows and item is unpinned."""
    if item.sort_override:
        return
    if not force and not getattr(item.workspace, "auto_sort_enabled", True):
        return

    item_id = str(item.id)
    transaction.on_commit(lambda: _dispatch_background(classify_item_task, item_id))


def enqueue_workspace_resort(workspace_id: Any) -> int:
    """Schedule background re-sort for all unpinned items in a workspace. Returns count queued."""
    count = CollectionItem.objects.filter(
        workspace_id=workspace_id, sort_override=False
    ).count()
    ws_id = str(workspace_id)
    transaction.on_commit(lambda: _dispatch_background(resort_workspace_task, ws_id))
    return count
