from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from apps.accounts.models import ProviderCredential, User, Workspace
from apps.catalog.auto_sort import (
    classify_and_save_item,
    classify_item_deterministic,
    enqueue_item_auto_sort,
    enqueue_workspace_resort,
)
from apps.catalog.models import CollectionItem


@pytest.fixture
def workspace(db):
    user = User.objects.create_user(email="sorter@example.com", password="pw")
    return Workspace.objects.create(name="Sort Lab", slug="sort-lab", owner=user)


def test_deterministic_coins_country_and_ancient(workspace):
    us_coin = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="1921 Morgan Dollar",
        country="USA",
    )
    res = classify_item_deterministic(us_coin)
    assert res.sort_category == "COIN"
    assert res.sort_subcategory == "United States"

    mx_coin = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="2023 Silver Libertad 1 oz",
        country="mex",
    )
    res_mx = classify_item_deterministic(mx_coin)
    assert res_mx.sort_category == "COIN"
    assert res_mx.sort_subcategory == "Mexico"

    ancient_coin = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="Julius Caesar Denarius",
        country="Roman Republic",
        year="44 BC",
    )
    res_anc = classify_item_deterministic(ancient_coin)
    assert res_anc.sort_category == "COIN"
    assert res_anc.sort_subcategory == "Ancient"


def test_deterministic_slabs_map_to_underlying_type(workspace):
    coin_slab = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.SLAB,
        grading_service=CollectionItem.GradingService.PCGS,
        title="2021-W American Silver Eagle MS70",
    )
    res_coin = classify_item_deterministic(coin_slab)
    assert res_coin.sort_category == "COIN"
    assert res_coin.sort_subcategory == "United States"

    paper_slab = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.SLAB,
        grading_service=CollectionItem.GradingService.PMG,
        title="1923 $1 Silver Certificate Horse Blanket",
        country="US",
    )
    res_paper = classify_item_deterministic(paper_slab)
    assert res_paper.sort_category == "PAPER"
    assert res_paper.sort_subcategory == "United States"


def test_deterministic_bars_and_rounds_by_mint_or_pourer(workspace):
    geiger = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.BAR,
        title="100g Silver Square",
        mint_or_refiner="Geiger",
    )
    assert classify_item_deterministic(geiger).sort_subcategory == "Geiger Edelmetalle"

    engelhard = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.BAR,
        title="10 oz Engelhard Poured Loaf Bar",
    )
    assert classify_item_deterministic(engelhard).sort_subcategory == "Engelhard"

    poured = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.BAR,
        title="5 oz Hand Poured Silver Ripple Bar",
    )
    assert classify_item_deterministic(poured).sort_subcategory == "Hand-Poured"

    boutique = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.BAR,
        title="2 oz Silver Bar",
        mint_or_refiner="Bison Bullion",
    )
    assert classify_item_deterministic(boutique).sort_subcategory == "Bison Bullion"


def test_uncategorized_fallback(workspace):
    mystery = CollectionItem(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="Unidentified Token",
    )
    res = classify_item_deterministic(mystery)
    assert res.sort_category == "COIN"
    assert res.sort_subcategory == "Uncategorized"


@pytest.mark.django_db
def test_local_ollama_fallback_and_override_protection(workspace):
    cred = ProviderCredential(
        workspace=workspace,
        provider=ProviderCredential.Provider.OLLAMA_URL,
    )
    cred.set_secret("http://localhost:11434")
    cred.save()

    item = CollectionItem.objects.create(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="1798 8 Reales",
    )

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"response": '{"subcategory": "Mexico"}'}
    mock_resp.raise_for_status.return_value = None

    with patch("apps.catalog.auto_sort.httpx.Client") as mock_client_cls:
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_client.post.return_value = mock_resp
        updated = classify_and_save_item(item.id, use_ollama=True)

    assert updated is True
    item.refresh_from_db()
    assert item.sort_category == "COIN"
    assert item.sort_subcategory == "Mexico"

    # Manual override must not be overwritten
    item.sort_subcategory = "Spanish Colonial"
    item.sort_override = True
    item.save()

    assert classify_and_save_item(item.id, use_ollama=True) is False
    item.refresh_from_db()
    assert item.sort_subcategory == "Spanish Colonial"


