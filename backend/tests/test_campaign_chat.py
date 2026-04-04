import pytest
from httpx import AsyncClient

from app.api.v1.campaign_chat import _extract_campaign_data


@pytest.mark.asyncio
async def test_chat_endpoint_exists(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/campaigns/chat",
        json={"messages": []},
        headers=auth_headers,
    )
    # Should not be 404
    assert resp.status_code != 404


def test_extract_campaign_data_valid():
    text = (
        'Got it! <CAMPAIGN_DATA>{"name":"Q1","product_name":"Tool",'
        '"product_description":"We help startups with AI outreach automation at scale today and save time",'
        '"icp_description":"SaaS founders","value_prop":"3x reply rates",'
        '"sequence_count":3,"tone":"professional-casual"}</CAMPAIGN_DATA>'
    )
    data = _extract_campaign_data(text)
    assert data["name"] == "Q1"
    assert data["product_name"] == "Tool"


def test_extract_campaign_data_none_when_missing():
    data = _extract_campaign_data("Just a normal AI response with no data block.")
    assert data is None
