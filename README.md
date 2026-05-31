# OutboundEngine

Active branch for local-first outreach ops app.

## Active Scope

- Auth + JWT refresh
- Lead CRUD + CSV import
- Campaign CRUD + launch/pause/resume
- Email review + approve flows
- Tracking endpoints
- Analytics + live WebSocket feed

Parked surfaces live in [NOT_WORKING.md](NOT_WORKING.md) and [`not working/`](not%20working/README.md).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite |
| API | FastAPI + SQLAlchemy |
| DB | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Migrations | Alembic |
| UI serving in Docker | Nginx |

## Project Shape

```text
outbound-engine/
├── backend/
│   ├── app/api/v1/         # active REST + websocket surfaces
│   ├── app/models/         # SQLAlchemy models
│   ├── app/services/       # auth, lead, campaign, tracking, import
│   ├── app/ai/             # provider modules kept for future re-enable
│   ├── alembic/            # DB migrations
│   └── tests/              # backend regression coverage
├── frontend/
│   ├── src/pages/          # leads, campaigns, review, dashboard, login
│   ├── src/hooks/          # react-query + websocket hooks
│   └── src/api/            # typed API client
├── docker-compose.yml      # db + redis + migrate + api + frontend
├── start.sh
├── stop.sh
└── NOT_WORKING.md
```

## Local Setup

```bash
cp .env.example .env

docker compose up -d db redis

cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev
```

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

## Docker Setup

```bash
cp .env.example .env
./start.sh
```

`start.sh` brings up supported services only:

- `db`
- `redis`
- `migrate`
- `api`
- `frontend`

## Env Notes

- `.env.example` uses `localhost` URLs for host-run backend.
- Docker Compose overrides DB/Redis hosts inside containers.
- Set strong `JWT_SECRET` before running outside tests.
- AI provider envs may stay empty unless you re-enable parked AI surfaces.

## Verification

```bash
./backend/venv/bin/python -m pytest backend/tests -q
cd frontend && npm run build
docker compose config
```
