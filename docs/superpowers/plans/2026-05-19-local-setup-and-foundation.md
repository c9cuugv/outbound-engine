# OutboundEngine Local Setup + Foundation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get OutboundEngine running on localhost with NVIDIA NIM + Resend, synthetic test data, and ship the three council-mandated foundation fixes (idempotency guard, bounce/unsubscribe compliance, tag-based targeting).

**Architecture:** Local PostgreSQL 14 + Redis-in-Docker + native uvicorn + native Celery worker + Vite dev server. Makefile orchestrates everything. Foundation fixes are DB migrations + model changes + new webhook endpoints — no new dependencies required (dnspython, httpx, slowapi already in requirements.txt).

**Tech Stack:** FastAPI 0.115 · SQLAlchemy 2.x async · PostgreSQL 14 · Redis 7 · Celery · React 18 + Vite · NVIDIA NIM (`meta/llama-3.1-70b-instruct`) · Resend · pytest-asyncio · SQLite in-memory (tests)

---

## File Map

**Created**
- `Makefile` — dev lifecycle (setup, dev-api, dev-worker, dev-frontend, seed, stop)
- `scripts/seed.py` — synthetic data loader via httpx + Faker
- `backend/alembic/versions/006_generated_email_idempotency.py` — unique constraint on (campaign_id, lead_id, template_id)
- `backend/alembic/versions/007_lead_bounce_unsubscribe.py` — is_bounced, is_unsubscribed columns
- `backend/alembic/versions/008_campaign_target_tags.py` — target_tags column
- `backend/app/api/v1/webhooks.py` — POST /api/v1/webhooks/resend
- `backend/app/services/email_validation.py` — MX check + role-account filter
- `backend/tests/test_webhooks.py`
- `backend/tests/test_tag_targeting.py`
- `backend/tests/test_email_validation.py`

**Modified**
- `backend/requirements.txt` — add `faker>=20.0.0`
- `backend/app/models/lead.py` — add `is_bounced`, `is_unsubscribed`
- `backend/app/models/campaign.py` — add `target_tags`
- `backend/app/models/generated_email.py` — add `UniqueConstraint` to `__table_args__`
- `backend/app/schemas/leads.py` — add `is_bounced`, `is_unsubscribed` to `LeadResponse`
- `backend/app/schemas/campaigns.py` — add `target_tags` to `CampaignCreate`, `CampaignUpdate`, `CampaignResponse`
- `backend/app/services/lead_service.py` — add `set_lead_bounced`, `set_lead_unsubscribed`
- `backend/app/api/v1/leads.py` — add MX + role validation to CSV import endpoint
- `backend/app/main.py` — register webhooks router

---

## Task 1: Makefile

**Files:**
- Create: `Makefile`

> Note: Makefile indentation MUST use tabs, not spaces. Every recipe line starts with a literal tab character.

- [ ] **Step 1: Create Makefile**

```makefile
PYTHON   = backend/.venv/bin/python
PIP      = backend/.venv/bin/pip
ALEMBIC  = cd backend && .venv/bin/alembic
UVICORN  = cd backend && .venv/bin/uvicorn
CELERY   = cd backend && .venv/bin/celery

.PHONY: setup dev-api dev-worker dev-frontend seed stop

setup:
	@echo "==> Restoring deleted worker files..."
	git restore backend/app/workers/
	@echo "==> Creating outbound database (skips if exists)..."
	createdb outbound 2>/dev/null || echo "    database already exists, skipping"
	@echo "==> Creating Python virtual environment..."
	python3 -m venv backend/.venv
	@echo "==> Installing Python dependencies..."
	$(PIP) install --quiet -r backend/requirements.txt
	@echo "==> Installing frontend dependencies..."
	cd frontend && npm install --silent
	@echo "==> Copying .env.example → .env (skips if .env exists)..."
	test -f .env || cp .env.example .env
	@echo "==> Writing JWT_SECRET into .env..."
	@python3 -c "\
import secrets, re; \
key = secrets.token_hex(32); \
content = open('.env').read(); \
content = re.sub(r'^JWT_SECRET=.*$$', 'JWT_SECRET=' + key, content, flags=re.MULTILINE); \
open('.env', 'w').write(content); \
print('    JWT_SECRET set.')"
	@echo "==> Starting Redis container..."
	docker run -d --name outbound-redis -p 6379:6379 redis:7-alpine 2>/dev/null \
		|| docker start outbound-redis
	@echo "==> Running database migrations..."
	$(ALEMBIC) upgrade head
	@echo ""
	@echo "✓ Setup complete!"
	@echo ""
	@echo "NEXT STEPS:"
	@echo "  1. Edit .env — set NVIDIA_API_KEY and RESEND_API_KEY"
	@echo "  2. Terminal 1:  make dev-api"
	@echo "  3. Terminal 2:  make dev-worker"
	@echo "  4. Terminal 3:  make dev-frontend"
	@echo "  5. Run:         make seed"

dev-api:
	$(UVICORN) app.main:app --reload --port 8000

dev-worker:
	$(CELERY) -A app.workers.celery_app worker -l info

dev-frontend:
	cd frontend && npm run dev

seed:
	$(PYTHON) scripts/seed.py

stop:
	docker stop outbound-redis
```

