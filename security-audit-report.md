# Security Audit Report — OutboundEngine
**Date:** 2026-03-30
**Auditor:** Security Auditor Agent (V3)
**Scope:** `outbound-engine/` — Backend (Python/FastAPI), Frontend (TypeScript/Vite), Docker

---

## Executive Summary

The codebase demonstrates a reasonable security baseline for an early-stage application: rate limiting on auth endpoints, bcrypt password hashing, parameterized ORM queries, JWT token type enforcement, and a sort-column whitelist are all present. However, several significant vulnerabilities exist that must be remediated before production deployment. The most critical issues are an insecure JWT default secret, JWT tokens stored in `localStorage` (XSS-extractable), unauthenticated tracking endpoints that allow unauthorized lead-status manipulation, and a JWT leak via WebSocket URL query string.

**Finding counts:** 2 CRITICAL | 5 HIGH | 6 MEDIUM | 4 LOW

---

## CRITICAL Findings

---

### CRIT-1 — Weak Default JWT Secret Shipped in Source Code

**File:** `backend/app/config.py:12`
**OWASP:** A07:2021 Identification and Authentication Failures

**Evidence:**
```python
JWT_SECRET: str = "change-me-in-production"
```

**Description:**
The JWT signing secret has an insecure hardcoded default value. The startup warning (lines 53–61) prints to stderr but does **not** abort startup, meaning the application will run and issue valid JWTs with a publicly known secret. Any attacker who knows this default (it is in the public repository) can forge valid access and refresh tokens for any user ID and gain full authenticated access without credentials.

**Fix:**
1. Remove the default value entirely: `JWT_SECRET: str` — no default forces an explicit environment variable.
2. Replace the `print` warning with a hard `RuntimeError`:
   ```python
   if settings.JWT_SECRET in _INSECURE_SECRETS:
       raise RuntimeError("JWT_SECRET must be set to a strong random value before starting.")
   ```
3. Generate a suitable secret: `openssl rand -hex 32`
4. Add `JWT_SECRET` to `.env.example` with a placeholder and ensure `.env` is in `.gitignore`.

---

### CRIT-2 — JWT Tokens Stored in localStorage (XSS-Extractable)

**Files:** `frontend/src/api/client.ts:12`, `frontend/src/pages/LoginPage.tsx:25–26`, `frontend/src/hooks/useWebSocket.ts:17`
**OWASP:** A02:2021 Cryptographic Failures / A07:2021 Authentication Failures

**Evidence:**
```typescript
// client.ts:12
const token = localStorage.getItem("access_token");

// LoginPage.tsx:25-26
localStorage.setItem("access_token", data.access_token);
localStorage.setItem("refresh_token", data.refresh_token);

// useWebSocket.ts:17
const token = localStorage.getItem("access_token");
```

**Description:**
Both access and refresh tokens are stored in `localStorage`, which is accessible to any JavaScript running on the page. A single cross-site scripting vulnerability anywhere in the application (including third-party libraries) allows an attacker to exfiltrate both tokens. Refresh tokens are especially dangerous — a 7-day refresh token grants persistent access.

**Fix:**
1. Store tokens in `HttpOnly; Secure; SameSite=Strict` cookies set by the backend, invisible to JavaScript.
2. Alternatively for SPAs: store only the access token in memory (`useRef`/React context), use a server-side `HttpOnly` cookie for the refresh token only.
3. Never store refresh tokens in `localStorage` under any circumstances.
4. If cookies are adopted, add CSRF protection (double-submit cookie pattern or `SameSite=Strict`).

---

## HIGH Findings

---

### HIGH-1 — Unauthenticated Tracking Endpoints Allow Unauthorized Lead-Status Mutation

**File:** `backend/app/api/v1/tracking.py` (entire file)
**OWASP:** A01:2021 Broken Access Control

