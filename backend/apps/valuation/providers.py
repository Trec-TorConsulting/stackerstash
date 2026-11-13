from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

import httpx

from apps.catalog.models import AVDP_OZ_GRAMS, TROY_OZ_GRAMS

logger = logging.getLogger(__name__)

GOLD_API_SYMBOLS = {
    "GOLD": "XAU",
    "SILVER": "XAG",
    "PLATINUM": "XPT",
    "PALLADIUM": "XPD",
    "COPPER": "HG",
}

CERT_VERIFICATION_URLS = {
    "PCGS": "https://www.pcgs.com/cert/{cert}",
    "NGC": "https://www.ngccoin.com/certlookup/{cert}/",
    "PMG": "https://www.pmgnotes.com/certlookup/{cert}/",
    "PCGS_BANKNOTE": "https://www.pcgs.com/banknote/cert/{cert}",
    "CACG": "https://www.cacgrading.com/cert/{cert}",
    "ANACS": "https://www.anacs.com/Verify/CertVerification.aspx?cert={cert}",
}


def build_cert_verification_url(grading_service: str, cert_number: str) -> str | None:
    """Return the official third-party cert lookup URL if available."""
    cert = cert_number.strip()
    template = CERT_VERIFICATION_URLS.get(grading_service)
    if not cert or not template:
        return None
    return template.format(cert=cert)


def fetch_spot_prices_from_gold_api(timeout: float = 8.0) -> dict[str, Decimal]:
    """Fetch live spot prices from gold-api.com normalized to USD per troy ounce."""
    prices: dict[str, Decimal] = {}
    with httpx.Client(timeout=timeout) as client:
        for metal_type, symbol in GOLD_API_SYMBOLS.items():
            try:
                resp = client.get(f"https://api.gold-api.com/price/{symbol}")
                resp.raise_for_status()
                data = resp.json()
                raw_price = data.get("price")
                if raw_price is not None:
                    price = Decimal(str(raw_price))
                    unit = str(data.get("unit") or "").lower()
                    if unit == "lb" or (symbol == "HG" and unit not in {"oz", "ozt", "troy_oz"}):
                        # COMEX HG copper is quoted in USD/lb; normalize to USD/troy oz.
                        troy_oz_per_lb = (Decimal("16") * AVDP_OZ_GRAMS) / TROY_OZ_GRAMS
                        price = price / troy_oz_per_lb
                    prices[metal_type] = price.quantize(Decimal("0.0001"))
            except Exception as exc:
                logger.warning("Failed to fetch spot price for %s (%s): %s", metal_type, symbol, exc)
    return prices


def lookup_pcgs_cert(cert_number: str, pcgs_token: str, timeout: float = 10.0) -> dict[str, Any] | None:
    """Query PCGS Public API for cert details and price guide value when BYOK token is set."""
    if not cert_number or not pcgs_token:
        return None
    url = f"https://api.pcgs.com/publicapi/coindetails/GetCoinFactsByCertNo/{cert_number}"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                url,
                headers={"Authorization": f"bearer {pcgs_token}"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            price = data.get("PriceGuideValue") or data.get("PCGSPriceGuide")
            if price is not None and Decimal(str(price)) > 0:
                return {
                    "market_value": Decimal(str(price)).quantize(Decimal("0.01")),
                    "source": "PCGS",
                    "raw": data,
                }
    except Exception as exc:
        logger.warning("PCGS lookup failed for cert %s: %s", cert_number, exc)
    return None


def lookup_greysheet(
    title: str,
    api_key: str,
    api_token: str,
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query Greysheet CDN API for CPG retail/wholesale value when BYOK credentials exist."""
    if not title or not api_key or not api_token:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://api.greysheet.com/v1/prices/search",
                params={"q": title, "limit": 1},
                headers={"X-Api-Key": api_key, "Authorization": f"Bearer {api_token}"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            items = data.get("items") or data.get("results") or []
            if items:
                top = items[0]
                price = top.get("cpg_retail") or top.get("greysheet_bid") or top.get("price")
                if price is not None and Decimal(str(price)) > 0:
                    return {
                        "market_value": Decimal(str(price)).quantize(Decimal("0.01")),
                        "source": "GREYSHEET",
                        "raw": top,
                    }
    except Exception as exc:
        logger.warning("Greysheet lookup failed for %s: %s", title, exc)
    return None

