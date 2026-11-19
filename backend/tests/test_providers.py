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
    assert res["median"] == Decimal("38.25")


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


def test_filter_comp_listings_excludes_lots_replicas_and_empty_boxes():
    from decimal import Decimal

    from apps.valuation.providers import _filter_comp_listings

    listings = [
        {"title": "1921 Morgan Silver Dollar MS63", "price": {"value": "65.00"}},
        {"title": "Lot of 5 1921 Morgan Silver Dollars", "price": {"value": "200.00"}},
        {"title": "1921 Morgan Silver Dollar Replica Copy", "price": {"value": "12.00"}},
        {"title": "Empty Box for Morgan Silver Dollar", "price": {"value": "15.00"}},
        {"title": "1921 Morgan Silver Dollar BU", "price": {"value": "55.00"}},
    ]
    prices = _filter_comp_listings(listings, query="1921 Morgan Silver Dollar")
    assert prices == [Decimal("65.00"), Decimal("55.00")]


def test_all_valuation_providers_comprehensive_branches():
    from decimal import Decimal

    import httpx
    import respx
    from django.core.cache import cache

    from apps.valuation.providers import (
        _filter_comp_listings,
        _get_tcgplayer_token,
        _hydrate_cached_specs,
        _select_pokemon_tcg_price,
        _trim_outliers,
        build_cert_verification_url,
        fetch_spot_prices_from_gold_api,
        lookup_bullion_dealer_benchmark,
        lookup_cert_metadata,
        lookup_collectr_price,
        lookup_ebay_sold_comps,
        lookup_goldback_exchange_benchmark,
        lookup_greysheet,
        lookup_numismedia,
        lookup_numista_specs,
        lookup_pcgs_cert,
        lookup_pokemon_tcg_card,
        lookup_pricecharting_card,
        lookup_psa_cert,
        lookup_scryfall_card,
        lookup_tcgplayer_price,
    )

    cache.clear()
    assert _hydrate_cached_specs({"diameter_mm": "bad_dec"}) == {"diameter_mm": "bad_dec"}
    assert lookup_pcgs_cert("", "tok") is None
    assert build_cert_verification_url("NONE", "123") is None
    assert lookup_cert_metadata("NONE", "123") is None
    assert lookup_cert_metadata("OTHER", "123") is None
    assert lookup_greysheet("Coin", "", "tok") is None
    assert lookup_numismedia("Coin", api_key="") is None
    assert lookup_numista_specs("Coin", api_key="") is None
    assert lookup_ebay_sold_comps("", "id", "sec") is None
    assert lookup_bullion_dealer_benchmark("ASE", "NONE", Decimal("30.00")) is None
    assert lookup_bullion_dealer_benchmark("Private Token", "SILVER", Decimal("30.00")) is None
    assert lookup_goldback_exchange_benchmark("ASE", "", "", Decimal("30.00")) is None
    assert lookup_goldback_exchange_benchmark("Goldback", "", "1", Decimal("0.00")) is None
    assert lookup_psa_cert("", "tok") is None
    assert lookup_pokemon_tcg_card("", api_key="k") is None
    assert lookup_scryfall_card("") is None
    assert lookup_pricecharting_card("", api_key="k") is None
    assert lookup_collectr_price("", api_key="k") is None

    # Outlier / comp list edge cases
    assert _filter_comp_listings([{"title": "Good", "price": {"value": "notnum"}}]) == []
    assert _trim_outliers([Decimal("10")]) == [Decimal("10")]
    assert _trim_outliers([Decimal("0"), Decimal("0"), Decimal("0"), Decimal("0")]) == [
        Decimal("0"), Decimal("0"), Decimal("0"), Decimal("0")
    ]
    assert _select_pokemon_tcg_price({}) == (None, None, None)
    assert _select_pokemon_tcg_price(
        {"1stEditionHolofoil": {"market": "20.00"}}, card_finish="1st Edition"
    ) == (Decimal("20.00"), None, None)
    assert _select_pokemon_tcg_price(
        {"reverseHolofoil": {"mid": "12.50"}, "broken": "str"}, card_finish="Reverse Holo"
    ) == (Decimal("12.50"), None, None)
    assert _select_pokemon_tcg_price({"onlyEmpty": {"market": "bad"}}) == (None, None, None)
    assert _select_pokemon_tcg_price({"holofoil": {"low": "5.00"}}) == (None, None, None)

    with respx.mock(assert_all_called=False) as router:
        # gold-api error on copper + valid gold
        router.get("https://api.gold-api.com/price/XAU").mock(return_value=httpx.Response(200, json={"price": 2650.0, "unit": "ozt"}))
        router.get("https://api.gold-api.com/price/XAG").mock(return_value=httpx.Response(500))
        router.get("https://api.gold-api.com/price/XPT").mock(return_value=httpx.Response(500))
        router.get("https://api.gold-api.com/price/XPD").mock(return_value=httpx.Response(500))
        router.get("https://api.gold-api.com/price/HG").mock(return_value=httpx.Response(500))
        spots = fetch_spot_prices_from_gold_api()
        assert spots["GOLD"] == Decimal("2650.0000")

        # PCGS cert error & success + Diameter/Composition specs
        router.get("https://api.pcgs.com/publicapi/coindetails/GetCoinFactsByCertNo/0000").mock(return_value=httpx.Response(404))
        assert lookup_pcgs_cert("0000", "tok") is None
        router.get("https://api.pcgs.com/publicapi/coindetails/GetCoinFactsByCertNo/9999").mock(side_effect=httpx.ConnectError("down"))
        assert lookup_pcgs_cert("9999", "tok") is None

        # Greysheet & NumisMedia success, 404, error
        router.get("https://api.greysheet.com/v1/prices/search").mock(
            return_value=httpx.Response(200, json={"items": [{"cpg_retail": "140.50"}]})
        )
        assert lookup_greysheet("Morgan", "k", "t")["market_value"] == Decimal("140.50")
        router.get("https://api.greysheet.com/v1/prices/search").mock(return_value=httpx.Response(500))
        assert lookup_greysheet("Morgan", "k", "t") is None

        router.get("https://api.numismedia.com/v1/fmv").mock(
            return_value=httpx.Response(200, json={"fmv": "95.00"})
        )
        assert lookup_numismedia("Morgan", api_key="nm")["market_value"] == Decimal("95.00")
        router.get("https://api.numismedia.com/v1/fmv").mock(return_value=httpx.Response(404))
        assert lookup_numismedia("Morgan", api_key="nm") is None
        router.get("https://api.numismedia.com/v1/fmv").mock(side_effect=httpx.ConnectError("nm down"))
        assert lookup_numismedia("Morgan", api_key="nm") is None

        # Numista edge branches (non-200 search, empty types, missing id, non-200 detail, str edge, bad mintage)
        router.get("https://api.numista.com/api/v3/types").mock(return_value=httpx.Response(500))
        assert lookup_numista_specs("Test", api_key="nk") is None
        router.get("https://api.numista.com/api/v3/types").mock(return_value=httpx.Response(200, json={"types": []}))
        assert lookup_numista_specs("Test2", api_key="nk") is None
        router.get("https://api.numista.com/api/v3/types").mock(return_value=httpx.Response(200, json={"types": [{}]}))
        assert lookup_numista_specs("Test3", api_key="nk") is None
        router.get("https://api.numista.com/api/v3/types").mock(return_value=httpx.Response(200, json={"types": [{"id": 77}]}))
        router.get("https://api.numista.com/api/v3/types/77").mock(return_value=httpx.Response(500))
        assert lookup_numista_specs("Test4", api_key="nk") is None
        router.get("https://api.numista.com/api/v3/types/77").mock(
            return_value=httpx.Response(200, json={"edge": "Reeded edge", "mintage": "unknown", "obverse": {"engravers": ["Morgan"]}})
        )
        n_res = lookup_numista_specs("Test5", api_key="nk")
        assert n_res is not None and n_res["specs"]["edge_type"] == "Reeded edge"

        # Cert metadata delegating to PCGS & PSA
        router.get("https://api.pcgs.com/publicapi/coindetails/GetCoinFactsByCertNo/445566").mock(
            return_value=httpx.Response(
                200,
                json={
                    "PriceGuideValue": "180.00",
                    "Diameter": "bad_diam",
                    "Weight": "bad_wt",
                    "Mintage": "bad_mintage",
                    "MintMark": "S",
                    "Designer": "Morgan",
                    "PCGSNo": "7296",
                },
            )
        )
        assert lookup_cert_metadata("PCGS", "445566", pcgs_token="tok")["market_value"] == Decimal("180.00")
        router.get("https://api.psacard.com/publicapi/cert/GetByCertNumber/887766").mock(
            return_value=httpx.Response(200, json={"PSACert": {"CertNumber": "887766", "Subject": "Pikachu", "Brand": "Pokemon", "Year": "1999", "CardNumber": "58", "GradeDescription": "GEM MT 10"}})
        )
        psa_meta = lookup_cert_metadata("PSA", "887766", psa_token="ptok")
        assert psa_meta is not None and psa_meta["source"] == "PSA"
        assert lookup_psa_cert("887766", "ptok") is not None  # hits cache
        router.get("https://api.psacard.com/publicapi/cert/GetByCertNumber/000111").mock(
            return_value=httpx.Response(200, json={"PSACert": {}})
        )
        assert lookup_psa_cert("000111", "ptok") is None
        router.get("https://api.psacard.com/publicapi/cert/GetByCertNumber/000222").mock(side_effect=httpx.ConnectError("psa down"))
        assert lookup_psa_cert("000222", "ptok") is None

        # eBay error / 401 -> browse active fallback / non-200 paths (418, 421, 428, 433, 475)
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
            side_effect=[httpx.Response(401), httpx.Response(500)]
        )
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
            side_effect=[httpx.Response(401), httpx.Response(200, json={})]
        )
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
            side_effect=[httpx.Response(401), httpx.Response(200, json={"access_token": "btok"})]
        )
        router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(return_value=httpx.Response(500))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(
            side_effect=[httpx.Response(401), httpx.Response(200, json={"access_token": "btok"})]
        )
        router.get("https://api.ebay.com/buy/browse/v1/item_summary/search").mock(return_value=httpx.Response(200, json={"itemSummaries": []}))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None

        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(return_value=httpx.Response(500))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(return_value=httpx.Response(200, json={}))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(return_value=httpx.Response(200, json={"access_token": "etok"}))
        router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(return_value=httpx.Response(500))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.get("https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search").mock(return_value=httpx.Response(200, json={"itemSales": []}))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None
        router.post("https://api.ebay.com/identity/v1/oauth2/token").mock(side_effect=httpx.ConnectError("ebay err"))
        assert lookup_ebay_sold_comps("ASE", "cid", "csec") is None

        # Pokemon TCG fallback & cache & exception
        router.get("https://api.pokemontcg.io/v2/cards").mock(
            side_effect=[httpx.Response(200, json={"data": []}), httpx.Response(200, json={"data": []})]
        )
        assert lookup_pokemon_tcg_card("Mew", set_name="Fossil", card_number="8/62", api_key="pk") is None
        assert lookup_pokemon_tcg_card("Mew", set_name="Fossil", card_number="8/62", api_key="pk") is None  # cache False
        router.get("https://api.pokemontcg.io/v2/cards").mock(side_effect=httpx.ConnectError("ptcg down"))
        assert lookup_pokemon_tcg_card("Lugia") is None

        # Scryfall etched, error obj, cache, bad price
        router.get("https://api.scryfall.com/cards/named").mock(
            return_value=httpx.Response(200, json={"object": "error"})
        )
        assert lookup_scryfall_card("Unknown Card") is None
        assert lookup_scryfall_card("Unknown Card") is None  # cache hit
        router.get("https://api.scryfall.com/cards/named").mock(
            return_value=httpx.Response(200, json={"id": "sc1", "name": "Sol Ring", "prices": {"usd_etched": "bad", "usd": "2.00"}})
        )
        sc = lookup_scryfall_card("Sol Ring", set_code="CMR", card_finish="Etched")
        assert sc is not None and sc["source"] == "SCRYFALL"
        router.get("https://api.scryfall.com/cards/named").mock(
            return_value=httpx.Response(200, json={"id": "sc2", "name": "Arcane Signet", "prices": {"usd_foil": "4.50"}})
        )
        assert lookup_scryfall_card("Arcane Signet", card_finish="Foil")["market_value"] == "4.50"
        router.get("https://api.scryfall.com/cards/named").mock(side_effect=httpx.ConnectError("sc down"))
        assert lookup_scryfall_card("Fail Card") is None

        # PriceCharting grades PSA 9, BGS 10/9.5, CGC 10, SGC 10, TAG 10, OTHER, 0 price, empty, cache, error
        router.get("https://www.pricecharting.com/api/products").mock(return_value=httpx.Response(200, json={"products": []}))
        assert lookup_pricecharting_card("EmptyProd", api_key="pc") is None
        assert lookup_pricecharting_card("EmptyProd", api_key="pc") is None  # cached
        prod_row = {
            "id": "p1",
            "psa-9-price": 5000,
            "bgs-10-price": 9000,
            "cgc-10-price": 7500,
            "sgc-10-price": 6500,
            "tag-10-price": 7000,
            "graded-price": 4000,
            "loose-price": 1500,
        }
        router.get("https://www.pricecharting.com/api/products").mock(return_value=httpx.Response(200, json={"products": [prod_row]}))
        for svc, gr, exp in [("PSA", "9", "50.00"), ("BGS", "10", "90.00"), ("CGC", "10", "75.00"), ("SGC", "10", "65.00"), ("TAG", "10", "70.00"), ("OTHER", "8", "40.00"), ("NONE", "", "15.00")]:
            assert lookup_pricecharting_card("Card", grading_service=svc, grade=gr, api_key="pc")["market_value"] == exp
        router.get("https://www.pricecharting.com/api/products").mock(return_value=httpx.Response(200, json={"products": [{"id": "zero"}]}))
        assert lookup_pricecharting_card("ZeroCard", api_key="pc") is None
        router.get("https://www.pricecharting.com/api/products").mock(side_effect=httpx.ConnectError("pc down"))
        assert lookup_pricecharting_card("ErrCard", api_key="pc") is None

        # TCGplayer token failure, cache, empty results, missing id, bad pricing, error
        router.post("https://api.tcgplayer.com/token").mock(side_effect=httpx.ConnectError("tok down"))
        assert _get_tcgplayer_token("badcid", "sec") is None
        assert lookup_tcgplayer_price("Charizard", client_id="badcid", client_secret="sec") is None
        router.post("https://api.tcgplayer.com/token").mock(return_value=httpx.Response(200, json={"access_token": "ttok", "expires_in": 3600}))
        router.get("https://api.tcgplayer.com/catalog/products").mock(return_value=httpx.Response(200, json={"results": []}))
        assert lookup_tcgplayer_price("NoneTcg", client_id="goodcid", client_secret="sec") is None
        assert lookup_tcgplayer_price("NoneTcg", client_id="goodcid", client_secret="sec") is None  # cached
        router.get("https://api.tcgplayer.com/catalog/products").mock(return_value=httpx.Response(200, json={"results": [{}]}))
        assert lookup_tcgplayer_price("NoIdTcg", client_id="goodcid", client_secret="sec") is None
        router.get("https://api.tcgplayer.com/catalog/products").mock(return_value=httpx.Response(200, json={"results": [{"productId": 10}]}))
        router.get("https://api.tcgplayer.com/pricing/product/10").mock(return_value=httpx.Response(200, json={"results": []}))
        assert lookup_tcgplayer_price("NoPriceTcg", client_id="goodcid", client_secret="sec") is None
        router.get("https://api.tcgplayer.com/pricing/product/10").mock(return_value=httpx.Response(200, json={"results": [{"productId": 10}]}))
        assert lookup_tcgplayer_price("NullMarketTcg", client_id="goodcid", client_secret="sec") is None
        router.get("https://api.tcgplayer.com/catalog/products").mock(side_effect=httpx.ConnectError("tcg err"))
        assert lookup_tcgplayer_price("ErrTcg", client_id="goodcid", client_secret="sec") is None

        # Collectr empty, null price, cache, error
        router.get("https://api.getcollectr.com/v1/cards/search").mock(return_value=httpx.Response(200, json={"results": []}))
        assert lookup_collectr_price("MissingCol", api_key="ck") is None
        assert lookup_collectr_price("MissingCol", api_key="ck") is None  # cached
        router.get("https://api.getcollectr.com/v1/cards/search").mock(return_value=httpx.Response(200, json={"results": [{"id": "c1"}]}))
        assert lookup_collectr_price("NullPriceCol", api_key="ck") is None
        router.get("https://api.getcollectr.com/v1/cards/search").mock(side_effect=httpx.ConnectError("col err"))
        assert lookup_collectr_price("ErrCol", api_key="ck") is None

