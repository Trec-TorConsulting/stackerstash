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


def test_card_cert_verification_urls():
    from apps.valuation.providers import build_cert_verification_url

    assert build_cert_verification_url("PSA", "12345678") == "https://www.psacard.com/cert/12345678"
    assert "item_type=BGS&item_id=99887766" in (build_cert_verification_url("BGS", "99887766") or "")
    assert build_cert_verification_url("CGC", "4455667788") == "https://www.cgccards.com/certlookup/4455667788/"
    assert "cert=1122334" in (build_cert_verification_url("SGC", "1122334") or "")
    assert build_cert_verification_url("TAG", "TAG999") == "https://my.taggrading.com/card/TAG999"


@patch("apps.valuation.providers.httpx.Client")
def test_lookup_pokemon_tcg_and_scryfall_and_pricecharting(mock_client_cls):
    from django.core.cache import cache
    from apps.valuation.providers import (
        lookup_pokemon_tcg_card,
        lookup_pricecharting_card,
        lookup_scryfall_card,
    )

    cache.clear()

    poke_resp = MagicMock(status_code=200)
    poke_resp.json.return_value = {
        "data": [
            {
                "id": "base1-4",
                "name": "Charizard",
                "number": "4",
                "rarity": "Rare Holo",
                "artist": "Mitsuhiro Arita",
                "set": {"id": "base1", "name": "Base", "ptcgoCode": "BS", "printedTotal": 102},
                "tcgplayer": {
                    "url": "https://prices.pokemontcg.io/tcgplayer/base1-4",
                    "prices": {"holofoil": {"low": 250.0, "market": 345.0, "high": 490.0}},
                },
            }
        ]
    }
    scryfall_resp = MagicMock(status_code=200)
    scryfall_resp.json.return_value = {
        "id": "scry-123",
        "name": "Black Lotus",
        "set": "lea",
        "set_name": "Limited Edition Alpha",
        "collector_number": "232",
        "rarity": "rare",
        "artist": "Christopher Rush",
        "tcgplayer_id": 1234,
        "prices": {"usd": "15000.00"},
    }
    pc_resp = MagicMock(status_code=200)
    pc_resp.json.return_value = {
        "products": [{"id": "999", "loose-price": 32000, "manual-only-price": 950000}]
    }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.get.side_effect = [poke_resp, scryfall_resp, pc_resp]
    mock_client_cls.return_value = mock_client

    poke = lookup_pokemon_tcg_card("Charizard", set_name="Base", card_number="4/102", card_finish="Holo")
    assert poke is not None
    assert poke["market_value"] == "345.00"
    assert poke["catalog_numbers"]["pokemon_tcg_id"] == "base1-4"
    assert poke["specs"]["set_code"] == "BS"

    mtg = lookup_scryfall_card("Black Lotus", set_code="LEA")
    assert mtg is not None
    assert mtg["market_value"] == "15000.00"
    assert mtg["catalog_numbers"]["scryfall_id"] == "scry-123"

    pc = lookup_pricecharting_card("Charizard", grading_service="PSA", grade="10", api_key="pc-key")
    assert pc is not None
    assert pc["market_value"] == "9500.00"
    assert pc["catalog_numbers"]["pricecharting_id"] == "999"



def test_lookup_psa_cert_extracts_pop_and_spec_id(monkeypatch):
    from django.core.cache import cache
    from apps.valuation.providers import lookup_psa_cert

    cache.clear()

    class MockResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "PSACert": {
                    "CertNumber": "12345678",
                    "Subject": "Charizard",
                    "Brand": "Pokemon Base Set",
                    "Year": "1999",
                    "CardNumber": "4",
                    "GradeDescription": "GEM MT 10",
                    "SpecID": 998877,
                    "TotalPopulation": 420,
                    "PopulationHigher": 0,
                    "LabelType": "Lighthouse",
                }
            }

    class MockClient:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def get(self, *a, **kw):
            return MockResp()

    monkeypatch.setattr("apps.valuation.providers.httpx.Client", MockClient)
    res = lookup_psa_cert("12345678", "psa-token")
    assert res is not None
    assert res["specs"]["psa_spec_id"] == 998877
    assert res["specs"]["total_population"] == 420
    assert res["specs"]["population_higher"] == 0
    assert res["specs"]["psa_label_type"] == "Lighthouse"


def test_lookup_pricecharting_card_multi_grade_tiers(monkeypatch):
    from django.core.cache import cache
    from apps.valuation.providers import lookup_pricecharting_card

    cache.clear()

    class MockResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "products": [
                    {
                        "id": "pc-123",
                        "loose-price": 1500,
                        "psa-9-price": 4500,
                        "bgs-9-5-price": 8000,
                        "tag-10-price": 12000,
                    }
                ]
            }

    class MockClient:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def get(self, *a, **kw):
            return MockResp()

    monkeypatch.setattr("apps.valuation.providers.httpx.Client", MockClient)
    bgs = lookup_pricecharting_card("Charizard", grading_service="BGS", grade="9.5", api_key="pc-key")
    assert bgs is not None and bgs["market_value"] == "80.00"

    tag = lookup_pricecharting_card("Charizard", grading_service="TAG", grade="10", api_key="pc-key")
    assert tag is not None and tag["market_value"] == "120.00"

    raw = lookup_pricecharting_card("Charizard", grading_service="NONE", grade="", api_key="pc-key")
    assert raw is not None and raw["market_value"] == "15.00"


def test_lookup_tcgplayer_and_collectr_optional_byok(monkeypatch):
    from django.core.cache import cache
    from apps.valuation.providers import lookup_collectr_price, lookup_tcgplayer_price

    cache.clear()
    assert lookup_tcgplayer_price("Charizard", client_id="", client_secret="") is None
    assert lookup_collectr_price("Charizard", api_key="") is None

    class MockResp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self._payload

    class MockClient:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def post(self, url, **kw):
            return MockResp({"access_token": "tok-123", "expires_in": 3600})

        def get(self, url, **kw):
            if "catalog/products" in url:
                return MockResp({"results": [{"productId": 555}]})
            if "pricing/product" in url:
                return MockResp({"results": [{"marketPrice": 99.5, "lowPrice": 85.0, "midPrice": 95.0, "highPrice": 120.0, "buylistMarketPrice": 60.0}]})
            return MockResp({"results": [{"id": "col-1", "market_price": "105.25"}]})

    monkeypatch.setattr("apps.valuation.providers.httpx.Client", MockClient)
    tcg = lookup_tcgplayer_price("Charizard", client_id="cid", client_secret="csec")
    assert tcg is not None
    assert tcg["market_value"] == "99.50"
    assert tcg["buylist_price"] == "60.00"

    col = lookup_collectr_price("Charizard", api_key="col-key")
    assert col is not None
    assert col["market_value"] == "105.25"
