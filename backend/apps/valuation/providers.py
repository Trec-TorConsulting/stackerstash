from __future__ import annotations

import hashlib
import logging
import re
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Any

import httpx

from apps.catalog.models import AVDP_OZ_GRAMS, TROY_OZ_GRAMS
from apps.catalog.reference_data.cert_patterns import (
    build_cert_verification_url,
)

logger = logging.getLogger(__name__)

GOLD_API_SYMBOLS = {
    "GOLD": "XAU",
    "SILVER": "XAG",
    "PLATINUM": "XPT",
    "PALLADIUM": "XPD",
    "COPPER": "HG",
}


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


def _hydrate_cached_specs(specs: dict[str, Any]) -> dict[str, Any]:
    out = dict(specs or {})
    for dec_key in ("diameter_mm", "thickness_mm", "gross_weight_grams"):
        if dec_key in out and out[dec_key] is not None and not isinstance(out[dec_key], Decimal):
            try:
                out[dec_key] = Decimal(str(out[dec_key]))
            except Exception as exc:
                logger.debug("Invalid cached decimal %s: %s", dec_key, exc)
    return out


def _serialize_specs_for_cache(specs: dict[str, Any]) -> dict[str, Any]:
    return {
        k: (str(v) if isinstance(v, Decimal) else v)
        for k, v in (specs or {}).items()
    }


def lookup_pcgs_cert(
    cert_number: str,
    pcgs_token: str,
    timeout: float = 10.0,
    workspace: Any = None,
) -> dict[str, Any] | None:
    """Query PCGS Public API for cert details and price guide value when BYOK token is set."""
    if not cert_number or not pcgs_token:
        return None
    from apps.vision.cache import lookup_cert_cache, store_cert_cache

    cached = lookup_cert_cache("PCGS", cert_number, workspace=workspace)
    if cached and cached.get("market_value"):
        return {
            "market_value": Decimal(str(cached["market_value"])),
            "source": cached.get("source") or "PCGS",
            "specs": _hydrate_cached_specs(cached.get("specs") or {}),
            "raw": cached.get("raw") or {},
        }

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
                except Exception as exc:
                    logger.debug("Invalid PCGS diameter %r: %s", data.get("Diameter"), exc)
            if data.get("Weight"):
                try:
                    specs["gross_weight_grams"] = Decimal(str(data["Weight"])).quantize(Decimal("0.0001"))
                except Exception as exc:
                    logger.debug("Invalid PCGS weight %r: %s", data.get("Weight"), exc)
            if data.get("PCGSNo"):
                specs["catalog_numbers"] = {"PCGS": str(data["PCGSNo"])}
            if price is not None and Decimal(str(price)) > 0:
                mv = Decimal(str(price)).quantize(Decimal("0.01"))
                store_cert_cache(
                    "PCGS",
                    cert_number,
                    {
                        "market_value": str(mv),
                        "source": "PCGS",
                        "specs": _serialize_specs_for_cache(specs),
                        "raw": data,
                    },
                    source="PCGS",
                    workspace=workspace,
                )
                return {
                    "market_value": mv,
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
    grading_service: str,
    cert_number: str,
    pcgs_token: str | None = None,
    psa_token: str | None = None,
    timeout: float = 10.0,
    workspace: Any = None,
) -> dict[str, Any] | None:
    """Resolve cert data (PCGS/PSA API when token exists) or official verification link."""
    cert = cert_number.strip()
    if not cert or grading_service == "NONE":
        return None
    if grading_service == "PCGS" and pcgs_token:
        pcgs_res = lookup_pcgs_cert(cert, pcgs_token, timeout=timeout, workspace=workspace)
        if pcgs_res:
            return pcgs_res
    if grading_service == "PSA" and psa_token:
        psa_res = lookup_psa_cert(cert, psa_token, timeout=timeout)
        if psa_res:
            return psa_res
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
    workspace: Any = None,
) -> dict[str, Any] | None:
    """Query Numista v3 API for coin specifications (mintage, weight, diameter, composition)."""
    if not title or not api_key:
        return None
    from apps.vision.cache import lookup_cert_cache, store_cert_cache

    query = " ".join(part for part in [year, country, denomination, title] if part).strip()
    cache_key = hashlib.sha256(query.lower().encode("utf-8")).hexdigest()
    cached = lookup_cert_cache("NUMISTA", cache_key, workspace=workspace)
    if cached and isinstance(cached.get("specs"), dict):
        return {
            "specs": _hydrate_cached_specs(cached["specs"]),
            "raw": cached.get("raw") or {},
        }

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
            store_cert_cache(
                "NUMISTA",
                cache_key,
                {"specs": _serialize_specs_for_cache(specs), "raw": detail},
                source="NUMISTA",
                workspace=workspace,
            )
            return {"specs": specs, "raw": detail}
    except Exception as exc:
        logger.warning("Numista lookup failed for %s: %s", title, exc)
    return None