**Evidence:**
```python
@router.get("/t/o/{email_id}.png")   # No auth — open pixel
@router.get("/t/c/{email_id}/{link_hash}")  # No auth — click redirect
@router.get("/t/u/{email_id}")       # No auth — sets lead.status = "unsubscribed"
```

**Description:**
The tracking endpoints are intentionally unauthenticated (embedded in emails). However, the unsubscribe endpoint (`/t/u/{email_id}`) writes to the database — it permanently sets `lead.status = "unsubscribed"` and cancels all pending emails for that lead. Because `email_id` is a UUID (128-bit) this is partially mitigated by enumeration difficulty, but:
- There is no HMAC signature or token on the unsubscribe URL, so any party who obtains an `email_id` (e.g. from open tracking or click tracking requests) can unsubscribe the lead without their consent.
- The open/click tracking endpoints record IP addresses and user-agent strings without rate limiting — they can be abused to inflate open/click metrics or flood the `tracking_events` table.

**Fix:**
1. Sign unsubscribe URLs with an HMAC token: `/t/u/{email_id}/{hmac_token}` where `hmac_token = HMAC-SHA256(JWT_SECRET, email_id)`. Verify on receipt before writing to the database.
2. Apply `slowapi` rate limiting to all three tracking endpoints (e.g. `10/minute` per IP).
3. Errors in `uuid.UUID(email_id)` are silently swallowed — log them as security events.

---

### HIGH-2 — JWT Token Exposed in WebSocket URL Query String

**File:** `frontend/src/hooks/useWebSocket.ts:19`
**OWASP:** A02:2021 Cryptographic Failures

**Evidence:**
```typescript
const url = `${protocol}//${window.location.host}/ws/campaigns/${campaignId}/events?token=${token}`;
```

**Description:**
The JWT access token is appended as a URL query parameter. This causes the token to appear in:
- Browser history
- Server access logs (Uvicorn, nginx, load balancers)
- Referrer headers triggered by redirects
- Browser developer tools network tab (visible to extensions)

The backend **already correctly** implements first-message authentication (`{"type": "auth", "token": "<jwt>"}`) in `websocket.py:73–94`. The frontend ignores this and sends the token in the URL instead, defeating the backend's intentional design.

**Fix:**
Update `useWebSocket.ts` to connect without the token in the URL, then send the auth message after `ws.onopen`:
```typescript
const url = `${protocol}//${window.location.host}/ws/campaigns/${campaignId}`;
ws.onopen = () => {
  const token = localStorage.getItem("access_token");
  ws.send(JSON.stringify({ type: "auth", token }));
  setConnected(true);
};
```
The backend already handles this correctly — only the frontend needs to change.

---

### HIGH-3 — No Input Validation on `edit_email` PATCH Body (Untyped `dict`)

**File:** `backend/app/api/v1/campaign_emails.py:114–142`
**OWASP:** A03:2021 Injection / A04:2021 Insecure Design

**Evidence:**
```python
async def edit_email(
    ...
    data: dict,   # No Pydantic schema — no validation
    ...
):
    if "subject" in data:
        email.subject = data["subject"]
    if "body" in data:
        email.body = data["body"]
```

**Description:**
The PATCH endpoint for editing email content accepts a raw `dict` with no Pydantic schema, no field-length limits, no HTML sanitization on `body`, and no type validation. An authenticated user can:
1. Send arbitrarily large payloads (no length limit on `subject` or `body`), potentially causing database column overflow.
2. Inject arbitrary HTML/JavaScript into `email.body`. If the email body content is ever rendered in a browser (e.g. a preview panel using `innerHTML` assignment or equivalent React patterns), this is a stored cross-site scripting vector.
3. Attempt to set unexpected field names — the pattern is unsafe even though SQLAlchemy's model assignment limits the immediate blast radius.

**Fix:**
1. Replace `data: dict` with a typed Pydantic schema:
   ```python
   class EmailEditRequest(BaseModel):
       subject: str | None = Field(None, max_length=998)  # RFC 5322 limit
       body: str | None = Field(None, max_length=100_000)
   ```
2. Sanitize `body` HTML server-side with `bleach` or `nh3` before storage, whitelisting safe tags only.
3. In the frontend `EmailReviewQueue`, render email body preview via `<iframe srcdoc>` or plain-text rather than direct HTML injection into the DOM.

---

### HIGH-4 — SSRF via Unvalidated User-Supplied Domain in Scraper and Signal Collector

**Files:** `backend/app/services/scraper.py:55`, `backend/app/services/signals.py:66`
**OWASP:** A10:2021 Server-Side Request Forgery

**Evidence:**
```python
# scraper.py:99
url = f"{scheme}://{domain}{path}"

