import pytest
import asyncio
from contextlib import asynccontextmanager
import json
import uuid

from app.models.lead import Lead
from app.models.generated_email import GeneratedEmail
from app.models.campaign import Campaign
from app.models.template import EmailTemplate
from app.ai.graphs.reply_graph import build_reply_graph

class MockProvider:
    def __init__(self, responses):
        self.responses = responses
        self.call_count = 0

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        if self.call_count < len(self.responses):
            resp = self.responses[self.call_count]
        else:
            resp = self.responses[-1]
        self.call_count += 1
        return resp

@pytest.mark.asyncio
async def test_reply_graph_happy_path_interested(db_session, monkeypatch):
    owner_id = uuid.uuid4()
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="reply@example.com", owner_id=owner_id)
    campaign_id = uuid.uuid4()
    campaign = Campaign(id=campaign_id, owner_id=owner_id, name="Test")
    template_id = uuid.uuid4()
    template = EmailTemplate(id=template_id, owner_id=owner_id, name="Test", sequence_position=1, generation_prompt="Test")
    
    gen_email = GeneratedEmail(
        id=uuid.uuid4(),
        lead_id=lead_id,
        campaign_id=campaign_id,
        template_id=template_id,
        sequence_position=1,
        subject="Test",
        body="Test",
        body_original="Test"
    )
    
    db_session.add_all([lead, campaign, template, gen_email])
    await db_session.commit()
    
    provider = MockProvider([
        json.dumps({
            "sentiment": "interested",
            "confidence": 0.9,
            "reasoning": "They said yes"
        })
    ])
    monkeypatch.setattr("app.ai.graphs.reply_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_reply_graph()
    state = await graph.ainvoke({
        "raw_email": {
            "from": "reply@example.com",
            "subject": "Re: Test",
            "body": "Yes I am interested",
            "in_reply_to": "123",
            "message_id": "456"
        }
    }, config={"configurable": {"thread_id": "1", "db_session_factory": db_session_factory}})
    
    assert state.get("action_taken") == "flagged"
    await db_session.refresh(lead)
    assert lead.status == "needs_followup"


@pytest.mark.asyncio
async def test_reply_graph_unmatched(db_session, monkeypatch):
    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_reply_graph()
    state = await graph.ainvoke({
        "raw_email": {
            "from": "nobody@example.com",
            "subject": "Re: Test",
            "body": "Yes I am interested",
            "in_reply_to": "123",
            "message_id": "456"
        }
    }, config={"configurable": {"thread_id": "2", "db_session_factory": db_session_factory}})
    
    assert state.get("matched_email_id") is None
    assert state.get("action_taken") is None


@pytest.mark.asyncio
async def test_reply_graph_unsubscribe(db_session, monkeypatch):
    owner_id = uuid.uuid4()
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="reply3@example.com", owner_id=owner_id)
    campaign_id = uuid.uuid4()
    campaign = Campaign(id=campaign_id, owner_id=owner_id, name="Test")
    template_id = uuid.uuid4()
    template = EmailTemplate(id=template_id, owner_id=owner_id, name="Test", sequence_position=1, generation_prompt="Test")
    
    gen_email = GeneratedEmail(
        id=uuid.uuid4(),
        lead_id=lead_id,
        campaign_id=campaign_id,
        template_id=template_id,
        sequence_position=1,
        subject="Test",
        body="Test",
        body_original="Test"
    )
    
    db_session.add_all([lead, campaign, template, gen_email])
    await db_session.commit()
    
    provider = MockProvider([
        json.dumps({
            "sentiment": "unsubscribe",
            "confidence": 0.9,
            "reasoning": "They said stop"
        })
    ])
    monkeypatch.setattr("app.ai.graphs.reply_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_reply_graph()
    state = await graph.ainvoke({
        "raw_email": {
            "from": "reply3@example.com",
            "subject": "Re: Test",
            "body": "Stop emailing me",
            "in_reply_to": "123",
            "message_id": "456"
        }
    }, config={"configurable": {"thread_id": "3", "db_session_factory": db_session_factory}})
    
    assert state.get("action_taken") == "cancelled_sequence"
