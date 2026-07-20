import pytest
import asyncio
from contextlib import asynccontextmanager
import json
import uuid

from app.models.lead import Lead
from app.models.campaign import Campaign
from app.models.template import EmailTemplate
from app.models.generated_email import GeneratedEmail
from app.ai.graphs.email_gen_graph import build_email_gen_graph

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
async def test_email_gen_graph_happy_path(db_session, monkeypatch):
    owner_id = uuid.uuid4()
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="j@e.com", owner_id=owner_id, 
                company_domain="e.com", research_status="completed")
    campaign_id = uuid.uuid4()
    campaign = Campaign(id=campaign_id, owner_id=owner_id, name="Test", product_name="P", product_description="D", icp_description="I", value_prop="V")
    template_id = uuid.uuid4()
    template = EmailTemplate(id=template_id, owner_id=owner_id, name="T", sequence_position=1, generation_prompt="Generate", max_word_count=100)
    
    db_session.add_all([lead, campaign, template])
    await db_session.commit()
    
    provider = MockProvider([
        json.dumps({
            "subject_options": ["Hi there"],
            "body": "This is a body that is long enough " * 5
        })
    ])
    monkeypatch.setattr("app.ai.graphs.email_gen_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_email_gen_graph()
    state = await graph.ainvoke({
        "campaign_id": str(campaign_id),
        "lead_id": str(lead_id),
        "template_id": str(template_id)
    }, config={"configurable": {"thread_id": "1", "db_session_factory": db_session_factory}})
    
    assert state.get("email_record_id") is not None


@pytest.mark.asyncio
async def test_email_gen_graph_no_research(db_session, monkeypatch):
    owner_id = uuid.uuid4()
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="j2@e.com", owner_id=owner_id, 
                company_domain="e.com", research_status="pending")
    campaign_id = uuid.uuid4()
    campaign = Campaign(id=campaign_id, owner_id=owner_id, name="Test", product_name="P", product_description="D", icp_description="I", value_prop="V")
    template_id = uuid.uuid4()
    template = EmailTemplate(id=template_id, owner_id=owner_id, name="T", sequence_position=1, generation_prompt="Generate", max_word_count=100)
    
    db_session.add_all([lead, campaign, template])
    await db_session.commit()

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_email_gen_graph()
    state = await graph.ainvoke({
        "campaign_id": str(campaign_id),
        "lead_id": str(lead_id),
        "template_id": str(template_id)
    }, config={"configurable": {"thread_id": "2", "db_session_factory": db_session_factory}})
    
    assert state.get("email_record_id") is None


@pytest.mark.asyncio
async def test_email_gen_graph_llm_validation_failure(db_session, monkeypatch):
    owner_id = uuid.uuid4()
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="j3@e.com", owner_id=owner_id, 
                company_domain="e.com", research_status="completed")
    campaign_id = uuid.uuid4()
    campaign = Campaign(id=campaign_id, owner_id=owner_id, name="Test", product_name="P", product_description="D", icp_description="I", value_prop="V")
    template_id = uuid.uuid4()
    template = EmailTemplate(id=template_id, owner_id=owner_id, name="T", sequence_position=1, generation_prompt="Generate", max_word_count=100)
    
    db_session.add_all([lead, campaign, template])
    await db_session.commit()
    
    provider = MockProvider([
        json.dumps({
            "subject_options": ["Hi there"],
            "body": "This has {{unresolved}} placeholders " * 5
        })
    ])
    monkeypatch.setattr("app.ai.graphs.email_gen_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_email_gen_graph()
    state = await graph.ainvoke({
        "campaign_id": str(campaign_id),
        "lead_id": str(lead_id),
        "template_id": str(template_id)
    }, config={"configurable": {"thread_id": "3", "db_session_factory": db_session_factory}})
    
    assert state.get("email_record_id") is None
    assert state.get("attempt") >= 3
