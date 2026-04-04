# Technology Stack

**Analysis Date:** 2025-03-02

## Languages

**Primary:**
- **Python 3.12** - Backend API, business logic, and background workers. `backend/`
- **TypeScript 5.x** - Frontend application logic and type safety. `frontend/`

**Secondary:**
- **SQL** - Alembic migrations and database schema definitions. `backend/alembic/versions/`
- **HTML/CSS** - Frontend layout and styling with Tailwind CSS. `frontend/index.html`, `frontend/src/styles/globals.css`

## Runtime

**Environment:**
- **Python 3.12** (managed with venv)
- **Node.js** (managed with npm)

**Package Manager:**
- **pip** - Backend dependency management via `backend/requirements.txt`.
- **npm** - Frontend dependency management via `frontend/package.json`.
- Lockfile: `frontend/package-lock.json` present.

## Frameworks

**Core:**
- **FastAPI 0.115.0** - High-performance asynchronous backend API framework. `backend/app/main.py`
- **React 18.3.1** - Frontend UI library. `frontend/src/App.tsx`
- **Vite 6.0.0** - Frontend build tool and dev server. `frontend/vite.config.ts`

**Testing:**
- **pytest 8.3.0** - Backend unit and integration testing. `backend/tests/`
- **pytest-asyncio** - Support for testing asynchronous code.

**Build/Dev:**
- **Docker** - Containerization for local development and deployment. `docker-compose.yml`, `backend/Dockerfile`
- **Alembic 1.13.0** - Database migration tool. `backend/alembic/`

## Key Dependencies

**Critical:**
- **SQLAlchemy 2.0.35** - SQL Toolkit and Object-Relational Mapper (ORM) using `asyncio`. `backend/app/database.py`
- **Celery 5.4.0** - Asynchronous task queue for long-running processes (research, email gen). `backend/app/workers/celery_app.py`
- **Pydantic 2.x** - Data validation and settings management. `backend/app/schemas/`
- **Zod 3.24.0** - TypeScript-first schema validation for frontend. `frontend/src/api/`

**Infrastructure:**
- **Redis 5.1.0** - Message broker for Celery and potentially for caching.
- **PostgreSQL** - Primary relational database.

## Configuration

**Environment:**
- Configured via environment variables and `.env` files.
- Backend settings managed by `pydantic-settings` in `backend/app/config.py`.

**Build:**
- `backend/Dockerfile`: Multi-stage build for the Python backend.
- `frontend/vite.config.ts`: Vite configuration for React and TypeScript.

## Platform Requirements

**Development:**
- Docker and Docker Compose.
- Python 3.12+.
- Node.js (current LTS recommended).

**Production:**
- Any container-orchestration platform (Kubernetes, AWS ECS, etc.).
- Managed PostgreSQL and Redis instances recommended.

---

*Stack analysis: 2025-03-02*
