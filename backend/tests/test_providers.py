from decimal import Decimal
from unittest.mock import MagicMock, patch

from apps.valuation.providers import (
    _trim_outliers,
    lookup_bullion_dealer_benchmark,
    lookup_cert_metadata,
    lookup_ebay_sold_comps,
    lookup_numismedia,
    lookup_numista_specs,
)


def test_trim_outliers_removes_extremes():
    prices = [Decimal("10"), Decimal("48"), Decimal("50"), Decimal("51"), Decimal("52"), Decimal("500")]
    trimmed = _trim_outliers(prices)
    assert Decimal("10") not in trimmed
    assert Decimal("500") not in trimmed
    assert trimmed == [Decimal("48"), Decimal("50"), Decimal("51"), Decimal("52")]


def test_lookup_cert_metadata_non_pcgs_returns_verification_link():
    res = lookup_cert_metadata("NGC", "6543210-001")
    assert res is not None
    assert res["source"] == "NGC"
    assert res["verification_url"] == "https://www.ngccoin.com/certlookup/6543210-001/"
    assert res["market_value"] is None


@patch("apps.valuation.providers.httpx.Client")
def test_lookup_numismedia_returns_fmv(mock_client_cls):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"fmv": "145.50", "grade": "MS64"}
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    res = lookup_numismedia("Morgan Dollar", year="1889", mint_mark="O", grade="MS64", api_key="nm-key")
    assert res is not None
    assert res["source"] == "NUMISMEDIA"
    assert res["market_value"] == Decimal("145.50")


@patch("apps.valuation.providers.httpx.Client")
def test_lookup_numista_specs_extracts_physical_and_catalog_fields(mock_client_cls):
    search_resp = MagicMock(status_code=200)
    search_resp.json.return_value = {"types": [{"id": 1492}]}
    detail_resp = MagicMock(status_code=200)
    detail_resp.json.return_value = {
        "composition": {"text": "Silver (.900)"},
        "weight": 26.73,
        "size": 38.1,
        "thickness": 2.4,
        "edge": {"description": "Reeded"},
        "obverse": {"engravers": ["George T. Morgan"]},
        "references": [{"catalogue": {"code": "KM"}, "number": "110"}],
        "mintage": 11875000,
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.get.side_effect = [search_resp, detail_resp]
    mock_client_cls.return_value = mock_client

    res = lookup_numista_specs("Morgan Dollar", year="1889", country="United States", api_key="num-key")
    assert res is not None
    specs = res["specs"]
    assert specs["composition"] == "Silver (.900)"
    assert specs["gross_weight_grams"] == Decimal("26.7300")
    assert specs["diameter_mm"] == Decimal("38.10")
    assert specs["thickness_mm"] == Decimal("2.40")
    assert specs["edge_type"] == "Reeded"
    assert specs["designer"] == "George T. Morgan"
    assert specs["catalog_numbers"] == {"Numista": "1492", "KM": "110"}
    assert specs["mintage"] == 11875000


@patch("apps.valuation.providers.httpx.Client")
def test_lookup_ebay_sold_comps_computes_range_and_median(mock_client_cls):
    token_resp = MagicMock(status_code=200)
    token_resp.json.return_value = {"access_token": "ebay-tok"}
    search_resp = MagicMock(status_code=200)
    search_resp.json.return_value = {
        "itemSales": [
            {"lastSoldPrice": {"value": "10.00"}},
            {"lastSoldPrice": {"value": "95.00"}},
            {"lastSoldPrice": {"value": "100.00"}},
            {"lastSoldPrice": {"value": "105.00"}},
            {"lastSoldPrice": {"value": "110.00"}},
            {"lastSoldPrice": {"value": "999.00"}},
        ]
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = token_resp
    mock_client.get.return_value = search_resp
    mock_client_cls.return_value = mock_client

    res = lookup_ebay_sold_comps("1889-O Morgan Dollar", client_id="cid", client_secret="csec")
    assert res is not None
    assert res["source"] == "COMPS"
    assert res["low"] == Decimal("95.00")
    assert res["median"] == Decimal("102.50")
    assert res["high"] == Decimal("110.00")
    assert res["count"] == 4


@patch("apps.valuation.providers.httpx.Client")
def test_lookup_ebay_falls_back_to_browse_active_ask_on_403(mock_client_cls):
    sold_token_resp = MagicMock(status_code=200)
    sold_token_resp.json.return_value = {"access_token": "sold-tok"}
    sold_search_resp = MagicMock(status_code=403)

    browse_token_resp = MagicMock(status_code=200)
    browse_token_resp.json.return_value = {"access_token": "browse-tok"}
    browse_search_resp = MagicMock(status_code=200)
    browse_search_resp.json.return_value = {
        "itemSummaries": [
            {"price": {"value": "42.00"}},
            {"price": {"value": "45.00"}},
            {"price": {"value": "48.00"}},
        ]
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.side_effect = [sold_token_resp, browse_token_resp]
    mock_client.get.side_effect = [sold_search_resp, browse_search_resp]
    mock_client_cls.return_value = mock_client

    res = lookup_ebay_sold_comps("2024 Silver Eagle", client_id="cid", client_secret="csec")
    assert res is not None
    assert res["source"] == "EBAY_ACTIVE_ASK"
    assert res["is_ask"] is True
    assert res["median"] == Decimal("45.00")


def test_lookup_bullion_dealer_benchmark():
    res = lookup_bullion_dealer_benchmark("2024 American Silver Eagle 1 oz", "SILVER", Decimal("30.00"))
    assert res is not None
    assert res["label"] == "American Silver Eagle"
    assert res["low_usd"] == "33.60"
    assert res["high_usd"] == "36.60"

