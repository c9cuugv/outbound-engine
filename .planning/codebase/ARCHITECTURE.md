# Architecture

**Analysis Date:** 2025-03-24

## Pattern Overview

**Overall:** Layered Monolith with Asynchronous Task Workers

**Key Characteristics:**
- **Layered Backend:** Strict separation between API, Business Logic (Services), and Data Persistence (Models/Schemas).
- **Asynchronous Processing:** Heavy tasks like AI generation and research are offloaded to Celery workers using Redis as a message broker.
- **Provider-Based AI Abstraction:** Decoupled AI implementation allowing for multi-provider support (Gemini, Groq, Claude, Anthropic).
- **React-Based SPA:** Modern frontend using Vite, React Router, and a component-based architecture with separate UI and feature modules.

## Layers

**API Layer (Backend):**
- Purpose: Handles HTTP requests, authentication, and request/response validation.
- Location: `backend/app/api/v1/`
- Contains: FastAPI routers, dependency injection for DB and auth.
- Depends on: `backend/app/services/`, `backend/app/schemas/`, `backend/app/models/`
- Used by: Frontend API client.

**Service Layer (Backend):**
- Purpose: Contains core business logic and orchestrates data operations.
- Location: `backend/app/services/`
- Contains: Logic for lead management, campaign execution, and third-party integrations (email, scrapers).
- Depends on: `backend/app/models/`, `backend/app/workers/`
- Used by: `backend/app/api/v1/`

**Model Layer (Backend):**
- Purpose: Defines database schema and relationships.
- Location: `backend/app/models/`
- Contains: SQLAlchemy models.
- Depends on: `backend/app/database.py`
- Used by: `backend/app/services/`, `backend/app/api/v1/`

**Worker Layer (Backend):**
- Purpose: Handles background tasks to keep the API responsive.
- Location: `backend/app/workers/`
- Contains: Celery tasks for research, email generation, and sending.
- Depends on: `backend/app/ai/`, `backend/app/services/`
- Used by: `backend/app/services/`, `backend/app/api/v1/`

**AI Abstraction Layer:**
- Purpose: Unified interface for different LLM providers.
- Location: `backend/app/ai/`
- Contains: Provider implementations, factory, and prompt templates.
- Depends on: External LLM SDKs (Google, Groq, Anthropic).
- Used by: `backend/app/workers/`

**Frontend Component Layer:**
- Purpose: Modular UI building blocks.
- Location: `frontend/src/components/`
- Contains: Reusable UI elements (`ui/`), layout shells (`layout/`), and feature-specific components (`leads/`).
- Depends on: `frontend/src/hooks/`, `frontend/src/api/`
- Used by: `frontend/src/pages/`

## Data Flow

**Campaign Execution Flow:**

1. **Frontend:** User initiates campaign via `frontend/src/pages/CampaignWizard.tsx`.
2. **API:** `backend/app/api/v1/campaigns.py` receives request and calls `campaign_service`.
3. **Service:** `backend/app/services/campaign_service.py` validates state and updates DB via `backend/app/models/campaign.py`.
4. **Worker:** Service triggers Celery task in `backend/app/workers/email_gen_tasks.py`.
5. **AI Layer:** Worker uses `backend/app/ai/factory.py` to get a provider and generate personalized content.
6. **Real-time:** Updates are pushed back to the frontend via `backend/app/api/v1/websocket.py`.
7. **Frontend:** `frontend/src/hooks/useWebSocket.ts` receives updates and refreshes the UI.

**State Management:**
- **Server State:** Managed via FastAPI and SQLAlchemy/PostgreSQL.
- **Client State:** Managed locally within React components using `useState` and `useEffect`.
- **Global State:** Minimal global state, primarily authentication and real-time event streams via WebSockets.

## Key Abstractions

**AIProvider:**
- Purpose: Abstraction for LLM interaction.
- Examples: `backend/app/ai/providers.py`
- Pattern: Abstract Base Class with Factory.

**Service Functions:**
- Purpose: Functional approach to business logic.
- Examples: `backend/app/services/lead_service.py`
- Pattern: Stateless functions taking `AsyncSession` as a dependency.

## Entry Points

**Backend API:**
- Location: `backend/app/main.py`
- Triggers: HTTP requests.
- Responsibilities: Routing, Middleware (CORS, Rate Limiting), Exception Handling.

**Worker App:**
- Location: `backend/app/workers/celery_app.py`
- Triggers: Redis task messages.
- Responsibilities: Task registration, connection to Redis.

**Frontend App:**
- Location: `frontend/src/main.tsx`
- Triggers: Browser page load.
- Responsibilities: Mounting React app, configuring routing.

## Error Handling

**Strategy:** Exception-based with specific HTTP status codes.

**Patterns:**
- **Backend:** `HTTPException` raised in routers; custom AI exceptions in `backend/app/ai/exceptions.py`.
- **Frontend:** Error boundaries and local error states in hooks/components.

## Cross-Cutting Concerns

**Logging:** Standard Python `logging` used throughout the backend, configured for console output.
**Validation:** Pydantic models in `backend/app/schemas/` for request/response validation.
**Authentication:** JWT-based authentication using OAuth2 password flow in `backend/app/api/v1/auth.py`.

---

*Architecture analysis: 2025-03-24*