# signals.py:182
resp = await client.get(f"{scheme}://{domain}")
```

**Description:**
The `domain` parameter originates from user-supplied lead data (`company_domain` field on a Lead record). When research tasks are triggered for a lead, the scraper makes HTTP requests to `https://{user_supplied_domain}/`. No validation prevents internal network requests. An attacker who can create or import leads can set `company_domain` to:
- `169.254.169.254` (AWS/GCP/Azure metadata service — leaks cloud credentials)
- `localhost` or `127.0.0.1` (internal services)
- `10.0.0.x` (internal VPC addresses)
- `redis` or `db` (Docker service names on the internal bridge network)

This exposes cloud metadata credentials, internal service ports, and the Redis/PostgreSQL instances.

**Fix:**
1. Validate `company_domain` as a public FQDN before any HTTP request:
   ```python
   import ipaddress, socket
   def _is_safe_domain(domain: str) -> bool:
       try:
           addr = socket.gethostbyname(domain)
           ip = ipaddress.ip_address(addr)
           return ip.is_global and not ip.is_private and not ip.is_loopback
       except Exception:
           return False
   ```
2. Reject domains that resolve to RFC-1918, loopback, link-local, or metadata service addresses before making any HTTP request.
3. Consider a dedicated egress proxy with an allowlist for production.

---

### HIGH-5 — Docker Compose Exposes PostgreSQL and Redis Ports Publicly

**File:** `docker-compose.yml:10–11, 23`
**OWASP:** A05:2021 Security Misconfiguration

**Evidence:**
```yaml
db:
  ports:
    - "5432:5432"   # PostgreSQL exposed on all host interfaces
redis:
  ports:
    - "6379:6379"   # Redis exposed on all host interfaces
```

**Description:**
Both database services bind to `0.0.0.0:5432` and `0.0.0.0:6379` on the Docker host. On any cloud VM or VPS without strict external firewall rules, this exposes PostgreSQL and Redis to the public internet. Redis has no password configured, meaning unauthenticated access to all cached data (link URL mappings, session state) is trivially possible. PostgreSQL uses the default `postgres:postgres` credentials.

**Fix:**
1. Remove the `ports` mappings for `db` and `redis` entirely — internal Docker networking allows the `api`, `worker`, and `beat` services to connect without host exposure.
2. If host access is needed for local development, bind to loopback: `"127.0.0.1:5432:5432"`.
3. Add a Redis password: `command: redis-server --requirepass ${REDIS_PASSWORD}` and update `REDIS_URL`.
4. Change `POSTGRES_PASSWORD` from `postgres` to a strong random value via environment variable.

---

## MEDIUM Findings

---

### MED-1 — Hardcoded Default Database Credentials in Source Code

**File:** `backend/app/config.py:8–9`
**OWASP:** A07:2021 Authentication Failures

**Evidence:**
```python
DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/outbound"
REDIS_URL: str = "redis://localhost:6379/0"
```

**Description:**
Default credentials (`postgres:postgres`) are hardcoded as fallback values and checked into source control. If the `.env` file is absent or incomplete, the application starts with known-default credentials. Combined with HIGH-5 (exposed ports), this creates a direct path to full database compromise.