- [ ] **Step 2: Verify tab characters are present**

```bash
cat -A Makefile | grep "^\^I" | head -3
```

Expected: lines beginning with `^I` (tab marker). If you see spaces instead, your editor converted tabs — fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "infra: add Makefile for local dev lifecycle"
```

---

## Task 2: Add faker to requirements

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add faker**

Open `backend/requirements.txt`. Find the `# Testing` block and add one line:

```
# Testing
pytest==8.3.4
pytest-asyncio==0.24.0
httpx==0.27.0
aiosqlite==0.20.0
faker>=20.0.0
```

- [ ] **Step 2: Install**

```bash
cd backend && .venv/bin/pip install faker
```

Expected output: `Successfully installed faker-...`

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "deps: add faker for seed script"
```

---

## Task 3: GeneratedEmail — idempotency unique constraint

**Files:**
- Modify: `backend/app/models/generated_email.py`
- Create: `backend/alembic/versions/006_generated_email_idempotency.py`

**Context:** `GeneratedEmail` currently has no unique constraint. If the email generation task crashes and retries, it creates duplicate rows for the same (campaign, lead, template) combination. Adding a unique constraint makes retries safe — the second attempt gets an `IntegrityError` instead of inserting a duplicate.

- [ ] **Step 1: Update model — add UniqueConstraint to `__table_args__`**

Open `backend/app/models/generated_email.py`. Find the `__table_args__` tuple and add `UniqueConstraint`:

```python
# Add UniqueConstraint to existing imports line:
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
```

Then update `__table_args__` (preserving existing indexes):

```python
    __table_args__ = (
        Index("idx_emails_status", "status"),
        Index(
            "idx_emails_scheduled",
            "scheduled_at",
            postgresql_where=text("status = 'scheduled'"),
        ),
        UniqueConstraint(
            "campaign_id", "lead_id", "template_id",
            name="uq_email_campaign_lead_template",
        ),
    )
```

- [ ] **Step 2: Generate migration**

```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "generated_email_idempotency"
```

Expected: `Generating .../alembic/versions/006_generated_email_idempotency.py`

- [ ] **Step 3: Verify generated migration**

Open the generated file. The `upgrade()` function must contain:

```python
def upgrade() -> None:
    op.create_unique_constraint(
        "uq_email_campaign_lead_template",
        "generated_emails",
        ["campaign_id", "lead_id", "template_id"],
    )
```

And `downgrade()` must contain:

```python
def downgrade() -> None:
    op.drop_constraint(
        "uq_email_campaign_lead_template",
        "generated_emails",
        type_="unique",
    )
```

If autogenerate produced different ops, replace the body with the code above.

- [ ] **Step 4: Run migration**

```bash
cd backend && .venv/bin/alembic upgrade head
```

Expected: `Running upgrade ... -> ..., generated_email_idempotency`

- [ ] **Step 5: Verify in database**

```bash
psql outbound -c "\d generated_emails" | grep uq_email
```

Expected: `uq_email_campaign_lead_template` in output.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/generated_email.py backend/alembic/versions/
git commit -m "feat: add idempotency constraint to generated_emails"
```

---

## Task 4: Lead model — bounce and unsubscribe flags

**Files:**
- Modify: `backend/app/models/lead.py`
- Modify: `backend/app/schemas/leads.py`
- Create: `backend/alembic/versions/007_lead_bounce_unsubscribe.py`

- [ ] **Step 1: Add columns to Lead model**

Open `backend/app/models/lead.py`. After the `source` column (line ~47), add:

```python
    # ── Suppression flags ──
    is_bounced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_unsubscribed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

Ensure `Boolean` is imported from sqlalchemy (it should be already).

- [ ] **Step 2: Add fields to LeadResponse schema**

Open `backend/app/schemas/leads.py`. In `LeadResponse`, after the `source` field, add:

```python
    is_bounced: bool = False
    is_unsubscribed: bool = False