_COMP_EXCLUDE_TERMS = (
    "lot of",
    "bulk",
    "replica",
    "reproduction",
    "copy",
    "fake",
    "counterfeit",
    "empty box",
    "empty slab",
    "empty holder",
    "box only",
    "proxy",
)


def _filter_comp_listings(
    listings: list[dict[str, Any]],
    query: str = "",
    price_key: str = "price",
) -> list[Decimal]:
    """Filter out noisy comp listings (lots, replicas, empty boxes) and extract positive prices."""
    q_lower = (query or "").lower()
    active_excludes = [term for term in _COMP_EXCLUDE_TERMS if term not in q_lower]
    prices: list[Decimal] = []
    for entry in listings:
        title = str(entry.get("title") or "").lower()
        if title and any(term in title for term in active_excludes):
            continue
        val = (entry.get(price_key) or {}).get("value")
        if val is not None:
            try:
                p = Decimal(str(val))
                if p > 0:
                    prices.append(p)
            except Exception as exc:
                logger.debug("Invalid eBay listing price %r: %s", val, exc)
                continue
    return prices


def _trim_outliers(prices: list[Decimal]) -> list[Decimal]:
    """Remove top/bottom 10% extreme outliers when enough samples exist."""
    if len(prices) < 5:
        return prices
    ordered = sorted(prices)
    cut = max(1, len(ordered) // 10)
    return ordered[cut:-cut] or ordered


def _fetch_ebay_sold_raw(
    client: httpx.Client,
    query: str,
    client_id: str,
    client_secret: str,
) -> list[Decimal] | None:
    """Query eBay Marketplace Insights for realized sold item sales."""
    try:
        token_resp = client.post(
            "https://api.ebay.com/identity/v1/oauth2/token",
            auth=(client_id, client_secret),
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights",
            },
        )
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
        if search_resp.status_code != 200:
            return None
        sales = search_resp.json().get("itemSales") or []
        return _filter_comp_listings(sales, query=query, price_key="lastSoldPrice")
    except Exception as exc:
        logger.warning("eBay sold comps fetch failed for %s: %s", query, exc)
        return None


def _fetch_ebay_active_raw(
    client: httpx.Client,
    query: str,
    client_id: str,
    client_secret: str,
) -> list[Decimal] | None:
    """Query eBay Browse API for active asking item summaries."""
    try:
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
        return _filter_comp_listings(summaries, query=query, price_key="price")
    except Exception as exc:
        logger.warning("eBay active asking fetch failed for %s: %s", query, exc)
        return None


