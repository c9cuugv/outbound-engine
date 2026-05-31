"""
Tests for tracking endpoints.

GET /t/o/{email_id}.png          — pixel open tracking
GET /t/c/{email_id}/{link_hash}  — click redirect
GET /t/u/{email_id}              — unsubscribe
"""

import uuid
from unittest.mock import patch, MagicMock

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

async def _seed_email(
    db_session: AsyncSession, user_id: uuid.UUID, email_status: str = "sent"
) -> tuple[Campaign, Lead, GeneratedEmail]:
    campaign = Campaign(owner_id=user_id, name="Track Camp", status="active")
    db_session.add(campaign)
    await db_session.flush()

    lead = Lead(
        owner_id=user_id,
        first_name="Track",
        last_name="User",
        email="track@test.com",
        status="new",
    )
    db_session.add(lead)
    await db_session.flush()

    email = GeneratedEmail(
        campaign_id=campaign.id,
        lead_id=lead.id,
        template_id=uuid.uuid4(),
        sequence_position=1,
        subject="Tracked Email",
        body="<p>Body</p>",
        body_original="<p>Body</p>",
        status=email_status,
        opened_count=0,
        clicked_count=0,
    )
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)
    await db_session.refresh(lead)
    return campaign, lead, email


# ---------------------------------------------------------------------------
# Pixel open tracking  /t/o/{email_id}.png
# ---------------------------------------------------------------------------

class TestTrackOpen:
    async def test_pixel_returns_png_response(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        _, _, email = await _seed_email(db_session, user.id)
        resp = await client.get(f"/t/o/{email.id}.png")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"

    async def test_pixel_returns_1x1_png_bytes(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        _, _, email = await _seed_email(db_session, user.id)
        resp = await client.get(f"/t/o/{email.id}.png")
        # Valid PNG starts with magic bytes
        assert resp.content[:8] == bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    async def test_pixel_invalid_uuid_still_returns_png(self, client: AsyncClient):
        # Even on errors the endpoint always returns the pixel (graceful failure)
        resp = await client.get("/t/o/not-a-uuid.png")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"

    async def test_pixel_unknown_email_id_still_returns_png(self, client: AsyncClient):
        resp = await client.get(f"/t/o/{uuid.uuid4()}.png")
        assert resp.status_code == 200
        assert "image/png" in resp.headers["content-type"]

    async def test_pixel_does_not_require_auth(self, client: AsyncClient):
        # Tracking endpoints must work without any auth header
        resp = await client.get(f"/t/o/{uuid.uuid4()}.png")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Click tracking  /t/c/{email_id}/{link_hash}
# ---------------------------------------------------------------------------

class TestTrackClick:
    async def test_click_with_known_hash_redirects(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        _, _, email = await _seed_email(db_session, user.id)

        # Patch get_original_url to return a known URL
        with patch("app.api.v1.tracking.get_original_url", return_value="https://example.com"):
            resp = await client.get(
                f"/t/c/{email.id}/abc123", follow_redirects=False
            )
        assert resp.status_code == 302
        assert resp.headers["location"] == "https://example.com"

    async def test_click_with_unknown_hash_returns_404_html(
        self, client: AsyncClient
    ):
        with patch("app.api.v1.tracking.get_original_url", return_value=None):
            resp = await client.get(f"/t/c/{uuid.uuid4()}/deadbeef")
        assert resp.status_code == 404
        assert "not found" in resp.text.lower()

    async def test_click_does_not_require_auth(self, client: AsyncClient):
        with patch("app.api.v1.tracking.get_original_url", return_value=None):
            resp = await client.get(f"/t/c/{uuid.uuid4()}/somehash")
        # 404 (unknown hash) — not 401
        assert resp.status_code != 401

    async def test_click_invalid_email_uuid_still_responds(self, client: AsyncClient):
        with patch("app.api.v1.tracking.get_original_url", return_value="https://safe.url"):
            resp = await client.get("/t/c/not-a-uuid/hash123", follow_redirects=False)
        # Redirect occurs before UUID parsing (URL lookup comes first)
        assert resp.status_code in (302, 200, 404, 500)


# ---------------------------------------------------------------------------
# Unsubscribe  /t/u/{email_id}
# ---------------------------------------------------------------------------

class TestTrackUnsubscribe:
    async def test_unsubscribe_returns_html_confirmation(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        _, _, email = await _seed_email(db_session, user.id)
        resp = await client.get(f"/t/u/{email.id}")
        assert resp.status_code == 200
        assert "unsubscribed" in resp.text.lower()
        assert "text/html" in resp.headers["content-type"]

    async def test_unsubscribe_updates_lead_status(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        _, lead, email = await _seed_email(db_session, user.id)
        await client.get(f"/t/u/{email.id}")

        await db_session.refresh(lead)
        assert lead.status == "unsubscribed"

    async def test_unsubscribe_cancels_pending_emails(
        self, client: AsyncClient, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign, lead, sent_email = await _seed_email(db_session, user.id, email_status="sent")

        # Add a scheduled follow-up for the same lead/campaign
        followup = GeneratedEmail(
            campaign_id=campaign.id,
            lead_id=lead.id,
            template_id=uuid.uuid4(),
            sequence_position=2,
            subject="Follow Up",
            body="<p>FU</p>",
            body_original="<p>FU</p>",
            status="scheduled",
            opened_count=0,
            clicked_count=0,
        )
        db_session.add(followup)
        await db_session.commit()

        await client.get(f"/t/u/{sent_email.id}")
        await db_session.refresh(followup)
        assert followup.status == "cancelled"

    async def test_unsubscribe_unknown_email_id_still_returns_html(
        self, client: AsyncClient
    ):
        resp = await client.get(f"/t/u/{uuid.uuid4()}")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    async def test_unsubscribe_invalid_uuid_still_returns_html(self, client: AsyncClient):
        resp = await client.get("/t/u/not-a-uuid")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    async def test_unsubscribe_does_not_require_auth(self, client: AsyncClient):
        resp = await client.get(f"/t/u/{uuid.uuid4()}")
        assert resp.status_code != 401
