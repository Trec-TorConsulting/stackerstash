from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
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
            specs: dict[str, Any] = {}
            if data.get("Mintage"):
                try:
                    specs["mintage"] = int(str(data["Mintage"]).replace(",", ""))
                except ValueError:
                    pass
            if data.get("MintMark"):
                specs["mint_mark"] = str(data["MintMark"])[:16]
            if data.get("Designer"):
                specs["designer"] = str(data["Designer"])[:120]
            if data.get("Diameter"):
                try:
                    specs["diameter_mm"] = Decimal(str(data["Diameter"])).quantize(Decimal("0.01"))
                except Exception:
                    pass
            if data.get("Weight"):
                try:
                    specs["gross_weight_grams"] = Decimal(str(data["Weight"])).quantize(Decimal("0.0001"))
                except Exception:
                    pass
            if data.get("PCGSNo"):
                specs["catalog_numbers"] = {"PCGS": str(data["PCGSNo"])}
            if price is not None and Decimal(str(price)) > 0:
                return {
                    "market_value": Decimal(str(price)).quantize(Decimal("0.01")),
                    "source": "PCGS",
                    "specs": specs,
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


def lookup_cert_metadata(
    grading_service: str, cert_number: str, pcgs_token: str = "", timeout: float = 10.0
) -> dict[str, Any] | None:
    """Resolve cert data (PCGS API when token exists) or official verification link."""
    cert = cert_number.strip()
    if not cert or grading_service == "NONE":
        return None
    if grading_service == "PCGS" and pcgs_token:
        pcgs_res = lookup_pcgs_cert(cert, pcgs_token, timeout=timeout)
        if pcgs_res:
            return pcgs_res
    url = build_cert_verification_url(grading_service, cert)
    if not url:
        return None
    return {
        "source": grading_service,
        "cert_number": cert,
        "verification_url": url,
        "market_value": None,
        "raw": {"cert_number": cert, "verification_url": url},
    }


def lookup_numismedia(
    title: str,
    year: str = "",
    denomination: str = "",
    mint_mark: str = "",
    grade: str = "",
    api_key: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query NumisMedia FMV API for US coin fair market value when BYOK key is configured."""
    if not title or not api_key:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://api.numismedia.com/v1/fmv",
                params={
                    "q": title,
                    "year": year,
                    "denomination": denomination,
                    "mint_mark": mint_mark,
                    "grade": grade,
                },
                headers={"X-Api-Key": api_key},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            price = data.get("fmv") or data.get("price") or data.get("fair_market_value")
            if price is not None and Decimal(str(price)) > 0:
                return {
                    "market_value": Decimal(str(price)).quantize(Decimal("0.01")),
                    "source": "NUMISMEDIA",
                    "raw": data,
                }
    except Exception as exc:
        logger.warning("NumisMedia lookup failed for %s: %s", title, exc)
    return None


def lookup_numista_specs(
    title: str,
    year: str = "",
    country: str = "",
    denomination: str = "",
    api_key: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query Numista v3 API for coin specifications (mintage, weight, diameter, composition)."""
    if not title or not api_key:
        return None
    query = " ".join(part for part in [year, country, denomination, title] if part).strip()
    headers = {"Numista-API-Key": api_key}
    try:
        with httpx.Client(timeout=timeout) as client:
            search_resp = client.get(
                "https://api.numista.com/api/v3/types",
                params={"q": query, "count": 1},
                headers=headers,
            )
            if search_resp.status_code != 200:
                return None
            types = search_resp.json().get("types") or []
            if not types:
                return None
            type_id = types[0].get("id")
            if not type_id:
                return None
            detail_resp = client.get(
                f"https://api.numista.com/api/v3/types/{type_id}",
                headers=headers,
            )
            if detail_resp.status_code != 200:
                return None
            detail = detail_resp.json()
            specs: dict[str, Any] = {}
            comp = detail.get("composition") or {}
            if isinstance(comp, dict) and comp.get("text"):
                specs["composition"] = str(comp["text"])[:120]
            if detail.get("weight") is not None:
                specs["gross_weight_grams"] = Decimal(str(detail["weight"])).quantize(Decimal("0.0001"))
            if detail.get("size") is not None:
                specs["diameter_mm"] = Decimal(str(detail["size"])).quantize(Decimal("0.01"))
            if detail.get("thickness") is not None:
                specs["thickness_mm"] = Decimal(str(detail["thickness"])).quantize(Decimal("0.01"))
            edge = detail.get("edge") or {}
            if isinstance(edge, dict) and edge.get("description"):
                specs["edge_type"] = str(edge["description"])[:64]
            elif isinstance(edge, str) and edge:
                specs["edge_type"] = edge[:64]
            designers = detail.get("obverse", {}).get("engravers") or []
            if designers:
                specs["designer"] = ", ".join(str(d) for d in designers[:2])[:120]
            catalog_nums: dict[str, str] = {"Numista": str(type_id)}
            for ref in detail.get("references") or []:
                cat = ref.get("catalogue", {}).get("code")
                num = ref.get("number")
                if cat and num:
                    catalog_nums[str(cat)] = str(num)
            specs["catalog_numbers"] = catalog_nums
            if detail.get("mintage") is not None:
                try:
                    specs["mintage"] = int(detail["mintage"])
                except (TypeError, ValueError):
                    pass
            return {"specs": specs, "raw": detail}
    except Exception as exc:
        logger.warning("Numista lookup failed for %s: %s", title, exc)
    return None


def _trim_outliers(prices: list[Decimal]) -> list[Decimal]:
    """Remove top/bottom 10% extreme outliers when enough samples exist."""
    if len(prices) < 5:
        return prices
    ordered = sorted(prices)
    cut = max(1, len(ordered) // 10)
    return ordered[cut:-cut] or ordered


def _lookup_ebay_browse_active(
    client: httpx.Client,
    query: str,
    client_id: str,
    client_secret: str,
) -> dict[str, Any] | None:
    """Fallback to eBay Browse API active listings when Marketplace Insights is unavailable."""
    token_resp = client.post(
        "https://api.ebay.com/identity/v1/oauth2/token",
        auth=(client_id, client_secret),
        data={
            "grant_type": "client_credentials",
            "scope": "https://api.ebay.com/oauth/api_scope",
        },
    )
    if token_resp.status_code != 200:
        return None
    access_token = token_resp.json().get("access_token")
    if not access_token:
        return None
    search_resp = client.get(
        "https://api.ebay.com/buy/browse/v1/item_summary/search",
        params={"q": query, "limit": 15},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if search_resp.status_code != 200:
        return None
    summaries = search_resp.json().get("itemSummaries") or []
    raw_prices: list[Decimal] = []
    for item in summaries:
        val = (item.get("price") or {}).get("value")
        if val is not None:
            try:
                p = Decimal(str(val))
                if p > 0:
                    raw_prices.append(p)
            except Exception:
                continue
    trimmed = _trim_outliers(raw_prices)
    if not trimmed:
        return None
    med = Decimal(str(median([float(p) for p in trimmed]))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return {
        "source": "EBAY_ACTIVE_ASK",
        "is_ask": True,
        "low": min(trimmed).quantize(Decimal("0.01")),
        "median": med,
        "high": max(trimmed).quantize(Decimal("0.01")),
        "count": len(trimmed),
        "raw": {"sample_count": len(trimmed), "prices": [str(p) for p in trimmed[:10]]},
    }


def lookup_ebay_sold_comps(
    query: str,
    client_id: str = "",
    client_secret: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Fetch realized sold listings from eBay Marketplace Insights, falling back to Browse Active Ask."""
    if not query or not client_id or not client_secret:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            token_resp = client.post(
                "https://api.ebay.com/identity/v1/oauth2/token",
                auth=(client_id, client_secret),
                data={
                    "grant_type": "client_credentials",
                    "scope": "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights",
                },
            )
            if token_resp.status_code in {400, 401, 403}:
                return _lookup_ebay_browse_active(client, query, client_id, client_secret)
            if token_resp.status_code != 200:
                return None
            access_token = token_resp.json().get("access_token")
            if not access_token:
                return None
            search_resp = client.get(
                "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search",
                params={"q": query, "limit": 15},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if search_resp.status_code in {403, 404}:
                return _lookup_ebay_browse_active(client, query, client_id, client_secret)
            if search_resp.status_code != 200:
                return None
            data = search_resp.json()
            sales = data.get("itemSales") or []
            raw_prices: list[Decimal] = []
            for sale in sales:
                val = (sale.get("lastSoldPrice") or {}).get("value")
                if val is not None:
                    try:
                        p = Decimal(str(val))
                        if p > 0:
                            raw_prices.append(p)
                    except Exception:
                        continue
            trimmed = _trim_outliers(raw_prices)
            if not trimmed:
                return None
            med = Decimal(str(median([float(p) for p in trimmed]))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            return {
                "source": "COMPS",
                "is_ask": False,
                "low": min(trimmed).quantize(Decimal("0.01")),
                "median": med,
                "high": max(trimmed).quantize(Decimal("0.01")),
                "count": len(trimmed),
                "raw": {"sample_count": len(trimmed), "prices": [str(p) for p in trimmed[:10]]},
            }
    except Exception as exc:
        logger.warning("eBay comps lookup failed for %s: %s", query, exc)
    return None


BULLION_PREMIUM_BENCHMARKS: list[tuple[tuple[str, ...], str, Decimal, Decimal]] = [
    (("american silver eagle", "silver eagle", "ase"), "American Silver Eagle", Decimal("0.12"), Decimal("0.22")),
    (("maple leaf", "canadian maple"), "Canadian Maple Leaf", Decimal("0.07"), Decimal("0.14")),
    (("krugerrand",), "South African Krugerrand", Decimal("0.05"), Decimal("0.12")),
    (("britannia",), "Royal Mint Britannia", Decimal("0.07"), Decimal("0.14")),
    (("american gold eagle", "gold eagle", "age"), "American Gold Eagle", Decimal("0.05"), Decimal("0.10")),
    (("gold buffalo", "american buffalo"), "American Gold Buffalo", Decimal("0.05"), Decimal("0.10")),
    (("philharmonic",), "Austrian Philharmonic", Decimal("0.06"), Decimal("0.13")),
    (("libertad",), "Mexican Libertad", Decimal("0.18"), Decimal("0.35")),
]


def lookup_bullion_dealer_benchmark(
    title: str,
    metal_type: str,
    melt_value_unit: Decimal,
) -> dict[str, Any] | None:
    """Return typical retail dealer premium benchmark range for recognized bullion items."""
    if metal_type == "NONE" or not melt_value_unit or melt_value_unit <= Decimal("0.00"):
        return None
    lower = (title or "").lower()
    for keywords, label, low_pct, high_pct in BULLION_PREMIUM_BENCHMARKS:
        if any(k in lower for k in keywords):
            low = (melt_value_unit * (Decimal("1.00") + low_pct)).quantize(Decimal("0.01"))
            high = (melt_value_unit * (Decimal("1.00") + high_pct)).quantize(Decimal("0.01"))
            return {
                "label": label,
                "low_pct": float(low_pct * 100),
                "high_pct": float(high_pct * 100),
                "low_usd": str(low),
                "high_usd": str(high),
            }
    return None