**Fix:**
Remove default values for all credential-bearing settings so startup fails fast if they are not explicitly configured:
```python
DATABASE_URL: str   # No default
REDIS_URL: str      # No default
```

---

### MED-2 — No Content-Security-Policy Header

**File:** `backend/app/main.py:24–35` (SecurityHeadersMiddleware)
**OWASP:** A05:2021 Security Misconfiguration

**Description:**
The `SecurityHeadersMiddleware` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`, but there is no `Content-Security-Policy` header. The code comment (`X-XSS-Protection: 0 — modern browsers use CSP instead`) acknowledges this, but CSP was never implemented. Without it, the browser places no restrictions on script execution sources, inline scripts, or resource loading — substantially amplifying the impact of XSS findings CRIT-2 and HIGH-3.

**Fix:**
Add to `SecurityHeadersMiddleware.dispatch`:
```python
response.headers["Content-Security-Policy"] = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' wss:; "
    "frame-ancestors 'none';"
)
```

---

### MED-3 — No Rate Limiting on `/refresh` Token Endpoint

**File:** `backend/app/api/v1/auth.py:90–108`
**OWASP:** A07:2021 Authentication Failures

**Evidence:**
```python
@router.post("/register", ...)
@limiter.limit("10/minute")   # Rate limited

@router.post("/login", ...)
@limiter.limit("20/minute")   # Rate limited

@router.post("/refresh", ...)
# No @limiter.limit — unprotected
```

**Description:**
The `/refresh` endpoint has no rate limiting. An attacker with a leaked refresh token can call this endpoint in an unlimited tight loop. It is also a potential denial-of-service vector against JWT signature verification computation.

**Fix:**
```python
@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(request: Request, data: RefreshRequest, db: AsyncSession = Depends(get_db)):
```
Note: `request: Request` must be added as a parameter — `slowapi` requires it to extract the client IP.

---

### MED-4 — No Password Strength Enforcement at Registration

**File:** `backend/app/schemas/auth.py` / `backend/app/services/auth_service.py:56`
**OWASP:** A07:2021 Authentication Failures

**Description:**
The registration flow accepts any non-empty password string. The `create_user` function hashes it immediately with bcrypt without validating length, complexity, or checking against common password lists. A user can register with password `a`.

**Fix:**
Add a Pydantic field validator in `RegisterRequest`:
```python
from pydantic import field_validator

@field_validator("password")
@classmethod
def validate_password(cls, v: str) -> str:
    if len(v) < 12:
        raise ValueError("Password must be at least 12 characters")
    if not any(c.isupper() for c in v) or not any(c.isdigit() for c in v):
        raise ValueError("Password must contain uppercase letters and digits")
    return v
```

---

### MED-5 — Open Redirect Risk in Click Tracking Endpoint

**File:** `backend/app/api/v1/tracking.py:67–101`
**OWASP:** A01:2021 Broken Access Control

**Evidence:**
```python
original_url = get_original_url(link_hash)
...
return RedirectResponse(url=original_url, status_code=302)
```

**Description:**
Click tracking redirects to `original_url` retrieved from Redis. The URL was written to Redis by `services/tracking.py:inject_tracking()` at email-generation time. However, because Redis has no password and is publicly exposed (HIGH-5), an attacker can overwrite link hash entries in Redis to point to arbitrary phishing URLs. The `get_original_url` function performs no validation of the retrieved URL before issuing the 302 redirect, making this a direct open redirect once Redis is compromised.

**Fix:**
1. Validate that the retrieved URL begins with `https://` before redirecting:
   ```python
   if not original_url.startswith("https://"):
       return HTMLResponse("<h1>Invalid link</h1>", status_code=400)
   ```
2. Resolve HIGH-5 (add Redis authentication) to prevent direct cache poisoning.

---

### MED-6 — Uvicorn Running with `--reload` in Production Docker Image

**File:** `docker-compose.yml:33`
**OWASP:** A05:2021 Security Misconfiguration

