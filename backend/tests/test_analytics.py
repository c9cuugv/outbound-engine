"""
Tests for campaign analytics endpoints.

GET  /api/v1/campaigns/{campaign_id}/analytics
GET  /api/v1/campaigns/{campaign_id}/leads/{lead_id}/timeline
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead

pytestmark = pytest.mark.asyncio

EXPECTED_ANALYTICS_KEYS = {"overview", "by_sequence_step", "by_day", "top_performing_subjects", "reply_sentiment_breakdown"}
EXPECTED_OVERVIEW_KEYS = {"total_leads", "emails_sent", "emails_opened", "emails_clicked", "emails_replied", "emails_bounced", "open_rate", "click_rate", "reply_rate", "bounce_rate"}


async def _seed_campaign(db_session: AsyncSession, user_id: uuid.UUID) -> Campaign:
    campaign = Campaign(owner_id=user_id, name="Analytics Test Campaign", status="draft")
    db_session.add(campaign)
    await db_session.commit()
    await db_session.refresh(campaign)
    return campaign


class TestCampaignAnalytics:
    async def test_get_analytics_returns_200_with_correct_structure(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = await _seed_campaign(db_session, user.id)

        resp = await client.get(f"/api/v1/campaigns/{campaign.id}/analytics", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        assert EXPECTED_ANALYTICS_KEYS == set(body.keys())
        assert EXPECTED_OVERVIEW_KEYS == set(body["overview"].keys())

    async def test_get_analytics_empty_campaign_returns_zero_rates(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = await _seed_campaign(db_session, user.id)

        resp = await client.get(f"/api/v1/campaigns/{campaign.id}/analytics", headers=auth_headers)

        assert resp.status_code == 200
        overview = resp.json()["overview"]
        assert overview["emails_sent"] == 0
        assert overview["open_rate"] == 0.0

    async def test_get_analytics_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get(f"/api/v1/campaigns/{uuid.uuid4()}/analytics")
        assert resp.status_code == 401

    async def test_get_analytics_unknown_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(f"/api/v1/campaigns/{uuid.uuid4()}/analytics", headers=auth_headers)
        assert resp.status_code == 404

    async def test_get_analytics_other_user_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, second_user
    ):
        other_user, second_headers = second_user
        campaign = await _seed_campaign(db_session, other_user.id)

        resp = await client.get(f"/api/v1/campaigns/{campaign.id}/analytics", headers=auth_headers)
        assert resp.status_code == 404

    async def test_get_analytics_with_sent_emails_returns_nonzero_open_rate(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = await _seed_campaign(db_session, user.id)
        # Analytics reads denormalized counters on Campaign — update them directly
        campaign.emails_sent = 2
        campaign.emails_opened = 1
        await db_session.commit()

        resp = await client.get(f"/api/v1/campaigns/{campaign.id}/analytics", headers=auth_headers)

        assert resp.status_code == 200
        overview = resp.json()["overview"]
        assert overview["emails_sent"] == 2
        assert overview["emails_opened"] == 1
        assert overview["open_rate"] == 0.5


async def _seed_lead(db_session: AsyncSession, user_id: uuid.UUID) -> Lead:
    lead = Lead(owner_id=user_id, email="timeline@test.com", first_name="Tim", last_name="Line")
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)
    return lead


class TestLeadTimeline:
    async def test_get_timeline_empty_returns_200_with_structure(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = await _seed_campaign(db_session, user.id)
        lead = await _seed_lead(db_session, user.id)

        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/leads/{lead.id}/timeline",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"lead_id", "campaign_id", "timeline"}
        assert body["timeline"] == []

    async def test_get_timeline_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get(
            f"/api/v1/campaigns/{uuid.uuid4()}/leads/{uuid.uuid4()}/timeline"
        )
        assert resp.status_code == 401

    async def test_get_timeline_unknown_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get(
            f"/api/v1/campaigns/{uuid.uuid4()}/leads/{uuid.uuid4()}/timeline",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_get_timeline_other_user_campaign_returns_404(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, second_user
    ):
        other_user, _ = second_user
        campaign = await _seed_campaign(db_session, other_user.id)

        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/leads/{uuid.uuid4()}/timeline",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_get_timeline_with_sent_email_returns_event_types_sorted(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, registered_user
    ):
        user, _ = registered_user
        campaign = await _seed_campaign(db_session, user.id)
        lead = await _seed_lead(db_session, user.id)

        now = datetime.now(timezone.utc)
        email = GeneratedEmail(
            campaign_id=campaign.id,
            lead_id=lead.id,
            template_id=uuid.uuid4(),
            sequence_position=1,
            subject="Hello Timeline",
            body="<p>Hi</p>",
            body_original="<p>Hi</p>",
            status="sent",
            opened_count=1,
            clicked_count=0,
            sent_at=now,
            opened_at=now,
        )
        db_session.add(email)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/campaigns/{campaign.id}/leads/{lead.id}/timeline",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        timeline = resp.json()["timeline"]
        event_types = [e["type"] for e in timeline]
        assert "email_generated" in event_types
        assert "email_sent" in event_types
        assert "email_opened" in event_types
        timestamps = [e["timestamp"] for e in timeline]
        assert timestamps == sorted(timestamps)
