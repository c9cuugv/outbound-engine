"""
Tests for campaign email review endpoints.

GET    /api/v1/campaigns/{id}/emails
GET    /api/v1/campaigns/{id}/emails/{email_id}
PATCH  /api/v1/campaigns/{id}/emails/{email_id}
POST   /api/v1/campaigns/{id}/emails/{email_id}/approve
POST   /api/v1/campaigns/{id}/emails/approve-all
POST   /api/v1/campaigns/{id}/emails/{email_id}/regenerate
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.generated_email import GeneratedEmail

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_campaign_and_email(
    db_session: AsyncSession, user_id: uuid.UUID
) -> tuple[Campaign, Lead, GeneratedEmail]:
    """Directly insert a campaign, lead, and draft email into the test DB."""
    campaign = Campaign(
        owner_id=user_id,
        name="Seed Campaign",
        status="draft",
    )
    db_session.add(campaign)
    await db_session.flush()

    lead = Lead(
        owner_id=user_id,
        first_name="Bob",
        last_name="Jones",
        email="bob@seed.com",
    )
    db_session.add(lead)
    await db_session.flush()

    email = GeneratedEmail(
        campaign_id=campaign.id,
        lead_id=lead.id,
        template_id=uuid.uuid4(),  # placeholder — no FK check in SQLite
        sequence_position=1,
        subject="Draft Subject",
        body="<p>Draft body content here.</p>",
        body_original="<p>Draft body content here.</p>",
        status="draft",
    )
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(campaign)
    await db_session.refresh(email)
    return campaign, lead, email


# ---------------------------------------------------------------------------
# List emails
# ---------------------------------------------------------------------------

class TestListCampaignEmails:
    async def test_list_emails_empty(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = Campaign(owner_id=user.id, name="Empty Camp", status="draft")
        db_session.add(campaign)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/emails", headers=auth_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["emails"] == {}

    async def test_list_emails_returns_grouped_by_lead(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, lead, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/emails", headers=auth_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert str(lead.id) in body["emails"]

    async def test_list_emails_for_nonexistent_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(
            f"/api/v1/campaigns/{uuid.uuid4()}/emails", headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_list_emails_unauth_returns_401(self, client: AsyncClient):
        resp = await client.get(f"/api/v1/campaigns/{uuid.uuid4()}/emails")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Get single email
# ---------------------------------------------------------------------------

class TestGetCampaignEmail:
    async def test_get_email_returns_email_and_lead_data(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, lead, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"]["id"] == str(email.id)
        assert body["lead"]["email"] == lead.email

    async def test_get_nonexistent_email_returns_404(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = Campaign(owner_id=user.id, name="C", status="draft")
        db_session.add(campaign)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/emails/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Edit email (PATCH)
# ---------------------------------------------------------------------------

class TestEditEmail:
    async def test_edit_subject_sets_was_manually_edited(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, _, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.patch(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}",
            json={"subject": "New Subject"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["was_manually_edited"] is True

    async def test_edit_body(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, _, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.patch(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}",
            json={"body": "<p>Updated content</p>"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_edit_nonexistent_email_returns_404(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = Campaign(owner_id=user.id, name="C", status="draft")
        db_session.add(campaign)
        await db_session.commit()
        resp = await client.patch(
            f"/api/v1/campaigns/{campaign.id}/emails/{uuid.uuid4()}",
            json={"subject": "X"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Approve single email
# ---------------------------------------------------------------------------

class TestApproveEmail:
    async def test_approve_draft_email_sets_status_approved(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, _, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    async def test_approve_already_approved_email_returns_400(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, _, email = await _seed_campaign_and_email(db_session, user.id)
        # Approve once
        await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}/approve",
            headers=auth_headers,
        )
        # Approve again — should fail
        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_approve_nonexistent_email_returns_404(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = Campaign(owner_id=user.id, name="C", status="draft")
        db_session.add(campaign)
        await db_session.commit()
        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{uuid.uuid4()}/approve",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Approve-all
# ---------------------------------------------------------------------------

class TestApproveAllEmails:
    async def test_approve_all_approves_all_drafts(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, lead, _ = await _seed_campaign_and_email(db_session, user.id)

        # Add a second draft email
        email2 = GeneratedEmail(
            campaign_id=campaign.id,
            lead_id=lead.id,
            template_id=uuid.uuid4(),
            sequence_position=2,
            subject="Follow-up",
            body="<p>Follow up.</p>",
            body_original="<p>Follow up.</p>",
            status="draft",
        )
        db_session.add(email2)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/approve-all",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["approved"] == 2
        assert body["skipped"] == 0

    async def test_approve_all_skips_non_drafts(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, lead, email = await _seed_campaign_and_email(db_session, user.id)

        # Force one email to 'sent' status
        email.status = "sent"
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/approve-all",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["approved"] == 0  # no drafts left

    async def test_approve_all_nonexistent_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            f"/api/v1/campaigns/{uuid.uuid4()}/emails/approve-all",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Regenerate
# ---------------------------------------------------------------------------

class TestRegenerateEmail:
    async def test_regenerate_email_updates_subject_and_resets_flags(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, _, email = await _seed_campaign_and_email(db_session, user.id)
        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{email.id}/regenerate",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["regenerated"] is True
        assert body["status"] == "draft"

    async def test_regenerate_nonexistent_email_returns_404(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = Campaign(owner_id=user.id, name="C", status="draft")
        db_session.add(campaign)
        await db_session.commit()
        resp = await client.post(
            f"/api/v1/campaigns/{campaign.id}/emails/{uuid.uuid4()}/regenerate",
            headers=auth_headers,
        )
        assert resp.status_code == 404