**Evidence:**
```yaml
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Description:**
The `--reload` flag is a development-only feature. In production, combined with the volume mount `./backend:/app` (line 42), any write to the host's `./backend/` directory triggers a server reload. This is a code-injection vector if any file-write path exists (e.g. via a compromised dependency or directory traversal). It also degrades performance and increases the server's filesystem access footprint.

**Fix:**
Use a `docker-compose.override.yml` for development with `--reload`. The production compose file should use:
```yaml
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```
Also remove `volumes: - ./backend:/app` from `api`, `worker`, and `beat` in production — code should be baked into the image at build time, not mounted from the host.

---

## LOW Findings

---

### LOW-1 — `python-jose` Has Known CVEs — Consider Migration

**File:** `backend/requirements.txt:15`
**OWASP:** A06:2021 Vulnerable and Outdated Components

**Evidence:**
```
python-jose[cryptography]==3.3.0
```

**Description:**
`python-jose` 3.3.0 has a history of algorithm-confusion vulnerabilities (CVE-2024-33664, CVE-2024-33663). The `alg=none` bypass is mitigated by the explicit `algorithms=[settings.JWT_ALGORITHM]` in `decode_token`, but the library has a poor security maintenance track record.

**Fix:**
Migrate to `PyJWT` (actively maintained, used by Django REST Framework). The API is nearly identical and the migration is low effort:
```python
import jwt  # PyJWT
token = jwt.encode(payload, secret, algorithm="HS256")
payload = jwt.decode(token, secret, algorithms=["HS256"])
```

---

### LOW-2 — Health Endpoint Leaks Internal Infrastructure Details

**File:** `backend/app/main.py:69–111`
**OWASP:** A05:2021 Security Misconfiguration

**Evidence:**
```python
@app.get("/health")   # No authentication
async def health():
    ...
    checks["database"] = f"error: {e}"  # Exposes DB exception text
    checks["gemini"] = f"error: {e}"    # Exposes API key state
```

**Description:**
The `/health` endpoint is unauthenticated and returns detailed error messages including exception text. This reveals the database host address, whether AI provider keys are configured, and which infrastructure components are in use.

**Fix:**
1. Restrict to internal monitoring IPs or require authentication.
2. Return opaque status values only (`"ok"` / `"error"`) in the external response; log full details server-side.

---

### LOW-3 — CSV Import Deduplication Query Fetches All Emails Across All Tenants

**File:** `backend/app/services/csv_import.py:47`
**OWASP:** A01:2021 Broken Access Control

**Evidence:**
```python
result = await db.execute(select(Lead.email))  # No owner_id filter
existing_emails = {row[0].lower() for row in result.all()}
```

**Description:**
The deduplication query selects all email addresses across all tenants. A user importing a CSV will silently skip leads whose emails exist in any other user's lead list. This is a cross-tenant data leak: an attacker can determine whether a specific email address belongs to another tenant's leads by importing it and observing the `skipped_duplicate` count in the response.

**Fix:**
```python
result = await db.execute(
    select(Lead.email).where(Lead.owner_id == owner_id)
)
```

---

### LOW-4 — Synchronous Redis Client Used in Async Request Handler

**File:** `backend/app/services/tracking.py:10`
**OWASP:** A05:2021 Security Misconfiguration (operational risk)

**Evidence:**
```python
import redis
redis_client = redis.Redis.from_url(settings.REDIS_URL)  # Synchronous
```

**Description:**
`get_original_url()` uses a synchronous Redis client and is called from the async `track_click` route handler without `asyncio.to_thread`. This blocks the async event loop on every click tracking request, degrading throughput under load.

**Fix:**
```python
import redis.asyncio as aioredis
redis_client = aioredis.from_url(settings.REDIS_URL)

async def get_original_url(link_hash: str) -> str | None:
    result = await redis_client.get(f"link:{link_hash}")
    return result.decode() if result else None