```

- [ ] **Step 3: Generate migration**

```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "lead_bounce_unsubscribe"
```

- [ ] **Step 4: Verify generated migration**

The generated file's `upgrade()` must add both columns with `server_default`:

```python
def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("is_bounced", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "leads",
        sa.Column("is_unsubscribed", sa.Boolean(), nullable=False, server_default="false"),
    )

def downgrade() -> None:
    op.drop_column("leads", "is_unsubscribed")
    op.drop_column("leads", "is_bounced")
```

If autogenerate omits `server_default="false"`, add it manually — without it the migration fails on a table with existing rows.

- [ ] **Step 5: Run migration**

```bash
cd backend && .venv/bin/alembic upgrade head
```

Expected: `Running upgrade ..., lead_bounce_unsubscribe`

- [ ] **Step 6: Verify**

```bash
psql outbound -c "\d leads" | grep -E "is_bounced|is_unsubscribed"
```

Expected: two boolean columns with `false` default.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/lead.py backend/app/schemas/leads.py backend/alembic/versions/
git commit -m "feat: add is_bounced and is_unsubscribed to Lead"
```

---

## Task 5: Lead service — set_bounced and set_unsubscribed functions

**Files:**
- Modify: `backend/app/services/lead_service.py`

- [ ] **Step 1: Write failing tests first**

Create `backend/tests/test_bounce_unsubscribe.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_lead_created_with_suppression_defaults(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/leads", headers=auth_headers, json={
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "alice@example.com",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["is_bounced"] is False
    assert data["is_unsubscribed"] is False


@pytest.mark.asyncio
async def test_get_lead_returns_suppression_flags(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/leads", headers=auth_headers, json={
        "first_name": "Bob",
        "last_name": "Jones",
        "email": "bob@example.com",
    })
    lead_id = r.json()["id"]

    r = await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)
    assert r.status_code == 200
    assert "is_bounced" in r.json()
    assert "is_unsubscribed" in r.json()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && .venv/bin/pytest tests/test_bounce_unsubscribe.py -v
```

Expected: FAIL — `is_bounced` key missing from response.

- [ ] **Step 3: Verify tests pass after schema update (already done in Task 4)**

```bash
cd backend && .venv/bin/pytest tests/test_bounce_unsubscribe.py -v
```

Expected: PASS — `LeadResponse` now includes both flags.

- [ ] **Step 4: Add service functions to lead_service.py**

Open `backend/app/services/lead_service.py`. Add at the bottom of the file:

```python
from sqlalchemy import update as sql_update


async def set_lead_bounced(db: AsyncSession, email: str) -> None:
    await db.execute(
        sql_update(Lead).where(Lead.email == email).values(is_bounced=True)
    )
    await db.commit()


async def set_lead_unsubscribed(db: AsyncSession, email: str) -> None:
    await db.execute(
        sql_update(Lead).where(Lead.email == email).values(is_unsubscribed=True)
    )
    await db.commit()
```

Ensure `Lead` model and `AsyncSession` are already imported at the top of that file (they will be).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lead_service.py backend/tests/test_bounce_unsubscribe.py
git commit -m "feat: add set_lead_bounced and set_lead_unsubscribed service functions"
```

---

## Task 6: Webhook endpoint — Resend bounce/unsubscribe receiver

**Files:**
- Create: `backend/app/api/v1/webhooks.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_webhooks.py`

**Context:** Resend calls `POST /api/v1/webhooks/resend` when an email bounces or a recipient complains. The payload contains `type` (e.g. `"email.bounced"`) and `data.to` (list of email addresses). No auth required — Resend sends this server-to-server.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_webhooks.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_bounce_webhook_sets_is_bounced(client: AsyncClient, auth_headers: dict):
    # Create a lead
    r = await client.post("/api/v1/leads", headers=auth_headers, json={
        "first_name": "Test",
        "last_name": "User",
        "email": "bounce@example.com",
    })
    assert r.status_code == 201
    lead_id = r.json()["id"]

    # Send Resend bounce webhook (no auth)
    r = await client.post("/api/v1/webhooks/resend", json={
        "type": "email.bounced",
        "data": {"to": ["bounce@example.com"]},
    })
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    # Verify lead is now flagged
    r = await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)
    assert r.json()["is_bounced"] is True
    assert r.json()["is_unsubscribed"] is False


@pytest.mark.asyncio
async def test_complaint_webhook_sets_is_unsubscribed(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/leads", headers=auth_headers, json={
        "first_name": "Test",
        "last_name": "User",
        "email": "complaint@example.com",
    })
    lead_id = r.json()["id"]

    r = await client.post("/api/v1/webhooks/resend", json={
        "type": "email.complained",
        "data": {"to": ["complaint@example.com"]},
    })
    assert r.status_code == 200

    r = await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)
    assert r.json()["is_unsubscribed"] is True


@pytest.mark.asyncio
async def test_unknown_webhook_type_returns_ok(client: AsyncClient):
    r = await client.post("/api/v1/webhooks/resend", json={
        "type": "email.delivered",
        "data": {"to": ["user@example.com"]},
    })
    assert r.status_code == 200
    assert r.json() == {"ok": True}


@pytest.mark.asyncio
async def test_webhook_for_unknown_email_returns_ok(client: AsyncClient):
    # No lead exists with this email — should silently succeed (no crash)
    r = await client.post("/api/v1/webhooks/resend", json={
        "type": "email.bounced",
        "data": {"to": ["nobody@nowhere.com"]},
    })
    assert r.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && .venv/bin/pytest tests/test_webhooks.py -v
```

