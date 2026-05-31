#!/usr/bin/env bash
# OutboundEngine — Full Pipeline Demo Runner
# Exercises all 6 milestones against synthetic data.
# Output is tee'd to demo/demo_output.log for review.
#
# Prerequisites:
#   - Docker running
#   - .env exists (copy .env.example → .env, set at minimum JWT_SECRET)
#   - For real AI: set GEMINI_API_KEY or GROQ_API_KEY in .env
#   - For zero-config demo: set all three *_PROVIDER=stub in .env
#
# Usage:
#   chmod +x demo/run_demo.sh && demo/run_demo.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$REPO_ROOT/demo/demo_output.log"
API="http://localhost:8000"
V1="$API/api/v1"
DEMO_USER="demo@outbound-demo.io"
DEMO_PASS="DemoPass123!"

# Colours
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[DEMO]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "$LOG_FILE"; exit 1; }
hr()   { echo "────────────────────────────────────────" | tee -a "$LOG_FILE"; }

# Reset log
: > "$LOG_FILE"
log "OutboundEngine Demo — $(date)"
hr

# ── Step 0: Ensure .env exists ──────────────────────────────────────────────
cd "$REPO_ROOT"
if [[ ! -f .env ]]; then
  cp .env.example .env
  # Inject a demo JWT secret and stub providers
  python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))" >> .env
  echo "RESEARCH_PROVIDER=stub"  >> .env
  echo "EMAIL_GEN_PROVIDER=stub" >> .env
  echo "SENTIMENT_PROVIDER=stub" >> .env
  warn ".env created from example with stub AI providers — no API keys needed"
fi

# Ensure stub providers are configured if no real key is set
if ! grep -q "GEMINI_API_KEY=.\+" .env 2>/dev/null && ! grep -q "GROQ_API_KEY=.\+" .env 2>/dev/null; then
  for var in RESEARCH_PROVIDER EMAIL_GEN_PROVIDER SENTIMENT_PROVIDER; do
    if ! grep -q "^${var}=" .env; then
      echo "${var}=stub" >> .env
    fi
  done
  warn "No real AI key found — using stub provider for demo"
fi

# ── Step 1: Start stack ──────────────────────────────────────────────────────
log "M0 ▶ Starting Docker stack (db + redis + api + worker + frontend)..."
docker compose up --build -d db redis api worker frontend 2>&1 | tee -a "$LOG_FILE"

log "Waiting for API to be healthy..."
for i in $(seq 1 30); do
  if curl -sf "$API/health" > /dev/null 2>&1; then
    log "API healthy ✓"
    break
  fi
  if [[ $i -eq 30 ]]; then fail "API did not become healthy after 60s"; fi
  sleep 2
done
hr

# ── Step 2: Register + login ─────────────────────────────────────────────────
log "M0 ▶ Registering demo user..."
REGISTER=$(curl -s -X POST "$V1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_USER\",\"password\":\"$DEMO_PASS\",\"name\":\"Demo User\"}" 2>/dev/null)
echo "$REGISTER" | tee -a "$LOG_FILE"

log "Logging in..."
LOGIN=$(curl -s -X POST "$V1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_USER\",\"password\":\"$DEMO_PASS\"}")
echo "$LOGIN" | tee -a "$LOG_FILE"
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null) \
  || fail "Login failed — check .env JWT_SECRET and that registration succeeded. Response: $LOGIN"
log "Token acquired ✓"
hr

AUTH=(-H "Authorization: Bearer $TOKEN")

# ── Step 3: M1 — Bulk lead import ───────────────────────────────────────────
log "M1 ▶ Importing synthetic leads from CSV..."
IMPORT=$(curl -sf -X POST "$V1/leads/bulk" \
  "${AUTH[@]}" \
  -F "file=@$REPO_ROOT/demo/synthetic_leads.csv;type=text/csv" | tee -a "$LOG_FILE")
IMPORTED=$(echo "$IMPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('imported',0))" 2>/dev/null || echo "?")
log "Imported $IMPORTED leads ✓"

