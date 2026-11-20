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
    lookup_zero_key_public_comps,
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


def test_lookup_zero_key_public_comps_empty_inputs():
    assert lookup_zero_key_public_comps("") is None
    assert lookup_zero_key_public_comps("   ") is None
    assert lookup_zero_key_public_comps("!@#$%^&*()") is None


@respx.mock
def test_lookup_zero_key_public_comps_success():
    router = respx.mock
    mock_html = """
    <html>
      <body>
        <div class="s-item__price">$45.00</div>
        <div class="s-item__price">$50.00</div>
        <div class="s-item__price">$55.00</div>
        <div class="s-item__price">$60.00</div>
      </body>
    </html>
    """
    router.get("https://www.ebay.com/sch/i.html").mock(
        return_value=httpx.Response(200, text=mock_html)
    )

    res = lookup_zero_key_public_comps("1921 Morgan Dollar")
    assert res is not None
    assert res["source"] == "ZERO_KEY_COMPS"
    assert res["is_blended"] is False
    assert res["is_ask"] is False
    assert res["count"] == 4
    assert res["median"] == Decimal("52.50")
    assert res["low"] == Decimal("45.00")
    assert res["high"] == Decimal("60.00")
    assert res["sold"]["count"] == 4
    assert res["raw"]["tier"] == "ZERO_KEY"


@respx.mock
def test_lookup_zero_key_public_comps_throttled_or_error():
    router = respx.mock
    # 403 Forbidden
    router.get("https://www.ebay.com/sch/i.html").mock(return_value=httpx.Response(403))
    assert lookup_zero_key_public_comps("1921 Morgan Dollar") is None

    # 429 Too Many Requests
    router.get("https://www.ebay.com/sch/i.html").mock(return_value=httpx.Response(429))
    assert lookup_zero_key_public_comps("1921 Morgan Dollar") is None

    # 500 Error
    router.get("https://www.ebay.com/sch/i.html").mock(return_value=httpx.Response(500))
    assert lookup_zero_key_public_comps("1921 Morgan Dollar") is None


@respx.mock
def test_lookup_zero_key_public_comps_no_prices_or_network_exception():
    router = respx.mock
    router.get("https://www.ebay.com/sch/i.html").mock(
        return_value=httpx.Response(200, text="<html><body>No items found</body></html>")
    )
    assert lookup_zero_key_public_comps("Unobtainium Coin") is None

    # Network exception
    router.get("https://www.ebay.com/sch/i.html").mock(
        side_effect=httpx.ConnectTimeout("Connection timed out")
    )
    assert lookup_zero_key_public_comps("Timeout Coin") is None