def _lookup_ebay_browse_active(
    client: httpx.Client,
    query: str,
    client_id: str,
    client_secret: str,
) -> dict[str, Any] | None:
    """Fallback to eBay Browse API active listings when Marketplace Insights is unavailable."""
    raw_prices = _fetch_ebay_active_raw(client, query, client_id, client_secret)
    trimmed = _trim_outliers(raw_prices) if raw_prices else []
    if not trimmed:
        return None
    from django.conf import settings

    discount = Decimal(str(getattr(settings, "EBAY_ACTIVE_ASK_DISCOUNT", "0.85")))
    ask_mean = (sum(trimmed) / Decimal(str(len(trimmed)))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    med = (
        Decimal(str(median([float(p) for p in trimmed]))) * discount
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "source": "EBAY_ACTIVE_ASK",
        "is_ask": True,
        "is_blended": False,
        "value": med,
        "low": (min(trimmed) * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "median": med,
        "high": (max(trimmed) * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "count": len(trimmed),
        "sold": None,
        "active_ask": {
            "count": len(trimmed),
            "low": min(trimmed).quantize(Decimal("0.01")),
            "high": max(trimmed).quantize(Decimal("0.01")),
            "mean": ask_mean,
        },
        "raw": {
            "sample_count": len(trimmed),
            "is_blended": False,
            "ask_discount_factor": str(discount),
            "prices": [str(p) for p in trimmed[:10]],
        },
    }


def lookup_ebay_market_comps(
    query: str,
    client_id: str | None = None,
    client_secret: str | None = None,
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Fetch realized sold listings and active asking listings in parallel and synthesize market comps."""
    if not query or not client_id or not client_secret:
        return None

    from concurrent.futures import ThreadPoolExecutor

    sold_raw: list[Decimal] | None = None
    active_raw: list[Decimal] | None = None

    def _do_sold() -> list[Decimal] | None:
        with httpx.Client(timeout=timeout) as client:
            return _fetch_ebay_sold_raw(client, query, client_id, client_secret)

    def _do_active() -> list[Decimal] | None:
        with httpx.Client(timeout=timeout) as client:
            return _fetch_ebay_active_raw(client, query, client_id, client_secret)

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_sold = executor.submit(_do_sold)
            fut_active = executor.submit(_do_active)
            sold_raw = fut_sold.result()
            active_raw = fut_active.result()
    except Exception as exc:
        logger.warning("eBay parallel comps lookup failed for %s: %s", query, exc)
        return None

    trimmed_sold = _trim_outliers(sold_raw) if sold_raw else []
    trimmed_ask = _trim_outliers(active_raw) if active_raw else []

    if trimmed_sold and trimmed_ask:
        sold_med = Decimal(str(median([float(p) for p in trimmed_sold]))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        sold_low = min(trimmed_sold).quantize(Decimal("0.01"))
        sold_high = max(trimmed_sold).quantize(Decimal("0.01"))

        ask_mean = (sum(trimmed_ask) / Decimal(str(len(trimmed_ask)))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        ask_low = min(trimmed_ask).quantize(Decimal("0.01"))
        ask_high = max(trimmed_ask).quantize(Decimal("0.01"))

        blended_val = ((sold_med + ask_mean) / Decimal("2")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        return {
            "source": "COMPS",
            "is_blended": True,
            "is_ask": False,
            "value": blended_val,
            "median": blended_val,
            "low": min(sold_low, ask_low),
            "high": max(sold_high, ask_high),
            "count": len(trimmed_sold) + len(trimmed_ask),
            "sold": {
                "count": len(trimmed_sold),
                "low": sold_low,
                "high": sold_high,
                "median": sold_med,
            },
            "active_ask": {
                "count": len(trimmed_ask),
                "low": ask_low,
                "high": ask_high,
                "mean": ask_mean,
            },
            "raw": {
                "sample_count": len(trimmed_sold) + len(trimmed_ask),
                "is_blended": True,
                "sold": {
                    "count": len(trimmed_sold),
                    "low": str(sold_low),
                    "high": str(sold_high),
                    "median": str(sold_med),
                },
                "active_ask": {
                    "count": len(trimmed_ask),
                    "low": str(ask_low),
                    "high": str(ask_high),
                    "mean": str(ask_mean),
                },
                "prices": [str(p) for p in trimmed_sold[:5]] + [str(p) for p in trimmed_ask[:5]],
            },
        }

    if trimmed_sold:
        sold_med = Decimal(str(median([float(p) for p in trimmed_sold]))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        sold_low = min(trimmed_sold).quantize(Decimal("0.01"))
        sold_high = max(trimmed_sold).quantize(Decimal("0.01"))
        return {
            "source": "COMPS",
            "is_blended": False,
            "is_ask": False,
            "value": sold_med,
            "median": sold_med,
            "low": sold_low,
            "high": sold_high,
            "count": len(trimmed_sold),
            "sold": {
                "count": len(trimmed_sold),
                "low": sold_low,
                "high": sold_high,
                "median": sold_med,
            },
            "active_ask": None,
            "raw": {
                "sample_count": len(trimmed_sold),
                "is_blended": False,
                "prices": [str(p) for p in trimmed_sold[:10]],
            },
        }

    if trimmed_ask:
        from django.conf import settings

        discount = Decimal(str(getattr(settings, "EBAY_ACTIVE_ASK_DISCOUNT", "0.85")))
        ask_mean = (sum(trimmed_ask) / Decimal(str(len(trimmed_ask)))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        ask_med = Decimal(str(median([float(p) for p in trimmed_ask])))
        discounted_med = (ask_med * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return {
            "source": "EBAY_ACTIVE_ASK",
            "is_blended": False,
            "is_ask": True,
            "value": discounted_med,
            "median": discounted_med,
            "low": (min(trimmed_ask) * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            "high": (max(trimmed_ask) * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            "count": len(trimmed_ask),
            "sold": None,
            "active_ask": {
                "count": len(trimmed_ask),
                "low": min(trimmed_ask).quantize(Decimal("0.01")),
                "high": max(trimmed_ask).quantize(Decimal("0.01")),
                "mean": ask_mean,
            },
            "raw": {
                "sample_count": len(trimmed_ask),
                "is_blended": False,
                "ask_discount_factor": str(discount),
                "prices": [str(p) for p in trimmed_ask[:10]],
            },
        }

    return None


lookup_ebay_sold_comps = lookup_ebay_market_comps


def lookup_zero_key_public_comps(
    query: str,
    timeout: float = 3.0,
) -> dict[str, Any] | None:
    """Lightweight zero-key secondary market comps query with browser headers and strict timeout."""
    if not query or not query.strip():
        return None

    clean_q = re.sub(r"[^\w\s\-\.]", " ", query).strip()
    if not clean_q:
        return None

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    url = "https://www.ebay.com/sch/i.html"
    params = {
        "_nkw": clean_q,
        "_sacat": "0",
        "LH_Complete": "1",
        "LH_Sold": "1",
        "_sop": "13",
    }

    try:
        with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
            resp = client.get(url, params=params)
            if resp.status_code in {403, 429, 503}:
                logger.info("Zero-key comps throttled (%s) for '%s'", resp.status_code, clean_q)
                return None
            if resp.status_code != 200:
                return None
            html = resp.text
    except Exception as exc:
        logger.info("Zero-key comps request failed for '%s': %s", clean_q, exc)
        return None

    price_matches = re.findall(r'class="s-item__price"[^>]*>[\s\n]*\$([0-9,]+(?:\.[0-9]{2})?)', html)
    if not price_matches:
        price_matches = re.findall(r'\$([0-9,]+(?:\.[0-9]{2})?)', html)

    raw_prices: list[Decimal] = []
    for raw_p in price_matches:
        val = Decimal(raw_p.replace(",", ""))
        if Decimal("1.00") <= val <= Decimal("500000.00"):
            raw_prices.append(val)

    trimmed = _trim_outliers(raw_prices) if raw_prices else []
    if not trimmed:
        return None

    med = Decimal(str(median([float(p) for p in trimmed]))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    low_val = min(trimmed).quantize(Decimal("0.01"))
    high_val = max(trimmed).quantize(Decimal("0.01"))

    return {
        "source": "ZERO_KEY_COMPS",
        "is_blended": False,
        "is_ask": False,
        "value": med,
        "median": med,
        "low": low_val,
        "high": high_val,
        "count": len(trimmed),
        "sold": {
            "count": len(trimmed),
            "low": low_val,
            "high": high_val,
            "median": med,
        },
        "active_ask": None,
        "raw": {
            "sample_count": len(trimmed),
            "is_blended": False,
            "tier": "ZERO_KEY",
            "prices": [str(p) for p in trimmed[:10]],
        },
    }


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


def lookup_goldback_exchange_benchmark(
    title: str,
    series: str,
    denomination: str,
    melt_value_unit: Decimal,
) -> dict[str, Any] | None:
    """
    Return the Goldback Official Exchange Rate benchmark band (~1.95x to 2.10x
    24K gold melt value, reflecting Aurum polymer-foil manufacturing & parity).
    """
    from apps.catalog.goldback import is_goldback_text, parse_goldback_denomination

    if not is_goldback_text(title, series, denomination):
        return None
    if not melt_value_unit or melt_value_unit <= Decimal("0.00"):
        return None

    denom = parse_goldback_denomination(denomination, title)
    low = (melt_value_unit * Decimal("1.95")).quantize(Decimal("0.01"))
    mid = (melt_value_unit * Decimal("2.02")).quantize(Decimal("0.01"))
    high = (melt_value_unit * Decimal("2.10")).quantize(Decimal("0.01"))
    return {
        "denomination": denom,
        "low_usd": str(low),
        "mid_usd": str(mid),
        "high_usd": str(high),
    }


def _card_cache_key(prefix: str, *parts: str) -> str:
    joined = "|".join(str(p or "").strip().lower() for p in parts)
    return f"card_ref:{prefix}:{hashlib.sha256(joined.encode('utf-8')).hexdigest()[:24]}"


def lookup_psa_cert(
    cert_number: str, psa_token: str, timeout: float = 10.0
) -> dict[str, Any] | None:
    """Query PSA Public Cert API when PSA_API_TOKEN is configured."""
    cert = cert_number.strip()
    if not cert or not psa_token:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("psa_cert", cert)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    url = f"https://api.psacard.com/publicapi/cert/GetByCertNumber/{cert}"
    headers = {"Authorization": f"bearer {psa_token}", "Accept": "application/json"}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        psa_cert = data.get("PSACert") or data
        if not isinstance(psa_cert, dict) or not psa_cert.get("CertNumber"):
            cache.set(cache_key, False, timeout=3600)
            return None
        subject = str(psa_cert.get("Subject") or "").strip()
        brand = str(psa_cert.get("Brand") or "").strip()
        year = str(psa_cert.get("Year") or "").strip()
        card_num = str(psa_cert.get("CardNumber") or "").strip()
        grade_desc = str(psa_cert.get("GradeDescription") or psa_cert.get("CardGrade") or "").strip()
        pop = psa_cert.get("TotalPopulation")
        pop_higher = psa_cert.get("PopulationHigher")
        spec_id = psa_cert.get("SpecID")
        label_type = str(psa_cert.get("LabelType") or "").strip()
        qualifier = str(psa_cert.get("Qualifier") or "").strip()
        res = {
            "source": "PSA",
            "cert_number": cert,
            "verification_url": build_cert_verification_url("PSA", cert),
            "market_value": None,
            "grade": grade_desc,
            "specs": {
                "set_name": brand,
                "card_number": card_num,
                "year": year,
                "title": " ".join(p for p in [year, brand, subject, f"#{card_num}" if card_num else ""] if p),
                "psa_spec_id": spec_id,
                "total_population": pop,
                "population_higher": pop_higher,
                "psa_pop": pop,
                "psa_pop_higher": pop_higher,
                **({"psa_label_type": label_type} if label_type else {}),
                **({"psa_qualifier": qualifier} if qualifier else {}),
            },
            "raw": psa_cert,
        }
        cache.set(cache_key, res, timeout=86400)
        return res
    except Exception as exc:
        logger.warning("PSA cert lookup failed for %s: %s", cert, exc)
        return None


def _select_pokemon_tcg_price(prices: dict[str, Any], card_finish: str = "") -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    if not isinstance(prices, dict) or not prices:
        return None, None, None
    finish_low = card_finish.strip().lower()
    preferred_keys: list[str] = []
    if "1st" in finish_low:
        preferred_keys.extend(["1stEditionHolofoil", "1stEditionNormal"])
    if "reverse" in finish_low:
        preferred_keys.append("reverseHolofoil")
    if "holo" in finish_low or "foil" in finish_low:
        preferred_keys.append("holofoil")
    preferred_keys.extend(["holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil", "unlimitedHolofoil"])

    chosen: dict[str, Any] | None = None
    for key in preferred_keys:
        if isinstance(prices.get(key), dict) and prices[key].get("market"):
            chosen = prices[key]
            break
    if not chosen:
        for val in prices.values():
            if isinstance(val, dict) and (val.get("market") or val.get("mid")):
                chosen = val
                break
    if not chosen:
        return None, None, None

    def _to_dec(v: Any) -> Decimal | None:
        if v is None:
            return None
        try:
            d = Decimal(str(v)).quantize(Decimal("0.01"))
            return d if d > 0 else None
        except Exception:
            return None

    market = _to_dec(chosen.get("market") or chosen.get("mid"))
    low = _to_dec(chosen.get("low"))
    high = _to_dec(chosen.get("high"))
    return market, low, high


def lookup_pokemon_tcg_card(
    title: str,
    set_name: str = "",
    card_number: str = "",
    card_finish: str = "",
    api_key: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query Pokémon TCG API (zero-key or optional X-Api-Key) for card specs and TCGplayer prices."""
    if not title:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("pokemon_tcg", title, set_name, card_number, card_finish)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    clean_num = card_number.split("/")[0].strip() if card_number else ""
    query_parts = [f'name:"{title.strip()}"']
    if clean_num:
        query_parts.append(f'number:"{clean_num}"')
    if set_name:
        query_parts.append(f'set.name:"{set_name.strip()}"')

    headers: dict[str, str] = {"Accept": "application/json"}
    if api_key:
        headers["X-Api-Key"] = api_key

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://api.pokemontcg.io/v2/cards",
                params={"q": " ".join(query_parts), "pageSize": 5},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        cards = data.get("data") or []
        if not cards and set_name:
            # Retry without strict set.name filter
            fallback_q = " ".join(query_parts[:2])
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(
                    "https://api.pokemontcg.io/v2/cards",
                    params={"q": fallback_q, "pageSize": 5},
                    headers=headers,
                )
                resp.raise_for_status()
                cards = (resp.json() or {}).get("data") or []
        if not cards:
            cache.set(cache_key, False, timeout=3600)
            return None

        card = cards[0]
        set_obj = card.get("set") or {}
        tcgplayer = card.get("tcgplayer") or {}
        market, low, high = _select_pokemon_tcg_price(tcgplayer.get("prices") or {}, card_finish)
        total_cards = set_obj.get("printedTotal") or set_obj.get("total")
        num_str = str(card.get("number") or "")
        full_num = f"{num_str}/{total_cards}" if num_str and total_cards else num_str

        res = {
            "source": "POKEMON_TCG",
            "market_value": str(market) if market is not None else None,
            "low_usd": str(low) if low is not None else None,
            "high_usd": str(high) if high is not None else None,
            "specs": {
                "card_game": "Pokémon",
                "set_name": str(set_obj.get("name") or ""),
                "set_code": str(set_obj.get("ptcgoCode") or set_obj.get("id") or ""),
                "card_number": full_num,
                "rarity": str(card.get("rarity") or ""),
                "artist": str(card.get("artist") or ""),
            },
            "catalog_numbers": {
                "pokemon_tcg_id": str(card.get("id") or ""),
                **({"tcgplayer_url": str(tcgplayer["url"])} if tcgplayer.get("url") else {}),
            },
            "raw": {"id": card.get("id"), "name": card.get("name"), "tcgplayer": tcgplayer},
        }
        cache.set(cache_key, res, timeout=43200)
        return res
    except Exception as exc:
        logger.warning("Pokémon TCG lookup failed for %r: %s", title, exc)
        return None


def lookup_scryfall_card(
    title: str,
    set_code: str = "",
    card_number: str = "",
    card_finish: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query Scryfall zero-key API for Magic: The Gathering card metadata and USD prices."""
    if not title:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("scryfall", title, set_code, card_number, card_finish)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    params: dict[str, str] = {"fuzzy": title.strip()}
    if set_code:
        params["set"] = set_code.strip().lower()

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://api.scryfall.com/cards/named",
                params=params,
                headers={"Accept": "application/json", "User-Agent": "StackersStash/1.0"},
            )
            resp.raise_for_status()
            card = resp.json()
        if not isinstance(card, dict) or card.get("object") == "error":
            cache.set(cache_key, False, timeout=3600)
            return None

        prices = card.get("prices") or {}
        finish_low = card_finish.strip().lower()
        if "etched" in finish_low and prices.get("usd_etched"):
            raw_price = prices.get("usd_etched")
        elif ("foil" in finish_low or "holo" in finish_low) and prices.get("usd_foil"):
            raw_price = prices.get("usd_foil")
        else:
            raw_price = prices.get("usd") or prices.get("usd_foil") or prices.get("usd_etched")

        market_str: str | None = None
        if raw_price:
            try:
                d = Decimal(str(raw_price)).quantize(Decimal("0.01"))
                if d > 0:
                    market_str = str(d)
            except Exception as exc:
                logger.debug("Invalid Scryfall price %r: %s", raw_price, exc)

        res = {
            "source": "SCRYFALL",
            "market_value": market_str,
            "specs": {
                "card_game": "Magic: The Gathering",
                "set_name": str(card.get("set_name") or ""),
                "set_code": str(card.get("set") or "").upper(),
                "card_number": str(card.get("collector_number") or ""),
                "rarity": str(card.get("rarity") or "").title(),
                "artist": str(card.get("artist") or ""),
            },
            "catalog_numbers": {
                "scryfall_id": str(card.get("id") or ""),
                **({"tcgplayer_id": str(card["tcgplayer_id"])} if card.get("tcgplayer_id") else {}),
            },
            "raw": {"id": card.get("id"), "name": card.get("name"), "prices": prices},
        }
        cache.set(cache_key, res, timeout=43200)
        return res
    except Exception as exc:
        logger.warning("Scryfall lookup failed for %r: %s", title, exc)
        return None


def lookup_pricecharting_card(
    title: str,
    set_name: str = "",
    card_number: str = "",
    grading_service: str = "NONE",
    grade: str = "",
    api_key: str = "",
    timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Query PriceCharting API for ungraded and graded (PSA/BGS/CGC) trading card prices."""
    if not title or not api_key:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("pricecharting", title, set_name, card_number, grading_service, grade)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    query = " ".join(p for p in [title.strip(), set_name.strip(), card_number.strip()] if p)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://www.pricecharting.com/api/products",
                params={"t": api_key, "q": query},
            )
            resp.raise_for_status()
            data = resp.json()
        products = data.get("products") or []
        if not products:
            cache.set(cache_key, False, timeout=3600)
            return None

        prod = products[0]
        svc = (grading_service or "").upper()
        grade_str = str(grade or "").strip()

        # PriceCharting returns prices in integer cents
        price_cents = None
        if svc == "PSA" and grade_str == "10":
            price_cents = prod.get("psa-10-price") or prod.get("manual-only-price") or prod.get("graded-price")
        elif svc == "PSA" and grade_str in {"9", "8", "7"}:
            price_cents = prod.get(f"psa-{grade_str}-price") or prod.get("graded-price")
        elif svc == "BGS" and grade_str == "10":
            price_cents = prod.get("bgs-10-price") or prod.get("graded-price")
        elif svc == "BGS" and grade_str == "9.5":
            price_cents = prod.get("bgs-9-5-price") or prod.get("bgs-10-price") or prod.get("graded-price")
        elif svc == "CGC" and grade_str in {"9.5", "10"}:
            price_cents = prod.get("cgc-10-price") or prod.get("graded-price")
        elif svc == "SGC" and grade_str == "10":
            price_cents = prod.get("sgc-10-price") or prod.get("graded-price")
        elif svc == "TAG" and grade_str == "10":
            price_cents = prod.get("tag-10-price") or prod.get("graded-price")
        elif svc not in {"", "NONE"}:
            price_cents = prod.get("graded-price") or prod.get("cib-price")
        else:
            price_cents = prod.get("loose-price")

        if not price_cents or int(price_cents) <= 0:
            return None

        market = (Decimal(str(price_cents)) / Decimal("100")).quantize(Decimal("0.01"))
        res = {
            "source": "PRICECHARTING",
            "market_value": str(market),
            "catalog_numbers": {
                **({"pricecharting_id": str(prod["id"])} if prod.get("id") else {}),
            },
            "raw": prod,
        }
        cache.set(cache_key, res, timeout=21600)
        return res
    except Exception as exc:
        logger.warning("PriceCharting lookup failed for %r: %s", title, exc)
        return None


def _get_tcgplayer_token(client_id: str, client_secret: str, timeout: float = 8.0) -> str | None:
    """Obtain and cache a TCGplayer OAuth2 bearer token."""
    from django.core.cache import cache

    token_key = _card_cache_key("tcgplayer_token", client_id)
    cached_token = cache.get(token_key)
    if cached_token:
        return str(cached_token)

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                "https://api.tcgplayer.com/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        token = data.get("access_token")
        if token:
            expires_in = max(60, int(data.get("expires_in") or 3600) - 60)
            cache.set(token_key, token, timeout=expires_in)
            return str(token)
    except Exception as exc:
        logger.warning("TCGplayer OAuth token request failed: %s", exc)
    return None


def lookup_tcgplayer_price(
    title: str,
    set_name: str = "",
    card_number: str = "",
    client_id: str | None = None,
    client_secret: str | None = None,
    timeout: float = 8.0,
) -> dict[str, Any] | None:
    """Query TCGplayer API (BYOK OAuth2) for Market, Low, Mid, High, and Buylist pricing."""
    if not title or not client_id or not client_secret:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("tcgplayer", title, set_name, card_number)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    token = _get_tcgplayer_token(client_id, client_secret, timeout=timeout)
    if not token:
        return None

    query = " ".join(p for p in [title.strip(), set_name.strip(), card_number.strip()] if p)
    headers = {"Authorization": f"bearer {token}", "Accept": "application/json"}
    try:
        with httpx.Client(timeout=timeout) as client:
            search_resp = client.get(
                "https://api.tcgplayer.com/catalog/products",
                params={"productName": query, "limit": 1},
                headers=headers,
            )
            search_resp.raise_for_status()
            products = (search_resp.json().get("results") or [])
            if not products:
                cache.set(cache_key, False, timeout=3600)
                return None

            product_id = products[0].get("productId")
            if not product_id:
                return None

            price_resp = client.get(
                f"https://api.tcgplayer.com/pricing/product/{product_id}",
                headers=headers,
            )
            price_resp.raise_for_status()
            price_results = price_resp.json().get("results") or []

        best = next(
            (r for r in price_results if r.get("marketPrice") is not None),
            price_results[0] if price_results else None,
        )
        if not best:
            return None

        market_raw = best.get("marketPrice") or best.get("midPrice") or best.get("lowPrice")
        if market_raw is None:
            return None

        res = {
            "source": "TCGPLAYER",
            "market_value": str(Decimal(str(market_raw)).quantize(Decimal("0.01"))),
            "low_price": str(Decimal(str(best["lowPrice"])).quantize(Decimal("0.01"))) if best.get("lowPrice") is not None else None,
            "mid_price": str(Decimal(str(best["midPrice"])).quantize(Decimal("0.01"))) if best.get("midPrice") is not None else None,
            "high_price": str(Decimal(str(best["highPrice"])).quantize(Decimal("0.01"))) if best.get("highPrice") is not None else None,
            "buylist_price": str(Decimal(str(best["buylistMarketPrice"])).quantize(Decimal("0.01"))) if best.get("buylistMarketPrice") is not None else None,
            "catalog_numbers": {"tcgplayer_id": str(product_id)},
            "raw": best,
        }
        cache.set(cache_key, res, timeout=21600)
        return res
    except Exception as exc:
        logger.warning("TCGplayer lookup failed for %r: %s", title, exc)
        return None


def lookup_collectr_price(
    title: str,
    set_name: str = "",
    card_number: str = "",
    api_key: str = "",
    timeout: float = 8.0,
) -> dict[str, Any] | None:
    """Query Collectr Partner API when BYOK COLLECTR_API_KEY is configured."""
    if not title or not api_key:
        return None
    from django.core.cache import cache

    cache_key = _card_cache_key("collectr", title, set_name, card_number)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    query = " ".join(p for p in [title.strip(), set_name.strip(), card_number.strip()] if p)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                "https://api.getcollectr.com/v1/cards/search",
                params={"q": query, "limit": 1},
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        items = data.get("results") or data.get("data") or []
        if not items:
            cache.set(cache_key, False, timeout=3600)
            return None
        card = items[0]
        raw_price = card.get("market_price") or card.get("price")
        if raw_price is None:
            return None
        res = {
            "source": "COLLECTR",
            "market_value": str(Decimal(str(raw_price)).quantize(Decimal("0.01"))),
            "catalog_numbers": {
                **({"collectr_id": str(card["id"])} if card.get("id") else {}),
            },
            "raw": card,
        }
        cache.set(cache_key, res, timeout=21600)
        return res
    except Exception as exc:
        logger.warning("Collectr lookup failed for %r: %s", title, exc)
        return None

