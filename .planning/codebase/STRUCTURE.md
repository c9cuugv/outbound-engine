# Codebase Structure

**Analysis Date:** 2025-03-24

## Directory Layout

```
outbound-engine/
├── backend/            # Python FastAPI backend
│   ├── alembic/        # DB migrations
│   └── app/            # Main application source code
│       ├── ai/         # AI provider implementations & prompts
│       ├── api/v1/     # REST API routers & endpoints
│       ├── models/     # SQLAlchemy DB models
│       ├── schemas/    # Pydantic request/response models
│       ├── services/   # Business logic & integrations
│       ├── utils/      # Shared helper functions
│       └── workers/    # Celery background task handlers
└── frontend/           # React + Vite frontend (TypeScript)
    └── src/            # Main application source code
        ├── api/        # API clients & service calls
        ├── components/ # Reusable React components
        ├── hooks/      # Custom React hooks
        ├── pages/      # Route-level React components
        ├── styles/     # CSS/Global styles
        └── types/      # Shared TypeScript interfaces
```

## Directory Purposes

**backend/app/api/v1/:**
- Purpose: HTTP request routing and parameter parsing.
- Contains: Feature-specific routers (`leads.py`, `campaigns.py`).
- Key files: `auth.py`, `websocket.py`.

**backend/app/services/:**
- Purpose: Heavy lifting and data orchestration.
- Contains: Functional logic decoupled from API routing.
- Key files: `lead_service.py`, `campaign_service.py`, `scraper.py`.

**backend/app/ai/:**
- Purpose: Abstracting interactions with LLMs.
- Contains: Providers (`providers.py`), prompt templates (`prompts/`), and factory logic (`factory.py`).

**frontend/src/components/:**
- Purpose: UI building blocks.
- Contains: Atomic elements (`ui/`), layout templates (`layout/`), and feature modules (`leads/`).

**frontend/src/api/:**
- Purpose: Network communication.
- Contains: Axios client configuration (`client.ts`) and endpoint-specific functions.

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: Main FastAPI entry point.
- `backend/app/workers/celery_app.py`: Celery worker configuration.
- `frontend/src/main.tsx`: React/Vite client entry point.

**Configuration:**
- `backend/app/config.py`: Centralized environment variable management.
- `frontend/package.json`: Frontend dependency and scripts definition.
- `frontend/tsconfig.json`: TypeScript compiler settings.

**Core Logic:**
- `backend/app/services/campaign_service.py`: Campaign lifecycle orchestration.
- `backend/app/ai/providers.py`: Multi-provider LLM implementations.

**Testing:**
- `backend/tests/`: Backend test suites (pytest).
- `frontend/src/tests/`: (Not detected - frontend testing is currently minimal/absent).

## Naming Conventions

**Files:**
- **Backend:** `snake_case.py` (e.g., `lead_service.py`).
- **Frontend Components:** `PascalCase.tsx` (e.g., `Button.tsx`, `LeadTable.tsx`).
- **Frontend Hooks/Utils:** `camelCase.ts` (e.g., `useLeads.ts`, `client.ts`).

**Directories:**
- **Backend:** `lowercase` or `snake_case` (e.g., `api/v1`, `services`).
- **Frontend:** `lowercase` (e.g., `api`, `components`, `hooks`).

## Where to Add New Code

**New Feature (e.g., "Analytics Export"):**
- API Router: `backend/app/api/v1/analytics.py`
- Service Logic: `backend/app/services/analytics_service.py`
- DB Model (if needed): `backend/app/models/analytics.py`
- Schema: `backend/app/schemas/analytics.py`
- Frontend Page: `frontend/src/pages/AnalyticsReport.tsx`
- Frontend API: `frontend/src/api/analytics.ts`

**New Component/Module:**
- Implementation: `frontend/src/components/[feature]/[ComponentName].tsx`
- Exports: Should be directly exported from the component file.

**Utilities:**
- Shared helpers (Backend): `backend/app/utils/`
- Shared helpers (Frontend): `frontend/src/utils/` (create if not exists)

## Special Directories

**.planning/:**
- Purpose: Project documentation and GSD mapping artifacts.
- Generated: No (manually curated or tool-generated).
- Committed: Yes.

**backend/alembic/versions/:**
- Purpose: SQL migration history.
- Generated: Yes (via `alembic revision`).
- Committed: Yes.

---

*Structure analysis: 2025-03-24*