Expected: FAIL — 404 on `/api/v1/webhooks/resend` (route not yet registered).

- [ ] **Step 3: Create webhooks.py**

Create `backend/app/api/v1/webhooks.py`:

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.lead_service import set_lead_bounced, set_lead_unsubscribed

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

_BOUNCE_TYPES = {"email.bounced", "email.delivery_delayed"}
_UNSUB_TYPES = {"email.complained", "email.unsubscribed"}


class _ResendData(BaseModel):
    to: list[str] = []


class ResendWebhookEvent(BaseModel):
    type: str
    data: _ResendData = _ResendData()


@router.post("/resend")
async def resend_webhook(
    event: ResendWebhookEvent,
    db: AsyncSession = Depends(get_db),
):
    if event.type in _BOUNCE_TYPES:
        for email in event.data.to:
            await set_lead_bounced(db, email)
    elif event.type in _UNSUB_TYPES:
        for email in event.data.to:
            await set_lead_unsubscribed(db, email)
    return {"ok": True}
```

- [ ] **Step 4: Register router in main.py**

Open `backend/app/main.py`. Find the `# ── Routers ──` block. Add after the existing routers:

```python
from app.api.v1.webhooks import router as webhooks_router
# ...
app.include_router(webhooks_router)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && .venv/bin/pytest tests/test_webhooks.py -v
```

Expected: 4/4 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/webhooks.py backend/app/main.py backend/tests/test_webhooks.py
git commit -m "feat: add Resend webhook receiver for bounce/unsubscribe"
```

---

## Task 7: Campaign model — target_tags field

**Files:**
- Modify: `backend/app/models/campaign.py`
- Modify: `backend/app/schemas/campaigns.py`
- Create: `backend/alembic/versions/008_campaign_target_tags.py`

- [ ] **Step 1: Add target_tags column to Campaign model**

Open `backend/app/models/campaign.py`. After `ab_split_percentage`, add:

```python
    # ── Targeting ──
    target_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

Ensure `JSONB` is already imported from `sqlalchemy.dialects.postgresql` (it will be).

- [ ] **Step 2: Add target_tags to schemas**

Open `backend/app/schemas/campaigns.py`.

In `CampaignCreate`, add:
```python
    target_tags: list[str] | None = None
```

In `CampaignUpdate`, add:
```python
    target_tags: list[str] | None = None
```

In `CampaignResponse`, add:
```python
    target_tags: list[str] | None = None
```

- [ ] **Step 3: Generate migration**

```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "campaign_target_tags"
```

- [ ] **Step 4: Verify migration**

The `upgrade()` must contain:

```python
def upgrade() -> None:
    op.add_column(
        "campaigns",
        sa.Column(
            "target_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )

def downgrade() -> None:
    op.drop_column("campaigns", "target_tags")
```

If autogenerate omits the `postgresql.JSONB` type, ensure `from sqlalchemy.dialects import postgresql` is imported at the top of the migration file.

- [ ] **Step 5: Run migration**

```bash
cd backend && .venv/bin/alembic upgrade head
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/campaign.py backend/app/schemas/campaigns.py backend/alembic/versions/
git commit -m "feat: add target_tags to Campaign for tag-based targeting"
```

---

## Task 8: Tag-based targeting in campaign service

**Files:**
- Modify: `backend/app/services/campaign_service.py`
- Create: `backend/tests/test_tag_targeting.py`

