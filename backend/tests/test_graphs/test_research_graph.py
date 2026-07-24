import pytest
import asyncio
from contextlib import asynccontextmanager
import json
import uuid

from app.models.lead import Lead
from app.ai.graphs.research_graph import build_research_graph

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

@pytest.fixture
def mock_httpx(monkeypatch):
    import httpx
    
    class MockResponse:
        def __init__(self, text, status_code):
            self.text = text
            self.status_code = status_code

    class MockAsyncClient:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
            
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
            
        async def get(self, url):
            if "fail" in url:
                raise Exception("Network error")
            return MockResponse(
                "<html><body><a href='greenhouse.io/jobs'>Jobs</a><script src='react.js'></script>Content that is long enough to pass 500 characters. " * 20 + "</body></html>", 
                200
            )
            
    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

@pytest.mark.asyncio
async def test_research_graph_happy_path(db_session, monkeypatch, mock_httpx):
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="john@example.com", owner_id=uuid.uuid4(), company_domain="example.com")
    db_session.add(lead)
    await db_session.commit()
    
    provider = MockProvider([
        json.dumps({
            "company_summary": "Test company",
            "industry": "Tech",
            "company_size_estimate": "11-50",
            "tech_stack_signals": ["React"],
            "potential_pain_points": ["Scaling"],
            "personalization_hooks": ["Hook1"],
            "confidence_score": 0.9
        })
    ])
    monkeypatch.setattr("app.ai.graphs.research_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_research_graph()
    state = await graph.ainvoke({
        "lead_id": str(lead_id),
        "website_url": "example.com"
    }, config={"configurable": {"thread_id": "1", "db_session_factory": db_session_factory}})
    
    assert state["status"] == "completed"
    await db_session.refresh(lead)
    assert lead.research_status == "completed"
    assert lead.company_industry == "Tech"


@pytest.mark.asyncio
async def test_research_graph_empty_scrape(db_session, monkeypatch):
    import httpx
    
    class MockResponse:
        def __init__(self, text, status_code):
            self.text = text
            self.status_code = status_code

    class MockAsyncClient:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self): return self
        async def __aexit__(self, exc_type, exc_val, exc_tb): pass
        async def get(self, url): return MockResponse("Too short", 200)
            
    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)
    
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="john2@example.com", owner_id=uuid.uuid4(), company_domain="example.com")
    db_session.add(lead)
    await db_session.commit()

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_research_graph()
    state = await graph.ainvoke({
        "lead_id": str(lead_id),
        "website_url": "example.com"
    }, config={"configurable": {"thread_id": "2", "db_session_factory": db_session_factory}})
    
    assert state["status"] == "failed"
    await db_session.refresh(lead)
    assert lead.research_status == "failed"


@pytest.mark.asyncio
async def test_research_graph_llm_failure(db_session, monkeypatch, mock_httpx):
    lead_id = uuid.uuid4()
    lead = Lead(id=lead_id, first_name="John", last_name="Doe", email="john3@example.com", owner_id=uuid.uuid4(), company_domain="example.com")
    db_session.add(lead)
    await db_session.commit()
    
    # Return hallucinated info so validation fails repeatedly
    provider = MockProvider([
        json.dumps({
            "company_summary": "We raised $1M",
            "industry": "Tech",
            "company_size_estimate": "11-50",
            "tech_stack_signals": ["React"],
            "potential_pain_points": ["Scaling"],
            "personalization_hooks": ["Hook1"],
            "confidence_score": 0.9
        })
    ])
    monkeypatch.setattr("app.ai.graphs.research_graph.get_provider", lambda _: provider)

    @asynccontextmanager
    async def db_session_factory():
        yield db_session

    graph = build_research_graph()
    state = await graph.ainvoke({
        "lead_id": str(lead_id),
        "website_url": "example.com"
    }, config={"configurable": {"thread_id": "3", "db_session_factory": db_session_factory}})
    
    assert state["status"] == "failed"
    await db_session.refresh(lead)
    assert lead.research_status == "failed"
