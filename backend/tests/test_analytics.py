"""
Tests for campaign analytics endpoints.

GET  /api/v1/campaigns/{campaign_id}/analytics
GET  /api/v1/campaigns/{campaign_id}/leads/{lead_id}/timeline
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
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
