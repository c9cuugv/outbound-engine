"""
Tests for authentication endpoints.

POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# /register
# ---------------------------------------------------------------------------

class TestRegister:
    async def test_register_success_returns_201_and_tokens(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "name": "New User",
            "password": "StrongPass1!",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"

    async def test_register_duplicate_email_returns_409(self, client: AsyncClient):
        payload = {"email": "dup@example.com", "name": "Dup", "password": "Pass123!"}
        await client.post("/api/v1/auth/register", json=payload)
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"].lower()

    async def test_register_invalid_email_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "name": "Bad Email",
            "password": "Pass123!",
        })
        assert resp.status_code == 422

    async def test_register_missing_name_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "noname@example.com",
            "password": "Pass123!",
        })
        assert resp.status_code == 422

    async def test_register_missing_password_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "nopass@example.com",
            "name": "No Pass",
        })
        assert resp.status_code == 422

    async def test_register_empty_body_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /login
# ---------------------------------------------------------------------------

class TestLogin:
    async def test_login_valid_credentials_returns_tokens(
        self, client: AsyncClient, registered_user
    ):
        _, plain_password = registered_user
        resp = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": plain_password,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    async def test_login_wrong_password_returns_401(
        self, client: AsyncClient, registered_user
    ):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    async def test_login_unknown_email_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "AnyPass1!",
        })
        assert resp.status_code == 401

    async def test_login_missing_email_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={"password": "Pass1!"})
        assert resp.status_code == 422

    async def test_login_missing_password_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={"email": "x@y.com"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /refresh
# ---------------------------------------------------------------------------

class TestRefresh:
    async def test_refresh_with_valid_refresh_token_returns_new_access_token(
        self, client: AsyncClient, registered_user
    ):
        _, plain_password = registered_user
        login = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": plain_password,
        })
        refresh_token = login.json()["refresh_token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_with_access_token_returns_401(
        self, client: AsyncClient, registered_user
    ):
        _, plain_password = registered_user
        login = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": plain_password,
        })
        access_token = login.json()["access_token"]

        # Passing an access token where a refresh token is expected
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert resp.status_code == 401

    async def test_refresh_with_garbage_token_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage.token.here"})
        assert resp.status_code == 401

    async def test_refresh_missing_token_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Protected endpoint reachability
# ---------------------------------------------------------------------------

class TestAuthProtection:
    async def test_no_token_on_protected_route_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/leads")
        assert resp.status_code == 401

    async def test_invalid_token_on_protected_route_returns_401(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/leads",
            headers={"Authorization": "Bearer invalid.token.value"},
        )
        assert resp.status_code == 401

    async def test_valid_token_allows_access(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/leads", headers=auth_headers)
        assert resp.status_code == 200