**Context:** When a campaign has `target_tags` set (e.g. `["saas", "b2b"]`), only leads whose `tags` list has at least one overlapping value should be included when generating emails. This filter runs in Python after fetching leads from the list — SQLite-compatible.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_tag_targeting.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_campaign_stores_target_tags(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/campaigns", headers=auth_headers, json={
        "name": "Tag Test Campaign",
        "target_tags": ["saas", "b2b"],
    })
    assert r.status_code == 201
    assert r.json()["target_tags"] == ["saas", "b2b"]


@pytest.mark.asyncio
async def test_campaign_target_tags_defaults_to_null(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/campaigns", headers=auth_headers, json={
        "name": "No Tags Campaign",
    })
    assert r.status_code == 201
    assert r.json()["target_tags"] is None


@pytest.mark.asyncio
async def test_filter_leads_by_tags():
    from app.services.campaign_service import filter_leads_by_tags

    class FakeLead:
        def __init__(self, tags):
            self.tags = tags

    leads = [
        FakeLead(["saas", "startup"]),
        FakeLead(["enterprise"]),
        FakeLead(["b2b", "growth"]),
        FakeLead([]),
        FakeLead(None),
    ]

    result = filter_leads_by_tags(leads, target_tags=["saas", "b2b"])
    assert len(result) == 2  # first and third lead match

    # No target_tags → all leads pass through
    result_all = filter_leads_by_tags(leads, target_tags=None)
    assert len(result_all) == 5
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && .venv/bin/pytest tests/test_tag_targeting.py::test_filter_leads_by_tags -v
```

Expected: FAIL — `ImportError: cannot import name 'filter_leads_by_tags'`.

- [ ] **Step 3: Add filter_leads_by_tags to campaign_service.py**

Open `backend/app/services/campaign_service.py`. Add at the bottom:

```python
def filter_leads_by_tags(leads: list, target_tags: list[str] | None) -> list:
    if not target_tags:
        return leads
    target_set = set(target_tags)
    return [
        lead for lead in leads
        if set(lead.tags or []) & target_set
    ]
```

- [ ] **Step 4: Run all tag tests**

```bash
cd backend && .venv/bin/pytest tests/test_tag_targeting.py -v
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/campaign_service.py backend/tests/test_tag_targeting.py
git commit -m "feat: add tag-based lead filtering to campaign service"
```

---

## Task 9: Email validation — MX check + role-account filter on CSV import

**Files:**
- Create: `backend/app/services/email_validation.py`
- Modify: `backend/app/api/v1/leads.py`
- Create: `backend/tests/test_email_validation.py`

**Context:** `dnspython==2.6.1` is already in requirements.txt. The validation runs during `POST /api/v1/leads/bulk` (CSV import). Rejected rows are returned in the response as `rejected` with a reason — not silently dropped.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_email_validation.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
import dns.resolver

from app.services.email_validation import is_valid_email, ROLE_ACCOUNTS


def test_role_account_rejected():
    for prefix in ["info", "noreply", "no-reply", "admin", "support", "hello", "contact"]:
        assert is_valid_email(f"{prefix}@example.com") is False


def test_normal_email_passes_role_check():
    with patch("app.services.email_validation.dns.resolver.resolve") as mock_resolve:
        mock_resolve.return_value = [MagicMock()]
        assert is_valid_email("john.doe@example.com") is True


def test_invalid_mx_rejected():
    with patch("app.services.email_validation.dns.resolver.resolve") as mock_resolve:
        mock_resolve.side_effect = dns.resolver.NXDOMAIN
        assert is_valid_email("user@nonexistent-domain-xyz123.com") is False


def test_no_answer_mx_rejected():
    with patch("app.services.email_validation.dns.resolver.resolve") as mock_resolve:
        mock_resolve.side_effect = dns.resolver.NoAnswer
        assert is_valid_email("user@nodns.example.com") is False


def test_role_accounts_set_contains_expected():
    assert "noreply" in ROLE_ACCOUNTS
    assert "info" in ROLE_ACCOUNTS
    assert "admin" in ROLE_ACCOUNTS
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && .venv/bin/pytest tests/test_email_validation.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.email_validation'`.

- [ ] **Step 3: Create email_validation.py**

Create `backend/app/services/email_validation.py`:

