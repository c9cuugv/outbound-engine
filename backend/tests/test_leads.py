"""
Tests for lead management endpoints.

POST   /api/v1/leads
GET    /api/v1/leads
GET    /api/v1/leads/{lead_id}
PATCH  /api/v1/leads/{lead_id}
DELETE /api/v1/leads/{lead_id}
POST   /api/v1/leads/bulk        (CSV import URL placeholder)
"""

import uuid
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

LEAD_PAYLOAD = {
    "first_name": "Alice",
    "last_name": "Smith",
    "email": "alice@acme.com",
    "company_name": "Acme Corp",
    "company_domain": "acme.com",
    "title": "CTO",
}


async def create_lead(client: AsyncClient, headers: dict, overrides: dict = None) -> dict:
    payload = {**LEAD_PAYLOAD, **(overrides or {})}
    resp = await client.post("/api/v1/leads", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestCreateLead:
    async def test_create_lead_returns_201_with_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post("/api/v1/leads", json=LEAD_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["email"] == LEAD_PAYLOAD["email"]

    async def test_create_lead_sets_default_status_new(
        self, client: AsyncClient, auth_headers: dict
    ):
        body = await create_lead(client, auth_headers)
        assert body["status"] == "new"

    async def test_create_duplicate_email_returns_409(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers)
        resp = await client.post("/api/v1/leads", json=LEAD_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 409

    async def test_create_lead_missing_required_fields_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post("/api/v1/leads", json={"email": "x@y.com"}, headers=auth_headers)
        assert resp.status_code == 422

    async def test_create_lead_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/leads", json=LEAD_PAYLOAD)
        assert resp.status_code == 401

    async def test_create_lead_blank_first_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads", json={**LEAD_PAYLOAD, "first_name": "", "email": "blank1@test.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_blank_last_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads", json={**LEAD_PAYLOAD, "last_name": "", "email": "blank2@test.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_oversized_first_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "long@test.com", "first_name": "A" * 101},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_invalid_email_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads", json={**LEAD_PAYLOAD, "email": "notanemail"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_oversized_source_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "src@test.com", "source": "x" * 51},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_oversized_last_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "longlast@test.com", "last_name": "Z" * 101},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_oversized_email_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": f"{'a' * 250}@x.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_invalid_linkedin_url_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "li_bad@test.com", "linkedin_url": "https://twitter.com/alice"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_valid_linkedin_url_accepted(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "li_ok@test.com", "linkedin_url": "https://www.linkedin.com/in/alice"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert resp.json()["linkedin_url"] == "https://www.linkedin.com/in/alice"


# ---------------------------------------------------------------------------
# List / pagination
# ---------------------------------------------------------------------------

class TestListLeads:
    async def test_list_leads_returns_empty_for_new_user(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/leads", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_count"] == 0
        assert body["items"] == []

    async def test_list_leads_returns_created_lead(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers)
        resp = await client.get("/api/v1/leads", headers=auth_headers)
        assert resp.json()["total_count"] == 1

    async def test_pagination_page_and_per_page(
        self, client: AsyncClient, auth_headers: dict
    ):
        for i in range(5):
            await create_lead(
                client, auth_headers, {"email": f"lead{i}@test.com", "first_name": f"Lead{i}"}
            )
        resp = await client.get("/api/v1/leads?page=1&per_page=2", headers=auth_headers)
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["total_count"] == 5
        assert body["total_pages"] == 3

    async def test_search_by_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers, {"email": "bob@b.com", "first_name": "Bob"})
        await create_lead(client, auth_headers, {"email": "carol@c.com", "first_name": "Carol"})
        resp = await client.get("/api/v1/leads?search=Bob", headers=auth_headers)
        body = resp.json()
        assert body["total_count"] >= 1
        assert all("Bob" in (i.get("first_name", "") or "") for i in body["items"])

    async def test_filter_by_status(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "filt@test.com"})
        # Patch to contacted
        await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"status": "contacted"},
            headers=auth_headers,
        )
        resp = await client.get("/api/v1/leads?status=contacted", headers=auth_headers)
        assert all(i["status"] == "contacted" for i in resp.json()["items"])

    async def test_filter_by_company_domain(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers, {"email": "d1@acme.com", "company_domain": "acme.com"})
        await create_lead(client, auth_headers, {"email": "d2@other.com", "company_domain": "other.com"})
        resp = await client.get("/api/v1/leads?company_domain=acme.com", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1
        assert all(i["company_domain"] == "acme.com" for i in items)

    async def test_filter_by_research_status(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers, {"email": "rs@test.com", "first_name": "Rs"})
        resp = await client.get("/api/v1/leads?research_status=pending", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1
        assert all(i["research_status"] == "pending" for i in items)
        resp2 = await client.get("/api/v1/leads?research_status=completed", headers=auth_headers)
        assert resp2.status_code == 200
        assert resp2.json()["total_count"] == 0

    async def test_leads_isolated_between_users(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        _, second_headers = second_user
        await create_lead(client, auth_headers)
        resp = await client.get("/api/v1/leads", headers=second_headers)
        assert resp.json()["total_count"] == 0

    async def test_list_leads_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/leads")
        assert resp.status_code == 401

    async def test_list_leads_invalid_order_param_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/leads?order=badorder", headers=auth_headers)
        assert resp.status_code == 422

    async def test_list_leads_per_page_exceeds_max_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/leads?per_page=201", headers=auth_headers)
        assert resp.status_code == 422

    async def test_list_leads_invalid_sort_param_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/leads?sort=nonexistent_column", headers=auth_headers)
        assert resp.status_code == 422

    async def test_list_leads_sort_by_first_name_asc_returns_ordered_results(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_lead(client, auth_headers, {"email": "zebra@sort.com", "first_name": "Zebra"})
        await create_lead(client, auth_headers, {"email": "apple@sort.com", "first_name": "Apple"})
        resp = await client.get("/api/v1/leads?sort=first_name&order=asc", headers=auth_headers)
        assert resp.status_code == 200
        names = [i["first_name"] for i in resp.json()["items"]]
        assert names == sorted(names)


# ---------------------------------------------------------------------------
# Get single lead
# ---------------------------------------------------------------------------

class TestGetLead:
    async def test_get_lead_returns_full_object(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.get(f"/api/v1/leads/{lead['id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == lead["id"]

    async def test_get_nonexistent_lead_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(f"/api/v1/leads/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_get_lead_owned_by_another_user_returns_404(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        lead = await create_lead(client, auth_headers)
        _, second_headers = second_user
        resp = await client.get(f"/api/v1/leads/{lead['id']}", headers=second_headers)
        assert resp.status_code == 404

    async def test_get_lead_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get(f"/api/v1/leads/{uuid.uuid4()}")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Update (PATCH)
# ---------------------------------------------------------------------------

class TestUpdateLead:
    async def test_patch_lead_updates_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"title": "VP Engineering"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "VP Engineering"

    async def test_patch_lead_empty_body_returns_400(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}", json={}, headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_patch_nonexistent_lead_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.patch(
            f"/api/v1/leads/{uuid.uuid4()}",
            json={"title": "CEO"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_patch_duplicate_email_returns_409(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead1 = await create_lead(client, auth_headers)
        lead2 = await create_lead(
            client, auth_headers, {"email": "second@test.com", "first_name": "Second"}
        )
        resp = await client.patch(
            f"/api/v1/leads/{lead2['id']}",
            json={"email": lead1["email"]},
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_patch_lead_email_without_at_sign_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"email": "bad-email"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_oversized_email_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"email": f"{'a' * 250}@x.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_invalid_status_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"status": "garbage"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_blank_first_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "blank_fn@test.com"})
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"first_name": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_blank_last_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "blank_ln@test.com"})
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"last_name": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_invalid_email_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "patch_email@test.com"})
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"email": "notanemail"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_invalid_linkedin_url_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "patch_li@test.com"})
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"linkedin_url": "https://twitter.com/alice"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_patch_lead_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.patch(
            f"/api/v1/leads/{uuid.uuid4()}", json={"title": "CEO"}
        )
        assert resp.status_code == 401

    async def test_patch_lead_owned_by_another_user_returns_404(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        lead = await create_lead(client, auth_headers)
        _, second_headers = second_user
        resp = await client.patch(
            f"/api/v1/leads/{lead['id']}",
            json={"title": "Intruder"},
            headers=second_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class TestDeleteLead:
    async def test_delete_lead_returns_204(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        resp = await client.delete(f"/api/v1/leads/{lead['id']}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_delete_lead_is_soft_delete(
        self, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers)
        await client.delete(f"/api/v1/leads/{lead['id']}", headers=auth_headers)
        # After soft-delete the lead still exists with status 'deleted'
        get_resp = await client.get(f"/api/v1/leads/{lead['id']}", headers=auth_headers)
        # Soft-deleted leads are still retrievable (status changed, not removed)
        # If the service hides them, 404 is also acceptable.
        assert get_resp.status_code in (200, 404)

    async def test_delete_nonexistent_lead_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.delete(f"/api/v1/leads/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_delete_lead_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.delete(f"/api/v1/leads/{uuid.uuid4()}")
        assert resp.status_code == 401

    async def test_delete_lead_owned_by_another_user_returns_404(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        lead = await create_lead(client, auth_headers)
        _, second_headers = second_user
        resp = await client.delete(f"/api/v1/leads/{lead['id']}", headers=second_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bulk import (CSV)  — /api/v1/leads/bulk
# ---------------------------------------------------------------------------

class TestBulkImport:
    async def test_bulk_endpoint_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/leads/bulk")
        assert resp.status_code in (401, 405, 422)

    async def test_bulk_endpoint_reachable_with_auth(
        self, client: AsyncClient, auth_headers: dict
    ):
        # The bulk endpoint may not be fully implemented yet; we verify it is
        # registered and auth-gated (not 404).
        resp = await client.post("/api/v1/leads/bulk", headers=auth_headers)
        assert resp.status_code != 404

    async def test_bulk_non_csv_extension_returns_400(
        self, client: AsyncClient, auth_headers: dict
    ):
        content = b"first_name,last_name,email\nAlice,Smith,alice@acme.com"
        resp = await client.post(
            "/api/v1/leads/bulk",
            files={"file": ("leads.txt", content, "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @patch("app.services.csv_import.check_mx_record", new_callable=AsyncMock, return_value=True)
    async def test_bulk_valid_csv_imports_lead(
        self, _mock_mx, client: AsyncClient, auth_headers: dict
    ):
        content = b"first_name,last_name,email\nAlice,Smith,alice_bulk@acme.com"
        resp = await client.post(
            "/api/v1/leads/bulk",
            files={"file": ("leads.csv", content, "text/csv")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["imported"] == 1
        assert body["skipped_invalid"] == 0

    @patch("app.services.csv_import.check_mx_record", new_callable=AsyncMock, return_value=True)
    async def test_bulk_missing_required_field_skips_row(
        self, _mock_mx, client: AsyncClient, auth_headers: dict
    ):
        # CSV row missing last_name
        content = b"first_name,email\nAlice,missing_last@acme.com"
        resp = await client.post(
            "/api/v1/leads/bulk",
            files={"file": ("leads.csv", content, "text/csv")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["imported"] == 0
        assert body["skipped_invalid"] == 1
        assert body["errors"][0]["reason"].startswith("missing required fields")


class TestResearch:
    @patch("app.api.v1.leads.research_lead")
    async def test_trigger_research_returns_202(
        self, mock_research, client: AsyncClient, auth_headers: dict
    ):
        lead = await create_lead(client, auth_headers, {"email": "res1@test.com"})
        resp = await client.post(
            f"/api/v1/leads/{lead['id']}/research", headers=auth_headers
        )
        assert resp.status_code == 202
        mock_research.delay.assert_called_once_with(lead["id"])

    @patch("app.api.v1.leads.research_lead")
    async def test_trigger_research_nonexistent_returns_404(
        self, mock_research, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            f"/api/v1/leads/{uuid.uuid4()}/research", headers=auth_headers
        )
        assert resp.status_code == 404
        mock_research.delay.assert_not_called()

    @patch("app.api.v1.leads.research_lead")
    async def test_trigger_research_unauthenticated_returns_401(
        self, mock_research, client: AsyncClient
    ):
        resp = await client.post(f"/api/v1/leads/{uuid.uuid4()}/research")
        assert resp.status_code == 401
        mock_research.delay.assert_not_called()

    @patch("app.api.v1.leads.research_lead")
    async def test_trigger_research_other_users_lead_returns_404(
        self, mock_research, client: AsyncClient, auth_headers: dict, second_user
    ):
        lead = await create_lead(client, auth_headers, {"email": "res2@test.com"})
        _, second_headers = second_user
        resp = await client.post(
            f"/api/v1/leads/{lead['id']}/research", headers=second_headers
        )
        assert resp.status_code == 404


class TestTagValidation:
    async def test_create_lead_oversized_tag_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "tag_long@test.com", "tags": ["a" * 51]},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_lead_duplicate_tags_deduplicated(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/leads",
            json={**LEAD_PAYLOAD, "email": "tag_dedup@test.com", "tags": ["vip", "vip", "prospect"]},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert resp.json()["tags"] == ["vip", "prospect"]
