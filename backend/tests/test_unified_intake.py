from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

import apps.valuation.services  # noqa: F401
from apps.catalog.models import CollectionItem


@pytest.mark.django_db
def test_camera_intake_cleans_title_and_queues_appraisal(api_client, user_a):
    _, _, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    fake_job = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")

    with patch("apps.valuation.services.start_appraisal_job", return_value=fake_job) as mock_start:
        resp = api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps(
                {
                    "title": "  1921   morgan  dollar !!  ",
                    "item_type": "COIN",
                    "metal": "SILVER",
                    "year": "1921",
                    "mint_mark": "S",
                    "intake_source": "CAMERA",
                    "photo_verification_status": "VERIFIED",
                    "photo_verification_notes": [],
                    "auto_appraise": True,
                }
            ),
            content_type="application/json",
            **headers,
        )

    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["title"] == "1921 Morgan Dollar"
    assert data["intake_source"] == "CAMERA"
    assert data["photo_verification_status"] == "VERIFIED"
    assert data["appraisal_job_id"] == "11111111-1111-1111-1111-111111111111"
    mock_start.assert_called_once()


@pytest.mark.django_db
def test_upload_intake_persists_override_and_notes(api_client, user_a):
    _, _, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    fake_job = SimpleNamespace(id="22222222-2222-2222-2222-222222222222")

    with patch("apps.valuation.services.start_appraisal_job", return_value=fake_job) as mock_start:
        resp = api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps(
                {
                    "title": "2024 american silver eagle",
                    "item_type": "COIN",
                    "metal": "SILVER",
                    "year": "2024",
                    "intake_source": "UPLOAD",
                    "photo_verification_status": "OVERRIDDEN",
                    "photo_verification_notes": ["Image resolution is low (320x240px)."],
                    "auto_appraise": True,
                }
            ),
            content_type="application/json",
            **headers,
        )

    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["title"] == "2024 American Silver Eagle"
    assert data["intake_source"] == "UPLOAD"
    assert data["photo_verification_status"] == "OVERRIDDEN"
    assert data["photo_verification_notes"] == ["Image resolution is low (320x240px)."]
    assert data["appraisal_job_id"] == "22222222-2222-2222-2222-222222222222"
    mock_start.assert_called_once()


@pytest.mark.django_db
def test_csv_import_cleans_titles_and_queues_background_appraisals(api_client, user_a):
    _, workspace, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    csv_bytes = (
        b"Title,Item Type,Metal,Weight,Unit,Year,Mint Mark\n"
        b"1921   morgan dollar,COIN,SILVER,1,OZ_T,1921,D\n"
        b"2023 silver maple leaf,COIN,SILVER,1,OZ_T,2023,\n"
    )
    upload = SimpleUploadedFile("stack.csv", csv_bytes, content_type="text/csv")

    with patch("apps.catalog.importer._enqueue_csv_batch_appraisals") as mock_enqueue:
        resp = api_client.post(
            "/api/v1/catalog/items/import/mapped",
            data={"file": upload, "mapping": ""},
            **headers,
        )

    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["created_count"] == 2
    assert data["queued_appraisals"] == 2
    mock_enqueue.assert_called_once()

    items = list(CollectionItem.objects.filter(workspace=workspace).order_by("created_at"))
    assert len(items) == 2
    assert items[0].title == "1921 Morgan Dollar"
    assert items[0].intake_source == CollectionItem.IntakeSource.CSV
    assert items[1].title == "2023 Silver Maple Leaf"
    assert items[1].intake_source == CollectionItem.IntakeSource.CSV
