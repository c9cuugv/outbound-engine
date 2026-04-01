"""
Tests for campaign and template endpoints.

POST   /api/v1/campaigns
GET    /api/v1/campaigns
GET    /api/v1/campaigns/{id}
PATCH  /api/v1/campaigns/{id}

POST   /api/v1/templates
GET    /api/v1/templates
GET    /api/v1/templates/{id}
PATCH  /api/v1/templates/{id}
"""

import uuid
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

CAMPAIGN_PAYLOAD = {
    "name": "Q4 Outreach",
    "product_name": "TestProduct",
    "product_description": "A great product.",
    "sender_email": "sender@company.com",
    "sender_name": "Sales Rep",
}

TEMPLATE_PAYLOAD = {
    "name": "Follow-up template",
    "subject": "Quick follow-up",
    "body": "<p>Hi {{first_name}},</p><p>Just following up.</p>",
    "sequence_position": 1,
    "generation_prompt": "Write a short follow-up email.",
}


async def create_campaign(client: AsyncClient, headers: dict, overrides: dict = None) -> dict:
    payload = {**CAMPAIGN_PAYLOAD, **(overrides or {})}
    resp = await client.post("/api/v1/campaigns", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


async def create_template(client: AsyncClient, headers: dict, overrides: dict = None) -> dict:
    payload = {**TEMPLATE_PAYLOAD, **(overrides or {})}
    resp = await client.post("/api/v1/templates", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Create campaign
# ---------------------------------------------------------------------------

class TestCreateCampaign:
    async def test_create_campaign_returns_201(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post("/api/v1/campaigns", json=CAMPAIGN_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["name"] == CAMPAIGN_PAYLOAD["name"]

    async def test_new_campaign_has_draft_status(
        self, client: AsyncClient, auth_headers: dict
    ):
        body = await create_campaign(client, auth_headers)
        assert body["status"] == "draft"

    async def test_create_campaign_missing_name_returns_422(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/campaigns",
            json={"product_name": "P"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_create_campaign_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/campaigns", json=CAMPAIGN_PAYLOAD)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# List campaigns
# ---------------------------------------------------------------------------

class TestListCampaigns:
    async def test_list_returns_empty_initially(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/campaigns", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_returns_created_campaign(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_campaign(client, auth_headers)
        resp = await client.get("/api/v1/campaigns", headers=auth_headers)
        assert len(resp.json()) == 1

    async def test_campaigns_isolated_between_users(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        _, second_headers = second_user
        await create_campaign(client, auth_headers)
        resp = await client.get("/api/v1/campaigns", headers=second_headers)
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Get single campaign
# ---------------------------------------------------------------------------

class TestGetCampaign:
    async def test_get_campaign_returns_full_object(
        self, client: AsyncClient, auth_headers: dict
    ):
        campaign = await create_campaign(client, auth_headers)
        resp = await client.get(f"/api/v1/campaigns/{campaign['id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == campaign["id"]

    async def test_get_nonexistent_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(f"/api/v1/campaigns/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_get_campaign_owned_by_other_user_returns_404(
        self, client: AsyncClient, auth_headers: dict, second_user
    ):
        campaign = await create_campaign(client, auth_headers)
        _, second_headers = second_user
        resp = await client.get(
            f"/api/v1/campaigns/{campaign['id']}", headers=second_headers
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update campaign
# ---------------------------------------------------------------------------

class TestUpdateCampaign:
    async def test_patch_campaign_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        campaign = await create_campaign(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/campaigns/{campaign['id']}",
            json={"name": "Updated Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_patch_active_campaign_returns_400(
        self, client: AsyncClient, auth_headers: dict, db_session
    ):
        campaign = await create_campaign(client, auth_headers)
        # Force status to active directly in DB
        from sqlalchemy import update as sa_update
        from app.models.campaign import Campaign
        await db_session.execute(
            sa_update(Campaign)
            .where(Campaign.id == uuid.UUID(campaign["id"]))
            .values(status="active")
        )
        await db_session.commit()

        resp = await client.patch(
            f"/api/v1/campaigns/{campaign['id']}",
            json={"name": "Cannot update"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_patch_empty_body_returns_400(
        self, client: AsyncClient, auth_headers: dict
    ):
        campaign = await create_campaign(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/campaigns/{campaign['id']}", json={}, headers=auth_headers
        )
        assert resp.status_code == 400

    async def test_patch_nonexistent_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.patch(
            f"/api/v1/campaigns/{uuid.uuid4()}",
            json={"name": "X"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

class TestTemplates:
    async def test_create_template_returns_201(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post("/api/v1/templates", json=TEMPLATE_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201
        assert "id" in resp.json()

    async def test_list_templates_returns_created(
        self, client: AsyncClient, auth_headers: dict
    ):
        await create_template(client, auth_headers)
        resp = await client.get("/api/v1/templates", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_template_by_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        tmpl = await create_template(client, auth_headers)
        resp = await client.get(f"/api/v1/templates/{tmpl['id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == tmpl["id"]

    async def test_get_nonexistent_template_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(f"/api/v1/templates/{uuid.uuid4()}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_patch_template_subject(
        self, client: AsyncClient, auth_headers: dict
    ):
        tmpl = await create_template(client, auth_headers)
        resp = await client.patch(
            f"/api/v1/templates/{tmpl['id']}",
            json={"name": "Updated Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_create_template_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/templates", json=TEMPLATE_PAYLOAD)
        assert resp.status_code == 401