```python
import dns.resolver

ROLE_ACCOUNTS = {
    "info", "noreply", "no-reply", "admin", "support",
    "help", "hello", "contact", "sales", "marketing",
    "team", "careers", "jobs", "billing", "abuse",
    "postmaster", "webmaster", "hostmaster", "security",
}


def _has_mx_record(domain: str) -> bool:
    try:
        dns.resolver.resolve(domain, "MX")
        return True
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.DNSException):
        return False


def is_valid_email(email: str) -> bool:
    if "@" not in email:
        return False
    local, domain = email.lower().rsplit("@", 1)
    if local in ROLE_ACCOUNTS:
        return False
    return _has_mx_record(domain)


def validate_email_list(emails: list[str]) -> tuple[list[str], list[dict]]:
    """Returns (valid_emails, rejected_list).

    rejected_list items: {"email": str, "reason": str}
    """
    valid: list[str] = []
    rejected: list[dict] = []
    for email in emails:
        if "@" not in email:
            rejected.append({"email": email, "reason": "invalid format"})
            continue
        local = email.lower().split("@")[0]
        if local in ROLE_ACCOUNTS:
            rejected.append({"email": email, "reason": "role account"})
            continue
        domain = email.lower().rsplit("@", 1)[1]
        if not _has_mx_record(domain):
            rejected.append({"email": email, "reason": "no MX record"})
            continue
        valid.append(email)
    return valid, rejected
```

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv/bin/pytest tests/test_email_validation.py -v
```

Expected: 5/5 PASS.

- [ ] **Step 5: Wire validation into CSV import endpoint**

Open `backend/app/api/v1/leads.py`. Search for the function that handles `UploadFile` (the bulk/CSV endpoint). It will contain a loop that either directly creates Lead objects or calls a service function for each row.

Add these imports at the top of `leads.py`:

```python
import asyncio
from app.services.email_validation import validate_email_list
```

Inside the CSV handler, find the line where individual rows are parsed into dicts (look for `csv.DictReader` or similar). Immediately after that parse step and before any `Lead` creation or service call, insert:

```python
    raw_emails = [row.get("email", "") for row in rows]
    valid_emails, rejected_emails = await asyncio.to_thread(
        validate_email_list, raw_emails
    )
    valid_set = set(valid_emails)
    rows = [row for row in rows if row.get("email") in valid_set]
```

Then in the final JSON response of that endpoint, add `"rejected": rejected_emails` alongside whatever `"imported"` count is already returned. The shape becomes:

```json
{"imported": 14, "rejected": [{"email": "info@acme.com", "reason": "role account"}]}
```

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd backend && .venv/bin/pytest tests/ -v --tb=short
```

Expected: all tests pass. Fix any failures before committing.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/email_validation.py backend/app/api/v1/leads.py backend/tests/test_email_validation.py
git commit -m "feat: add MX check and role-account filter to CSV import"
```

---

## Task 10: API rate limiting — tighten send-triggering endpoints

**Files:**
- Modify: `backend/app/api/v1/webhooks.py`
- Modify: `backend/app/api/v1/campaigns.py`

**Context:** `slowapi` is already installed and the `Limiter` is already wired into `app.state` in `main.py`. This task adds `@limiter.limit(...)` decorators to the two highest-risk endpoints: the webhook receiver (prevent flooding) and campaign generate/launch (prevent accidental blast loops).

- [ ] **Step 1: Add rate limit to webhook endpoint**

Open `backend/app/api/v1/webhooks.py`. Add the limiter import and decorator:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)
```

Then decorate the endpoint:

```python
@router.post("/resend")
@limiter.limit("60/minute")
async def resend_webhook(
    request: Request,
    event: ResendWebhookEvent,
    db: AsyncSession = Depends(get_db),
):
```

Note: `request: Request` must be the first parameter when using `slowapi` — it needs the request object to extract the key.

- [ ] **Step 2: Add rate limit to campaign generate and launch endpoints**

Open `backend/app/api/v1/campaigns.py`. Find the endpoint functions for `generate` and `launch` (they'll be decorated with `@router.post("/{campaign_id}/generate")` and `@router.post("/{campaign_id}/launch")`).

Add `Request` as first parameter and the decorator to each:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)

# On the generate endpoint:
@router.post("/{campaign_id}/generate")
@limiter.limit("10/minute")
async def generate_campaign_emails(
    request: Request,
    campaign_id: uuid.UUID,
    ...
):

# On the launch endpoint:
@router.post("/{campaign_id}/launch")
@limiter.limit("10/minute")
async def launch_campaign(
    request: Request,
    campaign_id: uuid.UUID,
    ...
):
```

- [ ] **Step 3: Verify 429 is returned on excess**

```bash
cd backend && .venv/bin/pytest tests/ -v --tb=short -q
```

Expected: all existing tests still pass (rate limit is per-IP; test client uses loopback address and doesn't blast 60 requests/min).

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/webhooks.py backend/app/api/v1/campaigns.py
git commit -m "feat: tighten rate limits on webhook and campaign trigger endpoints"
```

---

## Task 12: seed.py — synthetic data

