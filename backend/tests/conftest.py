"""
Shared fixtures for the outbound-engine test suite.

Uses an in-memory SQLite database via aiosqlite so no real Postgres or Redis
is required.  Each test gets a fresh database — no shared state.
"""

import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# ---------------------------------------------------------------------------
# Patch settings BEFORE importing anything that touches app.config so the
# test values take effect throughout the entire import chain.
# ---------------------------------------------------------------------------
import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("TRACKING_DOMAIN", "")
os.environ.setdefault("GEMINI_API_KEY", "")

# Patch PostgreSQL JSONB → JSON so SQLite can create tables in tests
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON as _JSON
SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: self.visit_JSON(_JSON(), **kw)

# Patch PostgreSQL/standard Time → TEXT so SQLite can create tables in tests
SQLiteTypeCompiler.visit_TIME = lambda self, type_, **kw: "TEXT"

from app.database import Base, get_db  # noqa: E402 — must come after env setup
from app.main import app  # noqa: E402
from app.services.auth_service import create_access_token, create_user  # noqa: E402

# ---------------------------------------------------------------------------
# In-memory SQLite engine (one per test session, tables recreated per test)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create all tables, yield a session, then drop everything."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with TestSessionLocal() as session:
        yield session
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTP test client that overrides the DB dependency with the in-memory
    session so every request goes to the same SQLite database as the test.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Registered user + auth headers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def registered_user(db_session: AsyncSession):
    """Create a user in the DB and return (user, plain_password)."""
    user = await create_user(
        db_session,
        email="testuser@example.com",
        name="Test User",
        password="SecurePass123!",
    )
    return user, "SecurePass123!"


@pytest_asyncio.fixture(scope="function")
async def auth_headers(registered_user) -> dict:
    """Return Authorization headers for the registered test user."""
    user, _ = registered_user
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="function")
async def second_user(db_session: AsyncSession):
    """A second user used for isolation / ownership tests."""
    user = await create_user(
        db_session,
        email="other@example.com",
        name="Other User",
        password="OtherPass456!",
    )
    token = create_access_token(str(user.id))
    return user, {"Authorization": f"Bearer {token}"}