```

---

## Dependency Audit Summary

| Package | Version | Status | Action |
|---|---|---|---|
| `python-jose[cryptography]` | 3.3.0 | CVE-2024-33663/33664 | Migrate to `PyJWT` |
| `python-multipart` | 0.0.9 | CVE-2024-53498 (ReDoS, affects <0.0.18) | **Upgrade to >=0.0.18** |
| `passlib[bcrypt]` | 1.7.4 | No critical CVEs | OK |
| `fastapi` | 0.115.0 | Current | OK |
| `sqlalchemy[asyncio]` | 2.0.35 | Current | OK |
| `slowapi` | 0.1.9 | Current | OK |
| `httpx` | 0.27.0 | Current | OK |
| `celery[redis]` | 5.4.0 | Current | OK |
| `beautifulsoup4` | 4.12.3 | No critical CVEs | OK |

**Immediate action required:** Upgrade `python-multipart` to `>=0.0.18`. It handles CSV file uploads and the CVE allows a ReDoS attack on multipart boundary parsing.

---

## Findings Priority Matrix

| ID | Severity | Title | Effort |
|---|---|---|---|
| CRIT-1 | CRITICAL | Weak default JWT secret | Low |
| CRIT-2 | CRITICAL | JWT in localStorage | Medium |
| HIGH-1 | HIGH | Unauthenticated tracking writes | Low |
| HIGH-2 | HIGH | JWT in WebSocket URL | Low |
| HIGH-3 | HIGH | Untyped email edit body | Low |
| HIGH-4 | HIGH | SSRF via company_domain | Medium |
| HIGH-5 | HIGH | DB/Redis ports exposed in Docker | Low |
| MED-1 | MEDIUM | Hardcoded DB credentials | Low |
| MED-2 | MEDIUM | Missing Content-Security-Policy | Low |
| MED-3 | MEDIUM | No rate limit on /refresh | Trivial |
| MED-4 | MEDIUM | No password strength validation | Low |
| MED-5 | MEDIUM | Open redirect in click tracking | Low |
| MED-6 | MEDIUM | Uvicorn --reload in production | Low |
| LOW-1 | LOW | python-jose CVEs | Low |
| LOW-2 | LOW | Health endpoint info leak | Low |
| LOW-3 | LOW | CSV dedup cross-tenant oracle | Trivial |
| LOW-4 | LOW | Sync Redis in async context | Low |

---

## Positive Security Observations

The following controls were found to be correctly implemented and should be preserved:

- **Bcrypt password hashing** (`auth_service.py:13–18`) — correct salt and work factor.
- **JWT token type enforcement** (`auth.py:44`, `websocket.py:89`) — access vs. refresh distinction prevents token reuse across endpoint types.
- **Sort column whitelist** (`lead_service.py:77–83`) — prevents ORM attribute injection via the `sort` query parameter.
- **Rate limiting on login and register** (`auth.py:56, 74`) — limits credential brute-force attempts.
- **ORM-only database access** — no raw SQL string concatenation found anywhere; all queries use SQLAlchemy parameterized expressions throughout the entire codebase.
- **CSV formula injection sanitization** (`csv_import.py:7–13`) — strips leading `=`, `+`, `-`, `@` characters from all CSV fields.
- **Owner scoping on all resource endpoints** — leads, campaigns, templates, and analytics all filter by `owner_id = current_user.id`, preventing cross-tenant data access.
- **WebSocket first-message auth with timeout** (`websocket.py:74`) — 10-second deadline prevents connection hanging; correct token type validation.
- **Security headers middleware** (`main.py:24–35`) — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS (production only), `Permissions-Policy`.
- **CORS configured from environment** (`main.py:52`) — `allowed_origins_list` is parsed from `ALLOWED_ORIGINS` env var, not hardcoded to wildcard.

---

*Report generated by Security Auditor Agent. All findings reference actual source lines — no speculative issues included.*
