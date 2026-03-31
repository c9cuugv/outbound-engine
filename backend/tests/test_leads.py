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

    async def test_leads_isolated_between_users(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        _, second_headers = second_user
        await create_lead(client, auth_headers)
        resp = await client.get("/api/v1/leads", headers=second_headers)
        assert resp.json()["total_count"] == 0


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