**Files:**
- Create: `scripts/seed.py`

**Context:** Runs against the live API at `http://localhost:8000`. The API must be running before you execute `make seed`. Uses `httpx` (async) and `faker`. Idempotent on re-run — re-registers with same credentials, which will 409 on the user but continues gracefully.

- [ ] **Step 1: Create scripts/seed.py**

```python
#!/usr/bin/env python3
"""Seed the OutboundEngine API with synthetic test data.

Usage:
    make seed              (from repo root, API must be running)
    python scripts/seed.py (from repo root)
"""
import asyncio
import random
import sys

import httpx
from faker import Faker

BASE_URL = "http://localhost:8000"
TEST_EMAIL = "test@outbound.local"
TEST_PASSWORD = "Test1234!"

TAGS_POOL = [
    ["saas", "b2b"], ["enterprise", "b2b"], ["startup", "saas"],
    ["growth", "b2b"], ["smb"], ["b2b"], ["saas", "growth"],
]

TITLES = [
    "Head of Sales", "VP of Marketing", "Founder", "CEO", "CTO",
    "Director of Growth", "Chief Revenue Officer", "VP Sales",
    "Co-Founder", "Head of Business Development",
]

fake = Faker()


async def seed() -> None:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:

        # ── 1. Register or log in ──────────────────────────────────────────
        print("→ Registering test user...")
        r = await client.post("/api/v1/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": "Seed User",
        })
        if r.status_code == 409:
            print("  (user exists, logging in)")
            r = await client.post("/api/v1/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
            })
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"  ✓ Authenticated as {TEST_EMAIL}")

        # ── 2. Create 20 leads ─────────────────────────────────────────────
        print("→ Creating 20 synthetic leads...")
        lead_ids = []
        for _ in range(20):
            company = fake.company().replace(",", "").replace(".", "")
            domain = fake.domain_name()
            r = await client.post("/api/v1/leads", headers=headers, json={
                "first_name": fake.first_name(),
                "last_name": fake.last_name(),
                "email": f"{fake.user_name()}.{random.randint(100,999)}@{domain}",
                "company_name": company,
                "company_domain": domain,
                "title": random.choice(TITLES),
                "tags": random.choice(TAGS_POOL),
            })
            if r.status_code in (201, 200):
                lead_ids.append(r.json()["id"])
            elif r.status_code == 409:
                pass  # duplicate email, skip
        print(f"  ✓ {len(lead_ids)} leads created")

        # ── 3. Create lead list ────────────────────────────────────────────
        print("→ Creating lead list...")
        r = await client.post("/api/v1/lists", headers=headers, json={
            "name": "Synthetic Q2 List",
            "description": "Auto-generated synthetic leads for testing",
        })
        r.raise_for_status()
        list_id = r.json()["id"]
        print(f"  ✓ List id: {list_id}")

        # ── 4. Add leads to list ───────────────────────────────────────────
        print("→ Adding leads to list...")
        added = 0
        for lead_id in lead_ids:
            r = await client.post(
                f"/api/v1/lists/{list_id}/leads",
                headers=headers,
                json={"lead_id": lead_id},
            )
            if r.status_code in (200, 201):
                added += 1
        print(f"  ✓ {added}/{len(lead_ids)} leads added to list")

        # ── 5. Create campaign ─────────────────────────────────────────────
        print("→ Creating campaign...")
        r = await client.post("/api/v1/campaigns", headers=headers, json={
            "name": "Q2 Outreach Test",
            "product_name": "OutboundEngine",
            "product_description": (
                "AI-powered outbound email platform that researches leads "
                "and writes personalized cold emails at scale."
            ),
            "icp_description": (
                "B2B SaaS founders and heads of sales at 10-200 person companies "
                "who are scaling outbound sales."
            ),
            "value_prop": (
                "Automate personalized cold outreach: research every lead, "
                "write hyper-personalized emails, and manage full sending sequences."
            ),
            "sender_name": "Deep",
            "sender_email": "adds.ravaldeep@gmail.com",
            "target_tags": ["saas", "b2b"],
        })
        r.raise_for_status()
        campaign = r.json()
        campaign_id = campaign["id"]
        print(f"  ✓ Campaign id: {campaign_id}")

        # ── 6. Create email templates ──────────────────────────────────────
        print("→ Creating email templates...")
        templates = [
            {
                "name": "Step 1 — Cold Intro",
                "sequence_position": 1,
                "days_delay": 0,
                "tone": "professional-casual",
                "max_word_count": 100,
                "generation_prompt": (
                    "Write a concise cold intro email. Reference one specific thing "
                    "from the lead's company (industry, product, recent growth signal). "
                    "End with a single low-friction question. No pitch heavy language. "
                    "Max 100 words."
                ),
            },
            {
                "name": "Step 2 — Follow-up",
                "sequence_position": 2,
                "days_delay": 3,
                "tone": "professional-casual",
                "max_word_count": 80,
                "generation_prompt": (
                    "Write a short follow-up to a cold email that got no reply. "
                    "Acknowledge it's a follow-up. Add one new piece of value or insight. "
                    "Keep it under 80 words. End with the same low-friction question."
                ),
            },
        ]
        template_ids = []
        for tmpl in templates:
            r = await client.post("/api/v1/templates", headers=headers, json=tmpl)
            r.raise_for_status()
            template_ids.append(r.json()["id"])
        print(f"  ✓ {len(template_ids)} templates created")

        # ── Summary ───────────────────────────────────────────────────────
        print()
        print("=" * 50)
        print("SEED COMPLETE")
        print("=" * 50)
        print(f"  User:        {TEST_EMAIL}")
        print(f"  Password:    {TEST_PASSWORD}")
        print(f"  Leads:       {len(lead_ids)}")
        print(f"  List id:     {list_id}")
        print(f"  Campaign id: {campaign_id}")
        print(f"  Templates:   {len(template_ids)}")
        print()
        print(f"  Token (paste into /docs Authorize):")
        print(f"  {token}")
        print()
        print(f"  Swagger UI:  http://localhost:8000/docs")
        print(f"  Frontend:    http://localhost:5173")
        print()
        print("  To generate emails, call:")
        print(f"  POST /api/v1/campaigns/{campaign_id}/generate")


if __name__ == "__main__":
    try:
        asyncio.run(seed())
    except httpx.ConnectError:
        print("ERROR: Cannot connect to http://localhost:8000")
        print("Make sure the API is running: make dev-api")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/seed.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.py
git commit -m "feat: add synthetic data seed script"
```