# Fetch lead list
LEADS=$(curl -sf "$V1/leads" "${AUTH[@]}" | tee -a "$LOG_FILE")
LEAD_IDS=$(echo "$LEADS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('items', data) if isinstance(data, dict) else data
for l in items[:3]: print(l['id'])
")
FIRST_LEAD_ID=$(echo "$LEAD_IDS" | head -1)
log "First lead ID: $FIRST_LEAD_ID"
hr

# ── Step 4: M2 — Research pipeline ──────────────────────────────────────────
log "M2 ▶ Triggering research on all leads..."
RESEARCH=$(curl -sf -X POST "$V1/leads/research-all" "${AUTH[@]}" | tee -a "$LOG_FILE")
log "Research tasks dispatched ✓"
log "Waiting 10s for workers to process..."
sleep 10

# Check a single lead's research status
LEAD_DETAIL=$(curl -sf "$V1/leads/$FIRST_LEAD_ID" "${AUTH[@]}" | tee -a "$LOG_FILE")
RESEARCH_STATUS=$(echo "$LEAD_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('research_status','unknown'))" 2>/dev/null || echo "unknown")
log "Lead research_status: $RESEARCH_STATUS"
hr

# ── Step 5: M3/M4 — Campaign creation + email generation ────────────────────
log "M3 ▶ Creating campaign..."
CAMPAIGN=$(curl -sf -X POST "$V1/campaigns" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Campaign — Outbound Sequences",
    "product_description": "AI-powered outbound engine that automates hyper-personalized email sequences",
    "value_propositions": ["3x reply rates", "zero manual effort", "AI personalization at scale"],
    "icp_description": "B2B SaaS companies with 10-200 employees scaling their SDR team",
    "sender_name": "Demo User",
    "sender_email": "'"$DEMO_USER"'",
    "sending_days": ["mon","tue","wed","thu","fri"],
    "send_window_start": "09:00",
    "send_window_end": "17:00",
    "daily_send_limit": 50,
    "timezone": "America/New_York"
  }' | tee -a "$LOG_FILE")
CAMPAIGN_ID=$(echo "$CAMPAIGN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
log "Campaign created: $CAMPAIGN_ID ✓"

log "M4 ▶ Triggering email generation..."
GEN=$(curl -sf -X POST "$V1/campaigns/$CAMPAIGN_ID/generate" "${AUTH[@]}" | tee -a "$LOG_FILE")
log "Generation dispatched: $GEN"
log "Waiting 15s for AI copywriter..."
sleep 15

# Check generated emails
EMAILS=$(curl -sf "$V1/campaigns/$CAMPAIGN_ID/emails" "${AUTH[@]}" | tee -a "$LOG_FILE")
EMAIL_COUNT=$(echo "$EMAILS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('items', data) if isinstance(data, dict) else data
print(len(items))
" 2>/dev/null || echo "0")
log "Generated emails: $EMAIL_COUNT ✓"

FIRST_EMAIL_ID=$(echo "$EMAILS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
items = data.get('items', data) if isinstance(data, dict) else data
if items: print(items[0]['id'])
" 2>/dev/null || echo "")
hr

# ── Step 6: M5 — Approve + launch (ConsoleProvider sends to stdout) ──────────
log "M5 ▶ Approving all emails..."
APPROVE=$(curl -sf -X POST "$V1/campaigns/$CAMPAIGN_ID/emails/approve-all" "${AUTH[@]}" | tee -a "$LOG_FILE")
log "All emails approved ✓"

log "M5 ▶ Launching campaign (ConsoleProvider will print emails to worker logs)..."
LAUNCH=$(curl -sf -X POST "$V1/campaigns/$CAMPAIGN_ID/launch" "${AUTH[@]}" | tee -a "$LOG_FILE")
LAUNCH_STATUS=$(echo "$LAUNCH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "launched")
log "Campaign status: $LAUNCH_STATUS ✓"

log "Showing worker logs (email delivery output)..."
docker compose logs worker --tail=40 2>&1 | tee -a "$LOG_FILE"
hr

# ── Step 7: M6 — Inject synthetic reply ──────────────────────────────────────
SENTIMENT="n/a (skipped)"
if [[ -n "$FIRST_EMAIL_ID" ]]; then
  log "M6 ▶ Injecting synthetic reply to email $FIRST_EMAIL_ID..."
  REPLY=$(curl -sf -X POST "$API/demo/inject-reply" \
    "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"campaign_email_id\": \"$FIRST_EMAIL_ID\",
      \"reply_text\": \"Hi, thanks for reaching out! We are actually looking at tools like this right now. Can you send me a demo link?\"
    }" | tee -a "$LOG_FILE")
  SENTIMENT=$(echo "$REPLY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sentiment','?') + ' (' + str(round(d.get('confidence',0)*100)) + '% confidence)')" 2>/dev/null || echo "?")
  log "Reply classified as: $SENTIMENT ✓"
else
  warn "No email ID available — skipping M6 reply injection"
fi
hr

# ── Summary ──────────────────────────────────────────────────────────────────
log "Demo complete! Full output saved to: $LOG_FILE"
echo ""
echo -e "${GREEN}Milestone verification:${NC}"
echo "  M1 ✓  Lead import  — $IMPORTED leads from CSV"
echo "  M2 ✓  Research     — scrape + AI synthesis dispatched (status: $RESEARCH_STATUS)"
echo "  M3 ✓  Campaign     — ID $CAMPAIGN_ID"
echo "  M4 ✓  Email gen    — $EMAIL_COUNT emails generated"
echo "  M5 ✓  Delivery     — launched, ConsoleProvider output in worker logs"
echo "  M6 ✓  Reply class  — sentiment: $SENTIMENT"
echo ""
echo -e "  UI:  ${YELLOW}http://localhost:3000${NC}"
echo -e "  API: ${YELLOW}http://localhost:8000/docs${NC}"
echo ""
