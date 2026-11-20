from decimal import Decimal
from unittest.mock import MagicMock, patch

import httpx
import respx

from apps.valuation.providers import (
    _fetch_ebay_active_raw,
    _fetch_ebay_sold_raw,
    _lookup_ebay_browse_active,
    lookup_ebay_market_comps,
    lookup_ebay_sold_comps,
)


def test_lookup_ebay_market_comps_empty_inputs():
    assert lookup_ebay_market_comps("", "cid", "csec") is None
    assert lookup_ebay_market_comps("Morgan", "", "csec") is None
    assert lookup_ebay_market_comps("Morgan", "cid", "") is None
    assert lookup_ebay_sold_comps("", "cid", "csec") is None


@respx.mock
def test_lookup_ebay_market_comps_blended_success():
    router = respx.mock
    # OAuth tokens
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "mock-token"})
    )
    # Sold sales search
    router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "itemSales": [
                    {"lastSoldPrice": {"value": "100.00"}},
                    {"lastSoldPrice": {"value": "105.00"}},
                    {"lastSoldPrice": {"value": "110.00"}},
                ]
            },
        )
    )
    # Active asking search
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "itemSummaries": [
                    {"price": {"value": "120.00"}},
                    {"price": {"value": "125.00"}},
                    {"price": {"value": "130.00"}},
                ]
            },
        )
    )

    res = lookup_ebay_market_comps("1889 Morgan Dollar", client_id="cid", client_secret="csec")
    assert res is not None
    assert res["source"] == "COMPS"
    assert res["is_blended"] is True
    assert res["is_ask"] is False
    # Sold median: 105.00, Active ask mean: 125.00 -> Blended: (105.00 + 125.00) / 2 = 115.00
    assert res["value"] == Decimal("115.00")
    assert res["median"] == Decimal("115.00")
    assert res["low"] == Decimal("100.00")
    assert res["high"] == Decimal("130.00")
    assert res["count"] == 6

    assert res["sold"]["count"] == 3
    assert res["sold"]["median"] == Decimal("105.00")
    assert res["sold"]["low"] == Decimal("100.00")
    assert res["sold"]["high"] == Decimal("110.00")

    assert res["active_ask"]["count"] == 3
    assert res["active_ask"]["mean"] == Decimal("125.00")
    assert res["active_ask"]["low"] == Decimal("120.00")
    assert res["active_ask"]["high"] == Decimal("130.00")
    assert res["raw"]["is_blended"] is True


@respx.mock
def test_lookup_ebay_market_comps_only_sold_available():
    router = respx.mock
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "mock-token"})
    )
    router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "itemSales": [
                    {"lastSoldPrice": {"value": "50.00"}},
                    {"lastSoldPrice": {"value": "60.00"}},
                    {"lastSoldPrice": {"value": "70.00"}},
                ]
            },
        )
    )
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(200, json={"itemSummaries": []})
    )

    res = lookup_ebay_market_comps("Rare Note", client_id="cid", client_secret="csec")
    assert res is not None
    assert res["source"] == "COMPS"
    assert res["is_blended"] is False
    assert res["is_ask"] is False
    assert res["value"] == Decimal("60.00")
    assert res["median"] == Decimal("60.00")
    assert res["low"] == Decimal("50.00")
    assert res["high"] == Decimal("70.00")
    assert res["count"] == 3
    assert res["active_ask"] is None


@respx.mock
def test_lookup_ebay_market_comps_fallback_on_403_and_404():
    router = respx.mock
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "mock-token"})
    )
    # Sold returns 403 Forbidden
    router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(
        return_value=httpx.Response(403)
    )
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "itemSummaries": [
                    {"price": {"value": "100.00"}},
                    {"price": {"value": "100.00"}},
                    {"price": {"value": "100.00"}},
                ]
            },
        )
    )

    res = lookup_ebay_market_comps("2024 Silver Eagle", client_id="cid", client_secret="csec")
    assert res is not None
    assert res["source"] == "EBAY_ACTIVE_ASK"
    assert res["is_blended"] is False
    assert res["is_ask"] is True
    # 100 * 0.85 = 85.00
    assert res["value"] == Decimal("85.00")
    assert res["median"] == Decimal("85.00")
    assert res["low"] == Decimal("85.00")
    assert res["high"] == Decimal("85.00")
    assert res["count"] == 3
    assert res["sold"] is None
    assert res["active_ask"]["mean"] == Decimal("100.00")


@respx.mock
def test_lookup_ebay_market_comps_neither_available():
    router = respx.mock
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "mock-token"})
    )
    router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(
        return_value=httpx.Response(500)
    )
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(500)
    )

    res = lookup_ebay_market_comps("Mystery Item", client_id="cid", client_secret="csec")
    assert res is None


def test_lookup_ebay_market_comps_threadpool_exception_handled():
    with patch("concurrent.futures.ThreadPoolExecutor") as mock_executor_cls:
        mock_executor = MagicMock()
        mock_executor.__enter__.return_value = mock_executor
        mock_executor.submit.side_effect = RuntimeError("Worker spawn failed")
        mock_executor_cls.return_value = mock_executor

        res = lookup_ebay_market_comps("Error Coin", client_id="cid", client_secret="csec")
        assert res is None


@respx.mock
def test_fetch_ebay_helpers_direct():
    client = httpx.Client()
    router = respx.mock

    # 1. Token non-200
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(401)
    )
    assert _fetch_ebay_sold_raw(client, "ASE", "cid", "csec") is None
    assert _fetch_ebay_active_raw(client, "ASE", "cid", "csec") is None

    # 2. Token missing access_token
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={})
    )
    assert _fetch_ebay_sold_raw(client, "ASE", "cid", "csec") is None
    assert _fetch_ebay_active_raw(client, "ASE", "cid", "csec") is None

    # 3. Search non-200
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok"})
    )
    router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(
        return_value=httpx.Response(500)
    )
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(500)
    )
    assert _fetch_ebay_sold_raw(client, "ASE", "cid", "csec") is None
    assert _fetch_ebay_active_raw(client, "ASE", "cid", "csec") is None

    # 4. _lookup_ebay_browse_active helper empty
    assert _lookup_ebay_browse_active(client, "ASE", "cid", "csec") is None


@respx.mock
def test_lookup_ebay_browse_active_with_listings():
    client = httpx.Client()
    router = respx.mock
    router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
        return_value=httpx.Response(200, json={"access_token": "active-token"})
    )
    router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "itemSummaries": [
                    {"price": {"value": "20.00"}},
                    {"price": {"value": "30.00"}},
                ]
            },
        )
    )
    res = _lookup_ebay_browse_active(client, "Silver Round", "cid", "csec")
    assert res is not None
    assert res["source"] == "EBAY_ACTIVE_ASK"
    assert res["is_ask"] is True
    assert res["count"] == 2