---

## Task 13: End-to-end verification

This task has no code — it's the manual smoke test run after `make setup`.

- [ ] **Step 1: Run setup**

```bash
make setup
```

Expected: completes without error. Ends with "NEXT STEPS" output.

- [ ] **Step 2: Fill in .env API keys**

Open `.env` in a text editor. Set:
```
NVIDIA_API_KEY=nvapi-<your key from build.nvidia.com>
RESEND_API_KEY=re_<your key from resend.com>
```

Save and close.

- [ ] **Step 3: Open three terminals**

Terminal 1:
```bash
make dev-api
```
Wait until you see: `Application startup complete.`

Terminal 2:
```bash
make dev-worker
```
Wait until you see: `celery@... ready.`

Terminal 3:
```bash
make dev-frontend
```
Wait until you see: `Local: http://localhost:5173/`

- [ ] **Step 4: Check health endpoint**

```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```

Expected:
```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok",
  "nvidia": "configured"
}
```

If `database` or `redis` shows an error, check that Postgres is running (`pg_isready`) and Redis container is up (`docker ps | grep outbound-redis`).

- [ ] **Step 5: Run seed script**

```bash
make seed
```

Expected: Seed output ending with campaign id and token.

- [ ] **Step 6: Test API via Swagger**

Open `http://localhost:8000/docs`.

1. Click **Authorize** → paste the Bearer token from seed output.
2. Expand `POST /api/v1/campaigns/{id}/generate` → fill in the campaign id from seed output → Execute.
3. Watch Terminal 2 (worker) for task logs.

Expected in worker terminal: `Task app.workers.email_gen_tasks... received` then `succeeded`.

- [ ] **Step 7: Check frontend**

Open `http://localhost:5173`. You should see the campaign list with "Q2 Outreach Test". Navigate to the email review queue — generated emails should appear.

- [ ] **Step 8: Run full test suite**

```bash
cd backend && .venv/bin/pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 9: Final commit**

```bash
git add -A
git status  # review — should be clean or only untracked .env
git commit -m "chore: end-to-end verification complete"
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `make setup` | One-time setup: restore workers, create DB, venv, deps, migrations, Redis |
| `make dev-api` | Start FastAPI at :8000 with hot reload |
| `make dev-worker` | Start Celery worker (email gen, research, sending) |
| `make dev-frontend` | Start Vite at :5173 with hot reload |
| `make seed` | Load 20 synthetic leads + campaign + templates |
| `make stop` | Stop Redis container |
| `http://localhost:8000/docs` | Swagger UI |
| `http://localhost:8000/health` | Health check |
| `http://localhost:5173` | React frontend |