@pytest.mark.django_db
def test_enqueue_respects_workspace_setting_and_resort(workspace, django_capture_on_commit_callbacks):
    workspace.auto_sort_enabled = False
    workspace.save()

    item_disabled = CollectionItem.objects.create(
        workspace=workspace,
        category=CollectionItem.Category.COIN,
        title="2020 American Silver Eagle",
    )
    with patch("apps.catalog.auto_sort._dispatch_background") as mock_dispatch:
        with django_capture_on_commit_callbacks(execute=True):
            enqueue_item_auto_sort(item_disabled)
        mock_dispatch.assert_not_called()

    workspace.auto_sort_enabled = True
    workspace.save()

    with patch("apps.catalog.auto_sort._dispatch_background") as mock_dispatch:
        with django_capture_on_commit_callbacks(execute=True):
            enqueue_item_auto_sort(item_disabled)
        mock_dispatch.assert_called_once()

    pinned = CollectionItem.objects.create(
        workspace=workspace,
        category=CollectionItem.Category.BAR,
        title="10 oz Geiger Bar",
        sort_category="BAR",
        sort_subcategory="Custom Vault",
        sort_override=True,
    )
    with patch("apps.catalog.auto_sort._dispatch_background") as mock_dispatch:
        with django_capture_on_commit_callbacks(execute=True):
            queued = enqueue_workspace_resort(workspace.id)
        assert queued == 1
        mock_dispatch.assert_called_once()
    assert pinned.sort_override is True


@pytest.mark.django_db
def test_workspace_settings_and_catalog_auto_sort_apis(api_client, user_a):
    _, ws_a, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    # 1. Workspace settings GET & PATCH auto_sort_enabled
    res = api_client.get("/api/v1/settings/workspace", **headers)
    assert res.status_code == 200
    assert res.json()["auto_sort_enabled"] is True

    res_patch = api_client.patch(
        "/api/v1/settings/workspace",
        data=json.dumps({"auto_sort_enabled": False}),
        content_type="application/json",
        **headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["auto_sort_enabled"] is False
    ws_a.refresh_from_db()
    assert ws_a.auto_sort_enabled is False

    # 2. Catalog items filtering by sort_category, sort_subcategory, graded
    slab = CollectionItem.objects.create(
        workspace=ws_a,
        category=CollectionItem.Category.SLAB,
        grading_service=CollectionItem.GradingService.PCGS,
        title="1921 Morgan Dollar",
        sort_category="COIN",
        sort_subcategory="United States",
    )
    raw_mx = CollectionItem.objects.create(
        workspace=ws_a,
        category=CollectionItem.Category.COIN,
        title="2022 Libertad",
        sort_category="COIN",
        sort_subcategory="Mexico",
    )

    list_graded = api_client.get("/api/v1/catalog/items?sort_category=COIN&graded=true", **headers)
    assert list_graded.status_code == 200
    graded_ids = [i["id"] for i in list_graded.json()]
    assert str(slab.id) in graded_ids
    assert str(raw_mx.id) not in graded_ids
    assert list_graded.json()[0]["is_graded"] is True

    list_mx = api_client.get(
        "/api/v1/catalog/items?sort_category=COIN&sort_subcategory=Mexico", **headers
    )
    assert list_mx.status_code == 200
    assert [i["id"] for i in list_mx.json()] == [str(raw_mx.id)]

    # 3. Manual override via PATCH & reset to auto-sort
    patch_item = api_client.patch(
        f"/api/v1/catalog/items/{raw_mx.id}",
        data=json.dumps({"sort_subcategory": "Custom Mexico"}),
        content_type="application/json",
        **headers,
    )
    assert patch_item.status_code == 200
    assert patch_item.json()["sort_subcategory"] == "Custom Mexico"
    assert patch_item.json()["sort_override"] is True

    # 4. On-demand resort skips pinned item (only 1 unpinned item: slab)
    with patch("apps.catalog.auto_sort._dispatch_background"):
        resort_res = api_client.post("/api/v1/catalog/items/resort", **headers)
    assert resort_res.status_code == 200
    assert resort_res.json()["queued_count"] == 1

    # Reset override
    reset_res = api_client.patch(
        f"/api/v1/catalog/items/{raw_mx.id}",
        data=json.dumps({"sort_override": False}),
        content_type="application/json",
        **headers,
    )
    assert reset_res.status_code == 200
    assert reset_res.json()["sort_override"] is False
