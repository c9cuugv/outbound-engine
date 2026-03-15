# OutboundEngine — AI-Powered Cold Outreach Campaign Orchestrator

## Complete Product Requirements Document & Build Guide

---

## 1. Product Vision

**One-liner:** An open-source system that takes a target account list, researches each company using AI, generates hyper-personalized multi-step email sequences, and manages sending with deliverability-aware scheduling and full analytics.

**Why this exists:** Companies like Instantly ($25/mo), Smartlead ($39/mo), and Saleshandy ($25/mo) charge per-seat monthly fees for what is fundamentally a workflow automation problem. The cold email market is projected to grow as outbound becomes the primary GTM motion for startups. Building this from scratch teaches you every layer of a production SaaS — from web scraping to event tracking to real-time dashboards — while creating something people will actually pay for.

**Target users:**
- Solo founders doing their own outbound
- Small sales teams (2-5 people) at seed/Series A startups
- Freelance SDRs and outbound agencies
- GTM engineers building custom outbound infrastructure

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Campaign Builder │ Lead Manager │ Analytics │ Inbox     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                  API LAYER (FastAPI)                      │
│  Auth │ Campaigns │ Leads │ Sequences │ Analytics        │
└──┬───────────┬───────────┬───────────┬──────────────────┘
   │           │           │           │
   ▼           ▼           ▼           ▼
┌──────┐  ┌────────┐  ┌────────┐  ┌──────────────────┐
│ PostgreSQL│ │ Redis  │  │ Worker │  │ AI Engine         │
│ (data) │  │(queue+ │  │(Celery │  │ (Multi-Provider)  │
│        │  │ cache) │  │/BullMQ)│  │ Gemini (default)  │
└──────┘  └────────┘  └────────┘  │ Groq (free alt)   │
                                   │ Claude Code CLI   │
                                   │ Anthropic API     │
                                   └──────────────────┘
   │           │           │           │
   │           │           ▼           │
   │           │     ┌──────────┐      │
   │           │     │ Services │      │
   │           │     │----------│      │
   │           │     │ Scraper  │◄─────┘
   │           │     │ Emailer  │
   │           │     │ Tracker  │
   │           │     │ Warmup   │
   │           │     └──────────┘
   │           │           │
   │           │           ▼
   │           │     ┌──────────┐
   │           │     │ SendGrid │
   │           │     │ /Resend  │
   │           │     │ /SMTP    │
   │           │     └──────────┘
```

---

## 3. Core Modules — Detailed Requirements

### MODULE 1: Lead Management System

#### 3.1.1 Lead Import
- **CSV Upload:** Accept CSV files with columns: `first_name`, `last_name`, `email`, `company_name`, `company_domain`, `title`, `linkedin_url` (optional)
- **Validation on upload:**
  - Email format regex + MX record check (DNS lookup to verify domain has mail server)
  - Deduplicate by email address within the same campaign
  - Flag catch-all domains (domains that accept all emails — these have lower deliverability)
  - Reject role-based emails: `info@`, `support@`, `sales@`, `admin@`
- **API Import:** POST `/api/v1/leads/bulk` accepting JSON array
- **Manual Add:** Single lead form in the UI

#### 3.1.2 Lead Data Model (PostgreSQL)

```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    company_domain VARCHAR(255),
    title VARCHAR(255),
    linkedin_url VARCHAR(500),
    
    -- Enrichment fields (populated by research module)
    company_description TEXT,
    company_industry VARCHAR(100),
    company_size VARCHAR(50),        -- '1-10', '11-50', '51-200', etc.
    company_funding_stage VARCHAR(50), -- 'seed', 'series-a', etc.
    company_tech_stack JSONB,        -- ['React', 'Python', 'AWS']
    recent_news JSONB,               -- [{title, url, date, summary}]
    pain_points JSONB,               -- AI-inferred from research
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'new', -- new, researched, in_sequence, completed, bounced, unsubscribed
    research_status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, failed
    research_completed_at TIMESTAMPTZ,
    
    -- Metadata
    tags JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    source VARCHAR(50),              -- 'csv_upload', 'api', 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(email)  -- global dedup
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_company_domain ON leads(company_domain);
CREATE INDEX idx_leads_research_status ON leads(research_status);
```

#### 3.1.3 Lead List / Segment Management

```sql
CREATE TABLE lead_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    filter_criteria JSONB,  -- saved filter for dynamic lists
    is_dynamic BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_list_members (
    lead_list_id UUID REFERENCES lead_lists(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (lead_list_id, lead_id)
);
```

**Dynamic lists** re-evaluate filter criteria on access. Example filter:
```json
{
  "company_size": ["11-50", "51-200"],
  "company_industry": "SaaS",
  "status": "researched",
  "tags": { "contains": "high-priority" }
}
```

---

### MODULE 2: Account Research Agent

This is the core differentiator — what makes your outreach personalized instead of generic spam.

#### 3.2.1 Research Pipeline

For each lead, the system runs a multi-step research pipeline:

**Step 1: Website Scraping**
```python
# research/scraper.py
import httpx
from bs4 import BeautifulSoup

class CompanyScraper:
    """Scrapes company website for key pages."""
    
    PAGES_TO_SCRAPE = [
        '/',                    # Homepage
        '/about',               # About page
        '/about-us',
        '/company',
        '/blog',                # Latest blog posts (first page only)
        '/careers',             # Hiring signals
        '/pricing',             # Business model signals
    ]
    
    async def scrape_company(self, domain: str) -> dict:
        results = {}
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for path in self.PAGES_TO_SCRAPE:
                url = f"https://{domain}{path}"
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        soup = BeautifulSoup(resp.text, 'html.parser')
                        # Remove scripts, styles, nav, footer
                        for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                            tag.decompose()
                        text = soup.get_text(separator='\n', strip=True)
                        # Truncate to ~2000 chars per page to stay within token limits
                        results[path] = text[:2000]
                except Exception:
                    continue
        return results
```

**Step 2: Additional Signal Sources**
```python
# research/signals.py

class SignalCollector:
    """Collects signals from free/freemium APIs."""
    
    async def get_tech_stack(self, domain: str) -> list[str]:
        """Use BuiltWith free API or Wappalyzer."""
        # Fallback: scrape <meta> tags, check for common script patterns
        pass
    
    async def get_hiring_signals(self, domain: str) -> list[dict]:
        """Check job boards for open positions — signals growth."""
        # Scrape greenhouse.io, lever.co career pages
        # Pattern: {domain}.greenhouse.io/jobs
        pass
    
    async def get_social_signals(self, domain: str) -> dict:
        """Check LinkedIn company page, Twitter/X for recent activity."""
        pass
    
    async def get_funding_data(self, domain: str) -> dict:
        """Check Crunchbase (free tier) or PitchBook alternatives."""
        pass
```

**Step 3: AI Research Synthesis**
```python
# research/synthesizer.py

RESEARCH_PROMPT = """
You are a B2B sales research analyst. Given the following scraped data 
about a company, produce a structured research brief.

Company: {company_name} ({domain})
Contact: {first_name} {last_name}, {title}

--- SCRAPED DATA ---
{scraped_content}
--- END SCRAPED DATA ---

Respond ONLY with this JSON structure:
{
  "company_summary": "2-3 sentence description of what they do",
  "industry": "primary industry category",
  "company_size_estimate": "1-10 | 11-50 | 51-200 | 201-1000 | 1000+",
  "business_model": "SaaS | marketplace | agency | ecommerce | other",
  "tech_stack_signals": ["list", "of", "technologies", "detected"],
  "recent_developments": ["any news, launches, or changes detected"],
  "potential_pain_points": [
    "inferred pain point 1 based on their stage/industry",
    "inferred pain point 2"
  ],
  "personalization_hooks": [
    "specific detail that could be used in outreach",
    "another specific, non-generic observation"
  ],
  "hiring_signals": "actively hiring | selective | no signals",
  "confidence_score": 0.0-1.0
}
"""

async def synthesize_research(lead: dict, scraped_data: dict) -> dict:
    prompt = RESEARCH_PROMPT.format(
        company_name=lead['company_name'],
        domain=lead['company_domain'],
        first_name=lead['first_name'],
        last_name=lead['last_name'],
        title=lead['title'],
        scraped_content=format_scraped_content(scraped_data)
    )
    
    response = await call_claude_api(
        model="claude-sonnet-4-20250514",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000
    )
    
    return parse_json_response(response)
```

#### 3.2.2 Research Job Queue

```python
# research/worker.py
from celery import Celery

app = Celery('research', broker='redis://localhost:6379/0')

@app.task(bind=True, max_retries=3, rate_limit='10/m')
def research_lead(self, lead_id: str):
    """
    Rate limited to 10 leads/minute to avoid:
    - Getting blocked by target websites
    - Hitting API rate limits on Claude
    - Overwhelming free-tier enrichment APIs
    """
    try:
        lead = get_lead(lead_id)
        update_lead_status(lead_id, research_status='in_progress')
        
        # Step 1: Scrape
        scraped = scraper.scrape_company(lead['company_domain'])
        
        # Step 2: Signals
        signals = signal_collector.collect_all(lead['company_domain'])
        
        # Step 3: AI Synthesis
        research = synthesize_research(lead, {**scraped, **signals})
        
        # Step 4: Store
        update_lead_with_research(lead_id, research)
        update_lead_status(lead_id, research_status='completed')
        
    except Exception as exc:
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
```

---

### MODULE 3: AI Email Generation Engine

#### 3.3.1 Template System

Templates use a combination of static structure and AI-generated personalization:

```sql
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- The prompt sent to AI, NOT the final email
    system_prompt TEXT NOT NULL,       -- Your product context, tone, constraints
    generation_prompt TEXT NOT NULL,   -- Per-email instructions with {variables}
    
    -- Constraints for the AI
    max_word_count INT DEFAULT 120,
    tone VARCHAR(50) DEFAULT 'professional-casual', -- professional-casual, formal, friendly
    
    -- Sequence position
    sequence_position INT NOT NULL,   -- 1 = initial, 2 = follow-up 1, etc.
    days_delay INT DEFAULT 0,         -- days after previous step
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example System Prompt (stored once per campaign):**
```
You are a sales copywriter for {product_name}.

Product: {product_description}
Target ICP: {icp_description}
Value proposition: {value_prop}

Rules:
- Max {max_word_count} words
- No buzzwords: "synergy", "leverage", "cutting-edge", "game-changer"
- No fake urgency: "limited time", "act now"  
- Sound like a real human, not a sales robot
- One clear CTA per email
- Never start with "I hope this email finds you well"
- Reference specific details from the research to show you've done homework
- Keep paragraphs to 2-3 sentences max
```

**Example Generation Prompt for Email 1 (Initial Outreach):**
```
Write a cold email to {first_name} {last_name}, {title} at {company_name}.

Research context:
- Company does: {company_summary}
- Personalization hooks: {personalization_hooks}
- Pain points: {potential_pain_points}
- Recent developments: {recent_developments}

This is the FIRST email in the sequence. Goals:
1. Open with something specific about their company (NOT generic flattery)
2. Connect their situation to a problem we solve
3. End with a soft CTA — suggest a quick call, not "buy now"

Subject line: Write 3 options. Keep under 6 words. No clickbait.

Return JSON:
{
  "subject_options": ["option1", "option2", "option3"],
  "body": "the email body with proper line breaks"
}
```

**Example Generation Prompt for Email 2 (Follow-up, +3 days):**
```
Write follow-up #1 to {first_name} at {company_name}.

Context from initial email:
- Subject used: {previous_subject}
- Key point made: {previous_key_point}
- CTA: {previous_cta}

Status: No reply received.

Rules for this follow-up:
- DO NOT just say "following up on my last email"
- Add NEW value — share a relevant insight, case study stat, or angle
- Keep it shorter than the first email (max 80 words)
- Reference the first email casually, don't rehash it
- Different CTA angle (e.g., if first was "grab a call", this could be "send over a quick demo video?")
```

#### 3.3.2 Generation Pipeline

```python
# email_gen/generator.py

class EmailGenerator:
    
    async def generate_sequence_for_lead(
        self, 
        lead: dict, 
        campaign: dict,
        templates: list[dict]
    ) -> list[dict]:
        """Generate all emails in the sequence for one lead."""
        
        generated_emails = []
        previous_context = {}
        
        for template in sorted(templates, key=lambda t: t['sequence_position']):
            # Build the prompt with lead research + campaign context
            prompt = self._build_prompt(
                template=template,
                lead=lead,
                campaign=campaign,
                previous_context=previous_context
            )
            
            response = await call_claude_api(
                model="claude-sonnet-4-20250514",
                system=campaign['system_prompt'],
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,
                temperature=0.7  # Some creativity, not too wild
            )
            
            email_data = parse_json_response(response)
            
            generated_emails.append({
                'lead_id': lead['id'],
                'template_id': template['id'],
                'sequence_position': template['sequence_position'],
                'subject': email_data['subject_options'][0],  # Pick first, user can change
                'subject_alternatives': email_data['subject_options'][1:],
                'body': email_data['body'],
                'status': 'draft',  # Always starts as draft
                'scheduled_at': None,
                'days_delay': template['days_delay']
            })
            
            # Feed context forward for follow-up coherence
            previous_context = {
                'previous_subject': email_data['subject_options'][0],
                'previous_body_summary': email_data['body'][:200],
                'previous_key_point': email_data.get('key_point', ''),
            }
        
        return generated_emails
```

#### 3.3.3 Generated Email Storage

```sql
CREATE TABLE generated_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id),
    
    sequence_position INT NOT NULL,
    subject VARCHAR(500) NOT NULL,
    subject_alternatives JSONB DEFAULT '[]',
    body TEXT NOT NULL,
    
    -- Edit tracking
    body_original TEXT,              -- AI-generated version preserved
    was_manually_edited BOOLEAN DEFAULT false,
    
    -- Sending
    status VARCHAR(20) DEFAULT 'draft',  
    -- draft -> approved -> scheduled -> sent -> opened -> clicked -> replied -> bounced
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    
    -- A/B testing
    variant_group VARCHAR(10),       -- 'A', 'B', or null
    
    -- Tracking events
    opened_at TIMESTAMPTZ,
    opened_count INT DEFAULT 0,
    clicked_at TIMESTAMPTZ,
    clicked_count INT DEFAULT 0,
    replied_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    bounce_type VARCHAR(20),         -- 'hard', 'soft'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_status ON generated_emails(status);
CREATE INDEX idx_emails_scheduled ON generated_emails(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_emails_campaign ON generated_emails(campaign_id);
```

---

### MODULE 4: Campaign Management

#### 3.4.1 Campaign Data Model

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- Product/sender context (fed into AI prompts)
    product_name VARCHAR(255),
    product_description TEXT,
    icp_description TEXT,            -- "Series A SaaS founders with 20-50 employees"
    value_prop TEXT,
    system_prompt TEXT,              -- Master prompt for email generation
    
    -- Sending configuration
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    reply_to_email VARCHAR(255),
    
    -- Scheduling
    sending_timezone VARCHAR(50) DEFAULT 'America/Phoenix',
    sending_days JSONB DEFAULT '["mon","tue","wed","thu","fri"]',
    sending_window_start TIME DEFAULT '09:00',
    sending_window_end TIME DEFAULT '17:00',
    max_emails_per_day INT DEFAULT 30,
    min_delay_between_emails_seconds INT DEFAULT 120,  -- 2 min minimum gap
    
    -- A/B testing
    ab_test_enabled BOOLEAN DEFAULT false,
    ab_split_percentage INT DEFAULT 50,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, generating, review, active, paused, completed
    
    -- Stats (denormalized for fast dashboard queries)
    total_leads INT DEFAULT 0,
    emails_sent INT DEFAULT 0,
    emails_opened INT DEFAULT 0,
    emails_clicked INT DEFAULT 0,
    emails_replied INT DEFAULT 0,
    emails_bounced INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.4.2 Campaign Lifecycle

```
[CREATE] → draft
    │
    ▼ (user clicks "Generate Emails")
[GENERATE] → generating
    │ (research + email gen runs async for all leads)
    ▼
[REVIEW] → review
    │ (user reviews/edits drafts, approves individually or bulk)
    ▼ (user clicks "Launch Campaign")  
[ACTIVATE] → active
    │ (scheduler starts sending approved emails)
    │
    ├── [PAUSE] → paused (user can pause/resume)
    │       │
    │       ▼ (resume)
    │     active
    │
    ▼ (all sequences complete)
[COMPLETE] → completed
```

---

### MODULE 5: Sending Engine & Deliverability

#### 3.5.1 Scheduler

```python
# sender/scheduler.py

class EmailScheduler:
    """
    Runs every minute via Celery Beat.
    Picks up emails that are approved and due to send.
    """
    
    def schedule_campaign_emails(self, campaign_id: str):
        """
        For each lead in the campaign, calculate send times 
        for their entire sequence.
        """
        campaign = get_campaign(campaign_id)
        emails = get_campaign_emails(campaign_id, status='approved')
        
        for email in emails:
            send_at = self._calculate_send_time(
                email=email,
                campaign=campaign,
                lead=get_lead(email['lead_id'])
            )
            update_email(email['id'], scheduled_at=send_at, status='scheduled')
    
    def _calculate_send_time(self, email, campaign, lead) -> datetime:
        """
        Calculate optimal send time based on:
        1. Previous email in sequence (must respect days_delay)
        2. Campaign sending window (9am-5pm in target timezone)
        3. Campaign sending days (weekdays only by default)
        4. Daily send limit (spread across the window)
        5. Random jitter (±15 min to appear human)
        """
        if email['sequence_position'] == 1:
            base_time = self._next_available_slot(campaign)
        else:
            prev_email = get_previous_email(email)
            base_time = prev_email['sent_at'] + timedelta(days=email['days_delay'])
        
        # Ensure within sending window
        send_time = self._fit_to_window(base_time, campaign)
        
        # Add human-like jitter
        jitter = random.randint(-900, 900)  # ±15 min
        send_time += timedelta(seconds=jitter)
        
        return send_time


@app.task
def process_scheduled_emails():
    """Celery Beat task — runs every 60 seconds."""
    emails = get_emails_due_to_send(
        status='scheduled',
        scheduled_before=datetime.utcnow()
    )
    
    for email in emails:
        send_email.delay(email['id'])


@app.task(bind=True, max_retries=3, rate_limit='1/s')
def send_email(self, email_id: str):
    """Send a single email with full tracking setup."""
    email = get_email(email_id)
    lead = get_lead(email['lead_id'])
    campaign = get_campaign(email['campaign_id'])
    
    # Check if lead replied or unsubscribed since scheduling
    if lead['status'] in ('replied', 'unsubscribed', 'bounced'):
        cancel_remaining_sequence(lead['id'], campaign['id'])
        return
    
    try:
        # Inject tracking pixel and link tracking
        tracked_body = inject_tracking(email['body'], email['id'])
        
        # Send via configured provider
        result = email_provider.send(
            from_email=campaign['sender_email'],
            from_name=campaign['sender_name'],
            to_email=lead['email'],
            subject=email['subject'],
            html_body=tracked_body,
            reply_to=campaign['reply_to_email'],
            headers={
                'X-Campaign-ID': str(campaign['id']),
                'X-Email-ID': str(email['id']),
                'List-Unsubscribe': f'<mailto:unsubscribe@yourdomain.com?subject=unsubscribe-{email["id"]}>'
            }
        )
        
        update_email(email['id'], status='sent', sent_at=datetime.utcnow())
        increment_campaign_stat(campaign['id'], 'emails_sent')
        
    except HardBounceError:
        update_email(email['id'], status='bounced', bounce_type='hard')
        update_lead(lead['id'], status='bounced')
        cancel_remaining_sequence(lead['id'], campaign['id'])
        
    except SoftBounceError as exc:
        self.retry(exc=exc, countdown=3600)  # Retry in 1 hour
```

#### 3.5.2 Email Tracking (Build Your Own)

This is where you learn event-driven systems. You build a tracking server that handles open/click events.

```python
# tracking/server.py
from fastapi import FastAPI, Response, Request
from fastapi.responses import RedirectResponse

tracking_app = FastAPI()

# OPEN TRACKING — 1x1 transparent pixel
@tracking_app.get("/t/o/{email_id}.png")
async def track_open(email_id: str, request: Request):
    """
    Embedded as <img src="https://track.yourdomain.com/t/o/{id}.png" 
    width="1" height="1"> at the end of every email.
    """
    # Fire-and-forget: publish event to Redis, don't slow down response
    await publish_event('email_opened', {
        'email_id': email_id,
        'ip': request.client.host,
        'user_agent': request.headers.get('user-agent', ''),
        'timestamp': datetime.utcnow().isoformat()
    })
    
    # Return 1x1 transparent PNG
    pixel = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    return Response(content=pixel, media_type="image/png")


# CLICK TRACKING — redirect through tracking server
@tracking_app.get("/t/c/{email_id}/{link_hash}")
async def track_click(email_id: str, link_hash: str, request: Request):
    """
    All links in emails are rewritten:
    https://example.com → https://track.yourdomain.com/t/c/{id}/{hash}
    """
    original_url = await get_original_url(link_hash)
    
    await publish_event('email_clicked', {
        'email_id': email_id,
        'link_url': original_url,
        'ip': request.client.host,
        'user_agent': request.headers.get('user-agent', ''),
        'timestamp': datetime.utcnow().isoformat()
    })
    
    return RedirectResponse(url=original_url, status_code=302)


# UNSUBSCRIBE — one-click
@tracking_app.get("/t/u/{email_id}")
async def handle_unsubscribe(email_id: str):
    email = get_email(email_id)
    update_lead(email['lead_id'], status='unsubscribed')
    cancel_remaining_sequence(email['lead_id'], email['campaign_id'])
    return HTMLResponse("<h1>You've been unsubscribed.</h1><p>You won't receive further emails.</p>")
```

#### 3.5.3 Event Processing Worker

```python
# tracking/event_processor.py

@app.task
def process_tracking_event(event_type: str, data: dict):
    """Process tracking events from Redis pub/sub."""
    email_id = data['email_id']
    email = get_email(email_id)
    
    if event_type == 'email_opened':
        if not email['opened_at']:  # First open
            update_email(email_id, opened_at=data['timestamp'])
            increment_campaign_stat(email['campaign_id'], 'emails_opened')
        update_email(email_id, opened_count=email['opened_count'] + 1)
        
        # Store raw event for analytics
        store_tracking_event(email_id, event_type, data)
    
    elif event_type == 'email_clicked':
        if not email['clicked_at']:  # First click
            update_email(email_id, clicked_at=data['timestamp'])
            increment_campaign_stat(email['campaign_id'], 'emails_clicked')
        update_email(email_id, clicked_count=email['clicked_count'] + 1)
        store_tracking_event(email_id, event_type, data)


# Tracking events table for detailed analytics
"""
CREATE TABLE tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID REFERENCES generated_emails(id),
    event_type VARCHAR(20) NOT NULL,  -- opened, clicked, bounced, unsubscribed
    ip_address INET,
    user_agent TEXT,
    link_url TEXT,                     -- for click events
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_email ON tracking_events(email_id);
CREATE INDEX idx_tracking_type ON tracking_events(event_type);
CREATE INDEX idx_tracking_created ON tracking_events(created_at);
"""
```

---

### MODULE 6: Reply Detection & Sequence Control

#### 3.6.1 Reply Detection

Two approaches (implement both):

**Approach A: Webhook from email provider**
```python
# SendGrid/Resend fire webhooks on inbound replies
@app.post("/webhooks/email-provider")
async def handle_email_webhook(payload: dict):
    event_type = payload.get('event')
    
    if event_type == 'inbound':
        # Match reply to original email via In-Reply-To header or threading
        original_email_id = extract_email_id_from_headers(payload)
        if original_email_id:
            handle_reply(original_email_id, payload)
```

**Approach B: IMAP polling (more reliable)**
```python
# sender/reply_checker.py
import imaplib

@app.task  # Runs every 5 minutes via Celery Beat
def check_for_replies():
    """Poll inbox via IMAP for new replies."""
    mail = imaplib.IMAP4_SSL('imap.gmail.com')
    mail.login(EMAIL, PASSWORD)
    mail.select('inbox')
    
    # Search for emails received since last check
    _, messages = mail.search(None, f'(SINCE "{last_check_date}")')
    
    for msg_id in messages[0].split():
        _, msg_data = mail.fetch(msg_id, '(RFC822)')
        email_msg = email.message_from_bytes(msg_data[0][1])
        
        # Match to our campaigns via In-Reply-To or subject threading
        original = match_reply_to_campaign(email_msg)
        if original:
            handle_reply(original['id'], {
                'from': email_msg['From'],
                'subject': email_msg['Subject'],
                'body': extract_body(email_msg),
                'received_at': email_msg['Date']
            })
```

#### 3.6.2 Reply Handling

```python
def handle_reply(email_id: str, reply_data: dict):
    """When a lead replies, stop their sequence immediately."""
    email = get_email(email_id)
    lead = get_lead(email['lead_id'])
    campaign = get_campaign(email['campaign_id'])
    
    # 1. Update email status
    update_email(email_id, status='replied', replied_at=reply_data['received_at'])
    
    # 2. Update lead status
    update_lead(lead['id'], status='replied')
    
    # 3. Cancel all remaining scheduled emails for this lead
    cancel_remaining_sequence(lead['id'], campaign['id'])
    
    # 4. Update campaign stats
    increment_campaign_stat(campaign['id'], 'emails_replied')
    
    # 5. AI sentiment classification
    sentiment = classify_reply_sentiment(reply_data['body'])
    # Returns: 'interested', 'not_interested', 'out_of_office', 'unsubscribe', 'question'
    
    store_reply(email_id, reply_data, sentiment)
    
    # 6. Notify user (Slack webhook or in-app notification)
    notify_reply(campaign, lead, reply_data, sentiment)
```

---

### MODULE 7: Analytics Dashboard

#### 3.7.1 API Endpoints

```python
# api/analytics.py

@router.get("/campaigns/{campaign_id}/analytics")
async def get_campaign_analytics(campaign_id: str):
    campaign = get_campaign(campaign_id)
    
    return {
        "overview": {
            "total_leads": campaign['total_leads'],
            "emails_sent": campaign['emails_sent'],
            "open_rate": safe_divide(campaign['emails_opened'], campaign['emails_sent']),
            "click_rate": safe_divide(campaign['emails_clicked'], campaign['emails_sent']),
            "reply_rate": safe_divide(campaign['emails_replied'], campaign['emails_sent']),
            "bounce_rate": safe_divide(campaign['emails_bounced'], campaign['emails_sent']),
        },
        "by_sequence_step": get_stats_by_step(campaign_id),
        # Returns: [{step: 1, sent: 100, opened: 45, clicked: 12, replied: 5}, ...]
        
        "by_day": get_stats_by_day(campaign_id),
        # Returns: [{date: "2026-03-10", sent: 30, opened: 12, ...}, ...]
        
        "ab_test_results": get_ab_results(campaign_id) if campaign['ab_test_enabled'] else None,
        # Returns: {variant_a: {sent, opened, ...}, variant_b: {sent, opened, ...}, winner: "A", confidence: 0.95}
        
        "top_performing_subjects": get_top_subjects(campaign_id, limit=5),
        
        "reply_sentiment_breakdown": get_sentiment_breakdown(campaign_id),
        # Returns: {interested: 12, not_interested: 5, out_of_office: 3, question: 2}
    }


@router.get("/campaigns/{campaign_id}/leads/{lead_id}/timeline")
async def get_lead_timeline(campaign_id: str, lead_id: str):
    """Full timeline of all interactions with a single lead."""
    return {
        "lead": get_lead(lead_id),
        "research": get_lead_research(lead_id),
        "events": get_lead_events(lead_id, campaign_id)
        # Returns chronological list:
        # [{type: "email_sent", step: 1, at: "...", subject: "..."},
        #  {type: "email_opened", step: 1, at: "...", device: "mobile"},
        #  {type: "link_clicked", step: 1, at: "...", url: "..."},
        #  {type: "reply_received", step: 1, at: "...", sentiment: "interested"}]
    }
```

#### 3.7.2 Real-Time Updates (WebSocket)

```python
# api/websocket.py

@app.websocket("/ws/campaigns/{campaign_id}")
async def campaign_live_feed(websocket: WebSocket, campaign_id: str):
    """Push real-time events to the dashboard."""
    await websocket.accept()
    
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"campaign:{campaign_id}:events")
    
    try:
        async for message in pubsub.listen():
            if message['type'] == 'message':
                await websocket.send_json(json.loads(message['data']))
    except WebSocketDisconnect:
        await pubsub.unsubscribe()
```

---

## 4. API Design — Full Endpoint Map

```
POST   /api/v1/auth/register          # User registration
POST   /api/v1/auth/login             # JWT token
POST   /api/v1/auth/refresh           # Token refresh

# Leads
POST   /api/v1/leads                  # Create single lead
POST   /api/v1/leads/bulk             # Bulk import (CSV or JSON)
GET    /api/v1/leads                  # List with filters & pagination
GET    /api/v1/leads/{id}            # Get lead details + research
PATCH  /api/v1/leads/{id}            # Update lead
DELETE /api/v1/leads/{id}            # Soft delete
POST   /api/v1/leads/{id}/research   # Trigger research for one lead

# Lead Lists
POST   /api/v1/lists                  # Create list
GET    /api/v1/lists                  # Get all lists
POST   /api/v1/lists/{id}/leads      # Add leads to list
DELETE /api/v1/lists/{id}/leads      # Remove leads from list

# Campaigns
POST   /api/v1/campaigns              # Create campaign
GET    /api/v1/campaigns              # List campaigns
GET    /api/v1/campaigns/{id}        # Campaign details
PATCH  /api/v1/campaigns/{id}        # Update campaign
POST   /api/v1/campaigns/{id}/generate  # Trigger email generation
POST   /api/v1/campaigns/{id}/launch    # Start sending
POST   /api/v1/campaigns/{id}/pause     # Pause campaign
POST   /api/v1/campaigns/{id}/resume    # Resume campaign

# Emails (within campaign)
GET    /api/v1/campaigns/{id}/emails              # All generated emails
GET    /api/v1/campaigns/{id}/emails/{email_id}  # Single email
PATCH  /api/v1/campaigns/{id}/emails/{email_id}  # Edit draft
POST   /api/v1/campaigns/{id}/emails/approve     # Bulk approve
POST   /api/v1/campaigns/{id}/emails/{email_id}/regenerate  # Re-generate with AI

# Templates
POST   /api/v1/templates              # Create template
GET    /api/v1/templates              # List templates
PATCH  /api/v1/templates/{id}        # Update template

# Analytics
GET    /api/v1/campaigns/{id}/analytics          # Campaign analytics
GET    /api/v1/campaigns/{id}/leads/{lead_id}/timeline  # Lead timeline

# Webhooks (for email provider callbacks)
POST   /api/v1/webhooks/sendgrid     # SendGrid event webhook
POST   /api/v1/webhooks/resend       # Resend event webhook

# Tracking (separate subdomain: track.yourdomain.com)
GET    /t/o/{email_id}.png           # Open tracking pixel
GET    /t/c/{email_id}/{link_hash}   # Click tracking redirect
GET    /t/u/{email_id}              # Unsubscribe
```

---

## 5. Frontend — Key Screens

### Screen 1: Campaign Builder (React)
```
┌──────────────────────────────────────────┐
│ Campaign: "Q1 Outreach to SaaS Founders" │
├──────────────────────────────────────────┤
│ STEP 1: Define Your Product              │
│ ┌──────────────────────────────────────┐ │
│ │ Product Name: [OutboundEngine      ] │ │
│ │ Description:  [We help startups...  ] │ │
│ │ ICP:          [Series A SaaS CTO... ] │ │
│ │ Value Prop:   [3x reply rates...   ] │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ STEP 2: Add Leads                        │
│ [Upload CSV] [Select from Lists] [100 leads loaded] │
│                                          │
│ STEP 3: Configure Sequence               │
│ ┌────────┐    ┌────────┐    ┌────────┐  │
│ │Email 1 │───→│Email 2 │───→│Email 3 │  │
│ │Day 0   │    │Day 3   │    │Day 7   │  │
│ │Initial │    │Value++ │    │Breakup │  │
│ └────────┘    └────────┘    └────────┘  │
│                                          │
│ STEP 4: Sending Settings                 │
│ Timezone: [America/Phoenix ▼]            │
│ Days: [x]Mon [x]Tue [x]Wed [x]Thu [x]Fri│
│ Window: [09:00] to [17:00]               │
│ Max/day: [30]                            │
│                                          │
│ [Generate Emails →]                      │
└──────────────────────────────────────────┘
```

### Screen 2: Email Review Queue
```
┌──────────────────────────────────────────┐
│ Review Emails  [Approve All] [Regenerate Selected] │
├──────────────────────────────────────────┤
│ ┌── Lead: Sarah Chen, CTO @ DataFlow ───┐│
│ │ Step 1 | Subject: Quick thought on... ││
│ │ ┌────────────────────────────────────┐ ││
│ │ │ Hi Sarah,                          │ ││
│ │ │                                    │ ││
│ │ │ Noticed DataFlow just shipped the  │ ││
│ │ │ real-time pipeline feature — the   │ ││
│ │ │ architecture post your team wrote  │ ││
│ │ │ was really sharp...                │ ││
│ │ │                                    │ ││
│ │ │ [editable text area]               │ ││
│ │ └────────────────────────────────────┘ ││
│ │ [✓ Approve] [✏ Edit] [🔄 Regenerate] ││
│ └────────────────────────────────────────┘│
│ ┌── Lead: Mike Torres, VP Sales @ ...  ──┐│
│ │ ...                                    ││
│ └────────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### Screen 3: Live Campaign Dashboard
```
┌──────────────────────────────────────────┐
│ Campaign: Q1 SaaS Outreach    [ACTIVE 🟢]│
├──────────────────────────────────────────┤
│  Sent    Opened   Clicked   Replied      │
│  247     112      34        18           │
│  100%    45.3%    13.8%     7.3%         │
│                                          │
│ [═══════════════════════ line chart ════] │
│ (daily send volume + open/reply overlay) │
│                                          │
│ ── By Sequence Step ──                   │
│ Step 1: 100 sent → 48% open → 8% reply  │
│ Step 2:  72 sent → 42% open → 6% reply  │
│ Step 3:  55 sent → 38% open → 4% reply  │
│                                          │
│ ── Recent Activity (live) ──             │
│ 🟢 2:34pm  Sarah Chen opened Email 1    │
│ 💬 2:31pm  Mike Torres replied (interested)│
│ 📧 2:28pm  Email sent to Alex Kim       │
│ 🔗 2:25pm  Jane Doe clicked pricing link│
└──────────────────────────────────────────┘
```

---

## 6. Build Phases — Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
**Goal:** Get the core data layer and API scaffold running.

- [ ] Set up monorepo: `/backend` (FastAPI), `/frontend` (React + Vite), `/docker`
- [ ] Docker Compose with PostgreSQL, Redis
- [ ] Database migrations (Alembic)
- [ ] Lead CRUD API with CSV import
- [ ] Lead list management
- [ ] Basic auth (JWT)
- [ ] React shell with routing (React Router)
- [ ] Lead table view with sorting/filtering

**Deliverable:** You can upload a CSV and see leads in a table.

### Phase 2: Research Engine (Week 3-4)
**Goal:** Automated company research pipeline.

- [ ] Website scraper (httpx + BeautifulSoup)
- [ ] AI research synthesis (Claude API integration)
- [ ] Celery worker setup with Redis broker
- [ ] Research queue with rate limiting
- [ ] Research results stored on lead records
- [ ] UI: Research status indicators, expandable research panel per lead

**Deliverable:** Upload leads → they get auto-researched → you see company intel in the UI.

### Phase 3: Email Generation (Week 5-6)
**Goal:** AI generates personalized email sequences.

- [ ] Template system (CRUD)
- [ ] Campaign creation flow
- [ ] Email generation pipeline (research → prompt → generate)
- [ ] Draft review UI (edit, approve, regenerate)
- [ ] A/B variant support
- [ ] Subject line alternatives

**Deliverable:** Create a campaign → emails are generated → you can review and edit them.

### Phase 4: Sending & Tracking (Week 7-8)
**Goal:** Actually send emails and track engagement.

- [ ] SendGrid or Resend integration
- [ ] Scheduler (Celery Beat)
- [ ] Sending window + daily limit logic
- [ ] Open tracking pixel endpoint
- [ ] Click tracking redirect endpoint
- [ ] Unsubscribe handling
- [ ] Bounce handling
- [ ] Reply detection (IMAP polling)
- [ ] Sequence auto-stop on reply/bounce/unsubscribe

**Deliverable:** Emails go out on schedule, opens/clicks tracked in real-time.

### Phase 5: Dashboard & Polish (Week 9-10)
**Goal:** Full analytics and production readiness.

- [ ] Campaign analytics API
- [ ] Dashboard charts (Recharts)
- [ ] Lead timeline view
- [ ] WebSocket live activity feed
- [ ] Reply sentiment classification
- [ ] A/B test results with statistical significance
- [ ] Error handling, logging, retry logic
- [ ] README, API docs, deployment guide

**Deliverable:** Full working product, ready to demo.

---

## 7. LLM Provider Strategy

### 7.1 Decision: Multi-Provider Architecture with Free Default

The system supports swappable AI providers. Users configure which provider handles each task. Default is Gemini Flash (completely free, no credit card).

### 7.2 Available Providers

| Provider | Model | Cost | Rate Limits | Best For |
|----------|-------|------|-------------|----------|
| Google Gemini | 2.0 Flash | FREE | 15 RPM, 1M TPM | Default for all tasks |
| Groq | Llama 3.1 70B | FREE | 30 RPM, 15K tokens/min | Alternative free option |
| Claude Code CLI | Claude Sonnet | Included with Pro/Max plan | Plan limits | Best quality email generation |
| Anthropic API | Claude Sonnet | ~$3/$15 per MTok in/out | Tier-based | Production scale, highest quality |

### 7.3 Provider Interface

All providers implement the same interface. The app never calls a provider directly — it goes through the factory.

```python
# ai/providers.py
from abc import ABC, abstractmethod
import json

class AIProvider(ABC):
    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        pass

    async def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        raw = await self.generate(system_prompt, user_prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return json.loads(cleaned.strip())


class GeminiProvider(AIProvider):
    """FREE. Default provider. No credit card needed."""

    def __init__(self, api_key: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = self.model.generate_content(
            f"{system_prompt}\n\n{user_prompt}"
        )
        return response.text


class GroqProvider(AIProvider):
    """FREE. Runs Llama 70B on Groq hardware."""

    def __init__(self, api_key: str):
        from groq import Groq
        self.client = Groq(api_key=api_key)

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = self.client.chat.completions.create(
            model="llama-3.1-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        return response.choices[0].message.content


class ClaudeCodeProvider(AIProvider):
    """Uses local Claude Code CLI. Requires Pro/Max subscription."""

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        import subprocess
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        result = subprocess.run(
            ["claude", "-p", full_prompt, "--output-format", "json"],
            capture_output=True, text=True, timeout=120
        )
        parsed = json.loads(result.stdout)
        return parsed.get("result", result.stdout)


class AnthropicAPIProvider(AIProvider):
    """Paid API. Best quality. For production or users with API keys."""

    def __init__(self, api_key: str):
        from anthropic import Anthropic
        self.client = Anthropic(api_key=api_key)

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        return response.content[0].text
```

### 7.4 Provider Factory

```python
# ai/factory.py

def get_provider(task: str) -> AIProvider:
    config = load_config()

    providers = {
        "gemini": lambda: GeminiProvider(config['GEMINI_API_KEY']),
        "groq": lambda: GroqProvider(config['GROQ_API_KEY']),
        "claude_code": lambda: ClaudeCodeProvider(),
        "anthropic_api": lambda: AnthropicAPIProvider(config['ANTHROPIC_API_KEY']),
    }

    provider_name = config.get(f'{task}_provider', 'gemini')
    return providers[provider_name]()
```

### 7.5 User Configuration

```env
# .env — User sets these based on what they have available

# REQUIRED: At least one provider key
GEMINI_API_KEY=AIza...              # Free from aistudio.google.com

# OPTIONAL: Additional/alternative providers
GROQ_API_KEY=gsk_...               # Free from console.groq.com
ANTHROPIC_API_KEY=sk-ant-...       # Paid — only if user has API access

# Task-to-provider mapping (defaults to gemini for all)
RESEARCH_PROVIDER=gemini
EMAIL_GEN_PROVIDER=gemini
SENTIMENT_PROVIDER=gemini
```

---

## 8. Anti-Hallucination Strategy

### 8.1 Core Principle

The LLM in this system does NOT need to "know" anything. It only processes data we explicitly provide. Every LLM call follows this rule: **structured data in, structured data out, validated before use.**

### 8.2 Strategy 1: Never Let the Model Guess

The LLM only receives scraped/verified data. If scraping fails, the pipeline stops — it does NOT ask the LLM to fill gaps from its training data.

```python
async def research_lead(lead_id: str):
    lead = get_lead(lead_id)
    scraped = await scraper.scrape_company(lead['company_domain'])

    # CRITICAL: If no data scraped, do NOT send to LLM
    if not scraped or all(v == '' for v in scraped.values()):
        update_lead(lead_id,
            research_status='failed',
            research_notes='Could not scrape website. No data to analyze.'
        )
        return  # Stop here. Do not fabricate research.

    # ... proceed with LLM only when real data exists
```

Every prompt explicitly states:
```
Use ONLY the information provided below.
Do not invent any facts, statistics, or claims.
If information is missing, set the field to "unknown".
```

### 8.3 Strategy 2: Pydantic Schema Validation on Every LLM Output

No free-form text is ever accepted. Every response is validated against a strict schema.

```python
# ai/schemas.py
from pydantic import BaseModel, Field, validator

class ResearchOutput(BaseModel):
    company_summary: str = Field(max_length=500)
    industry: str
    company_size_estimate: str = Field(
        pattern=r'^(1-10|11-50|51-200|201-1000|1000\+|unknown)$'
    )
    tech_stack_signals: list[str] = Field(max_length=20)
    potential_pain_points: list[str] = Field(min_length=1, max_length=5)
    personalization_hooks: list[str] = Field(min_length=1, max_length=5)
    confidence_score: float = Field(ge=0.0, le=1.0)

    @validator('company_summary')
    def flag_hallucination_patterns(cls, v):
        red_flags = ['founded in', 'revenue of', 'million users',
                     'raised $', 'valued at', 'according to']
        v_lower = v.lower()
        for flag in red_flags:
            if flag in v_lower:
                raise ValueError(
                    f"Possible hallucination: '{flag}'. "
                    f"Only use facts from provided scraped data."
                )
        return v


class EmailOutput(BaseModel):
    subject_options: list[str] = Field(min_length=1, max_length=3)
    body: str = Field(min_length=50, max_length=2000)

    @validator('body')
    def no_unresolved_placeholders(cls, v):
        placeholders = ['{first_name}', '{company}', '[INSERT', '[YOUR',
                        '{{', '}}', '<PLACEHOLDER']
        for p in placeholders:
            if p in v:
                raise ValueError(f"Unresolved placeholder: {p}")
        return v

    @validator('subject_options')
    def subjects_reasonable_length(cls, v):
        for s in v:
            if len(s.split()) > 10:
                raise ValueError(f"Subject too long (max 10 words): {s}")
            if len(s.split()) < 2:
                raise ValueError(f"Subject too short (min 2 words): {s}")
        return v


class SentimentOutput(BaseModel):
    sentiment: str = Field(
        pattern=r'^(interested|not_interested|out_of_office|unsubscribe|question)$'
    )
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(max_length=200)
```

### 8.4 Strategy 3: Safe Generate with Retry Loop

```python
# ai/safe_generate.py

async def safe_generate(
    provider: AIProvider,
    system_prompt: str,
    user_prompt: str,
    output_schema: type[BaseModel],
    max_retries: int = 3
) -> BaseModel:

    schema_instruction = f"""

Respond ONLY with valid JSON matching this schema:
{json.dumps(output_schema.model_json_schema(), indent=2)}

Rules:
- No markdown code fences.
- No explanation text before or after the JSON.
- Every field is required.
- Use ONLY facts from the data provided above.
"""
    full_prompt = user_prompt + schema_instruction
    last_error = None

    for attempt in range(max_retries):
        try:
            raw = await provider.generate(system_prompt, full_prompt)
            parsed = extract_json(raw)
            validated = output_schema.model_validate(parsed)
            return validated
        except json.JSONDecodeError as e:
            last_error = f"Invalid JSON on attempt {attempt+1}: {e}"
            full_prompt = (
                f"Previous response was not valid JSON. Error: {last_error}\n"
                f"Return ONLY raw JSON.\n\n{user_prompt}{schema_instruction}"
            )
        except ValidationError as e:
            last_error = f"Validation failed on attempt {attempt+1}: {e}"
            full_prompt = (
                f"Previous response failed validation: {last_error}\n"
                f"Fix these issues.\n\n{user_prompt}{schema_instruction}"
            )

    raise GenerationError(f"Failed after {max_retries} attempts: {last_error}")
```

### 8.5 Strategy 4: Human Review Gate

No email ever sends automatically. Every generated email lands in `draft` status. The user must explicitly approve before it enters the send queue. The UI shows research data alongside the email so the user can verify claims match the source.

```
LLM generates → DRAFT → User reviews (sees research source) → APPROVE → Send queue
                           ├── Edit manually
                           ├── Regenerate with AI
                           └── Reject / skip lead
```

### 8.6 Hallucination Risk Matrix

| LLM Task | Input Source | Risk | Mitigation |
|----------|-------------|------|------------|
| Research synthesis | Scraped website text | LOW | Prompt says "only use provided data", validator flags invented stats |
| Email body generation | Research output (validated) | MEDIUM | Pydantic checks, human review before send |
| Subject line generation | Research output | LOW | Max 10 words enforced, 3 options generated |
| Sentiment classification | Actual reply email text | VERY LOW | Enum-constrained output, confidence score |

---

## 9. Product Backlog — Agent-Ready Story Points

Each story is written so a coding agent (Claude Code, Cursor, Copilot) or a human developer can pick it up and implement without ambiguity.

**Story format:**
- **ID**: Unique identifier
- **Title**: What to build
- **Context**: Why this exists, what it connects to
- **Inputs**: What data/files/APIs this story receives
- **Outputs**: What this story produces (files, endpoints, DB tables)
- **Acceptance Criteria**: Testable conditions that must be true when done
- **Dependencies**: Which stories must be completed first
- **Effort**: S (< 2 hrs), M (2-4 hrs), L (4-8 hrs), XL (8+ hrs)

---

### EPIC 1: Project Setup & Infrastructure

#### STORY-1.1: Initialize Monorepo
- **Context**: Project folder structure that all other stories build on.
- **Inputs**: None
- **Outputs**: Folder structure:
  ```
  outbound-engine/
  ├── backend/
  │   ├── app/
  │   │   ├── __init__.py
  │   │   ├── main.py              # FastAPI entry
  │   │   ├── config.py            # Settings via pydantic-settings
  │   │   ├── database.py          # SQLAlchemy async engine + session
  │   │   ├── models/              # ORM models
  │   │   ├── schemas/             # Pydantic request/response
  │   │   ├── api/v1/              # Route handlers
  │   │   ├── services/            # Business logic
  │   │   ├── ai/                  # LLM provider layer
  │   │   ├── workers/             # Celery tasks
  │   │   └── utils/
  │   ├── alembic/
  │   ├── tests/
  │   ├── requirements.txt
  │   └── Dockerfile
  ├── frontend/
  │   ├── src/
  │   │   ├── components/
  │   │   ├── pages/
  │   │   ├── hooks/
  │   │   ├── api/                 # API client
  │   │   └── App.jsx
  │   ├── package.json
  │   └── Dockerfile
  ├── docker-compose.yml
  ├── .env.example
  ├── .gitignore
  └── README.md
  ```
- **Acceptance Criteria**:
  - `docker-compose up` starts PostgreSQL (5432), Redis (6379)
  - FastAPI returns `{"status": "ok"}` on `GET /health`
  - React app renders "OutboundEngine" on `localhost:3000`
  - `.env.example` lists all required vars with placeholders
  - `.gitignore` excludes `node_modules/`, `__pycache__/`, `.env`, `*.pyc`
- **Dependencies**: None
- **Effort**: M

#### STORY-1.2: Database Setup with Alembic
- **Context**: PostgreSQL + Alembic for schema management.
- **Inputs**: `DATABASE_URL` from `.env`
- **Outputs**:
  - `backend/app/database.py` — async engine, sessionmaker, `get_db` dependency
  - `backend/alembic/` — configured with app models
  - First migration: `leads`, `lead_lists`, `lead_list_members` tables (schema from PRD Section 3.1.2, 3.1.3)
- **Acceptance Criteria**:
  - `alembic upgrade head` creates all tables
  - `alembic downgrade -1` drops them
  - Tables match exact column names, types, indexes, constraints from PRD
  - `get_db` yields async sessions, closes after request
- **Dependencies**: STORY-1.1
- **Effort**: M

#### STORY-1.3: Authentication System
- **Context**: JWT auth — register, login, token refresh.
- **Inputs**: Registration and login payloads
- **Outputs**:
  - `users` table: `id (UUID)`, `email (unique)`, `name`, `password_hash`, `created_at`
  - `POST /api/v1/auth/register` → `{access_token, refresh_token}`
  - `POST /api/v1/auth/login` → `{access_token, refresh_token}`
  - `POST /api/v1/auth/refresh` → `{access_token}`
  - Auth dependency extracting user from Bearer token
- **Acceptance Criteria**:
  - Passwords hashed with bcrypt
  - Access token expires 30 min, refresh 7 days
  - Protected endpoint returns 401 without valid token
  - Duplicate email returns 409
- **Dependencies**: STORY-1.2
- **Effort**: M

#### STORY-1.4: Celery Worker Setup
- **Context**: Background task infrastructure.
- **Inputs**: `REDIS_URL` from `.env`
- **Outputs**:
  - `backend/app/workers/celery_app.py` — Celery configured with Redis
  - Test task: `add(x, y)` returning `x + y`
  - Docker Compose adds `worker` and `beat` services
- **Acceptance Criteria**:
  - `docker-compose up` starts 5 services: API, worker, beat, PostgreSQL, Redis
  - `add.delay(2, 3)` returns 5 via result backend
  - Worker logs visible in `docker-compose logs worker`
- **Dependencies**: STORY-1.1
- **Effort**: M

---

### EPIC 2: Lead Management

#### STORY-2.1: Lead CRUD API
- **Context**: Core API for lead operations.
- **Inputs**: JSON payloads matching Lead schema
- **Outputs**:
  - `POST /api/v1/leads` — create lead
  - `GET /api/v1/leads` — list with pagination (`?page=1&per_page=50`), sorting, filtering
  - `GET /api/v1/leads/{id}` — single lead with research
  - `PATCH /api/v1/leads/{id}` — partial update
  - `DELETE /api/v1/leads/{id}` — soft delete
- **Acceptance Criteria**:
  - Duplicate email → 409
  - Pagination returns `total_count`, `page`, `per_page`, `total_pages`
  - Multiple filters use AND logic
  - All endpoints require JWT
  - < 200ms response for 1000 leads
- **Dependencies**: STORY-1.2, STORY-1.3
- **Effort**: L

#### STORY-2.2: CSV Lead Import
- **Context**: Primary bulk import method.
- **Inputs**: `POST /api/v1/leads/bulk` multipart CSV upload
- **Outputs**: Response `{imported: 87, skipped_duplicate: 5, skipped_invalid: 8, errors: [{row, reason}]}`
- **Acceptance Criteria**:
  - Email regex + MX record check (async, 3s timeout, cached per domain)
  - Deduplicates against ALL existing leads
  - Rejects `info@`, `support@`, `sales@`, `admin@`, `contact@`, `help@`
  - Handles 10,000 rows without timeout
  - Missing optional fields → null; missing required fields → skip with error
- **Dependencies**: STORY-2.1
- **Effort**: L

#### STORY-2.3: Lead Lists
- **Context**: Static and dynamic list management.
- **Inputs**: List CRUD payloads
- **Outputs**: CRUD endpoints for lists and membership
- **Acceptance Criteria**:
  - Dynamic list evaluates `filter_criteria` at query time
  - Adding to dynamic list → 400
  - Member count via single SQL query
- **Dependencies**: STORY-2.1
- **Effort**: M

#### STORY-2.4: Frontend — Lead Table
- **Context**: React page showing leads.
- **Inputs**: `GET /api/v1/leads`
- **Outputs**: `/leads` page with sortable table, filters, CSV upload button, import summary modal
- **Acceptance Criteria**:
  - Loads < 1 second
  - Status badges colored: pending (gray), in_progress (yellow), completed (green), failed (red), needs_review (orange)
  - Empty state: "No leads yet. Upload a CSV to get started."
- **Dependencies**: STORY-2.1, STORY-2.2
- **Effort**: L

---

### EPIC 3: AI Provider Layer

#### STORY-3.1: Provider Interface and Factory
- **Context**: Abstraction so the app never calls an LLM directly.
- **Inputs**: Provider config from `.env`
- **Outputs**:
  - `backend/app/ai/providers.py` — `AIProvider` ABC + all 4 provider implementations (Section 7.3)
  - `backend/app/ai/factory.py` — `get_provider(task)` (Section 7.4)
- **Acceptance Criteria**:
  - Defaults to `"gemini"` when env var not set
  - Missing API key → `ConfigError` with clear message
  - `generate()` returns string; `generate_json()` strips fences and parses JSON
  - Test: `generate("You are helpful", "Return JSON: {\"test\": true}")` returns parseable JSON
- **Dependencies**: STORY-1.1
- **Effort**: L

#### STORY-3.2: Pydantic Output Schemas
- **Context**: Strict validation for every LLM response.
- **Inputs**: None
- **Outputs**: `backend/app/ai/schemas.py` with `ResearchOutput`, `EmailOutput`, `SentimentOutput` (Section 8.3)
- **Acceptance Criteria**:
  - `ResearchOutput` rejects summaries containing "founded in", "revenue of", "million users", "raised $", "valued at"
  - `EmailOutput` rejects unresolved placeholders and subjects > 10 words
  - `SentimentOutput` rejects values outside enum
  - Unit tests for valid + invalid inputs
- **Dependencies**: None
- **Effort**: M

#### STORY-3.3: Safe Generate with Retry
- **Context**: The ONLY function the app uses to call LLMs.
- **Inputs**: Provider, prompts, schema, max_retries
- **Outputs**: `backend/app/ai/safe_generate.py` (Section 8.4) + `GenerationError` exception
- **Acceptance Criteria**:
  - Valid output → returns validated model on attempt 1
  - Bad JSON → retries with error feedback
  - Schema fail → retries with validation error in prompt
  - All retries exhausted → `GenerationError`
  - Retry prompt preserves original prompt context
- **Dependencies**: STORY-3.1, STORY-3.2
- **Effort**: M

---

### EPIC 4: Account Research Pipeline

#### STORY-4.1: Company Website Scraper
- **Context**: Scrapes company websites for AI research input.
- **Inputs**: Domain string
- **Outputs**: `backend/app/services/scraper.py` — `CompanyScraper.scrape_company(domain) -> dict`
- **Acceptance Criteria**:
  - httpx async, 10s timeout, follows redirects
  - Strips script/style/nav/footer/header tags
  - Truncates to 2000 chars per page
  - Returns `{}` if unreachable (no exception)
  - Tries HTTPS first, HTTP fallback
  - User-Agent: `"OutboundEngine/1.0 (research bot)"`
- **Dependencies**: STORY-1.1
- **Effort**: M

#### STORY-4.2: Signal Collector
- **Context**: Supplements scraper with structured signals.
- **Inputs**: Domain string
- **Outputs**: `backend/app/services/signals.py` — tech detection via HTML patterns + hiring signals via greenhouse/lever checks
- **Acceptance Criteria**:
  - Detects: React, Angular, Vue, jQuery, Stripe, Segment, HubSpot, Intercom, GA, Shopify, WordPress, Webflow
  - Hiring: checks `{domain}.greenhouse.io/jobs`, `jobs.lever.co/{domain}`, 5s timeout
  - Empty list on no results, null on timeout; never raises
- **Dependencies**: STORY-1.1
- **Effort**: M

#### STORY-4.3: Research Prompts
- **Context**: Prompts that turn scraped text into structured research.
- **Inputs**: Lead + scraped data
- **Outputs**: `backend/app/ai/prompts/research.py` — `RESEARCH_SYSTEM_PROMPT`, `build_research_prompt()`
- **Acceptance Criteria**:
  - System prompt includes: `"Use ONLY the information provided below. Do not invent any facts, statistics, funding amounts, revenue figures, or user counts."`
  - Data wrapped in `--- VERIFIED DATA ---` markers
  - Total prompt truncated to 4000 chars
  - Returns string only (does not call LLM)
- **Dependencies**: None
- **Effort**: S

#### STORY-4.4: Research Worker
- **Context**: Celery task running full pipeline: scrape → signals → AI → store.
- **Inputs**: `lead_id`
- **Outputs**: `research_lead` task + `research_lead_list` batch task
- **Acceptance Criteria**:
  - Rate limit: `10/m`; retries: 3 with exponential backoff (60s, 120s, 180s)
  - Status flow: `pending → in_progress → completed|needs_review|failed`
  - Empty scrape → `failed` with note, NO LLM call
  - LLM failure → `failed` with note
  - Confidence < 0.6 → `needs_review`
  - `research_lead_list`: dispatches individual tasks for each pending lead
- **Dependencies**: STORY-4.1, STORY-4.2, STORY-4.3, STORY-3.3, STORY-1.4
- **Effort**: L

#### STORY-4.5: Frontend — Research Panel
- **Context**: UI for research status and results.
- **Inputs**: Lead data with research fields
- **Outputs**: Research badges, "Research All" button, expandable detail panel per lead
- **Acceptance Criteria**:
  - "Research All" shows polling progress (5s interval)
  - Panel shows: summary, industry, size, tech (tags), pain points, hooks, confidence %
  - Confidence < 60% → orange warning
  - Failed → error note displayed
- **Dependencies**: STORY-2.4, STORY-4.4
- **Effort**: M

---

### EPIC 5: Email Generation

#### STORY-5.1: Campaign CRUD API
- **Context**: Campaigns tie leads, templates, and generated emails.
- **Inputs**: Campaign schema (PRD Section 3.4.1)
- **Outputs**: `campaigns` table + CRUD endpoints
- **Acceptance Criteria**:
  - New campaign → `draft` status
  - Cannot update `active` campaign → 400
  - Stats default to 0
  - List returns newest first with stats
- **Dependencies**: STORY-1.2, STORY-1.3
- **Effort**: M

#### STORY-5.2: Email Template System
- **Context**: Templates define prompts and constraints per sequence step.
- **Inputs**: Template schema (PRD Section 3.3.1)
- **Outputs**: `email_templates` table + CRUD + 3 seed templates
- **Acceptance Criteria**:
  - Ordered by `sequence_position`
  - Seeds: "Initial Outreach" (pos 1, day 0), "Value Follow-up" (pos 2, day 3), "Breakup" (pos 3, day 7)
  - Seed prompts produce valid `EmailOutput` with any provider
- **Dependencies**: STORY-1.2
- **Effort**: M

#### STORY-5.3: Email Generation Prompts
- **Context**: Prompts that produce personalized emails from research.
- **Inputs**: Campaign config, template, lead + research, previous email context
- **Outputs**: `backend/app/ai/prompts/email_gen.py` — `build_system_prompt()`, `build_email_prompt()`
- **Acceptance Criteria**:
  - Anti-buzzword list in system prompt: "synergy", "leverage", "cutting-edge", "game-changer", "circle back", "touch base", "move the needle"
  - Contains: "Never start with 'I hope this email finds you well'"
  - Step 1 prompt: no previous_context
  - Step 2+ prompt: includes previous subject + instruction not to just "follow up"
  - Total prompt < 3000 chars
- **Dependencies**: None
- **Effort**: M

#### STORY-5.4: Email Generation Worker
- **Context**: Generates all emails for a campaign asynchronously.
- **Inputs**: `campaign_id`
- **Outputs**: `generated_emails` table + `generate_campaign_emails` Celery task
- **Acceptance Criteria**:
  - Campaign status: `draft → generating → review`
  - Rate limit: 15/min (Gemini free tier)
  - Stores `body_original` alongside `body`
  - Skips leads without completed research (logs warning)
  - Failure on one lead → continues to next
  - 3 leads × 3 templates = 9 rows in `generated_emails`
- **Dependencies**: STORY-5.1, STORY-5.2, STORY-5.3, STORY-3.3, STORY-4.4
- **Effort**: XL

#### STORY-5.5: Email Review API
- **Context**: Review, edit, approve, regenerate drafts.
- **Inputs**: Campaign ID, email IDs
- **Outputs**: List/get/edit/approve/regenerate endpoints for generated emails
- **Acceptance Criteria**:
  - Only approve `draft` emails
  - Edit preserves `body_original`, sets `was_manually_edited=true`
  - Regenerate replaces content, keeps metadata
  - Bulk approve returns `{approved, skipped}`
- **Dependencies**: STORY-5.4
- **Effort**: L

#### STORY-5.6: Frontend — Campaign Builder
- **Context**: 4-step wizard: product info → leads → sequence → settings.
- **Inputs**: User input
- **Outputs**: `/campaigns/new` page
- **Acceptance Criteria**:
  - Cannot advance without required fields
  - Shows lead count after selection
  - Sequence shows email cards with arrows + day delays
  - "Generate" disabled if 0 leads or 0 templates
  - Progress indicator during generation, auto-redirect on completion
- **Dependencies**: STORY-5.1, STORY-5.2, STORY-2.4
- **Effort**: XL

#### STORY-5.7: Frontend — Email Review Queue
- **Context**: Review page before campaign launch.
- **Inputs**: STORY-5.5 endpoints
- **Outputs**: `/campaigns/{id}/review` page
- **Acceptance Criteria**:
  - Stats bar: drafts/approved/failed counts
  - Each card: lead info, subject, body preview, expand to edit
  - Side panel shows research (cross-reference)
  - Approve/Edit/Regenerate per email + bulk "Approve All"
  - "Launch Campaign" appears when ≥1 approved
- **Dependencies**: STORY-5.4, STORY-5.5
- **Effort**: XL

---

### EPIC 6: Sending Engine

#### STORY-6.1: Email Provider Integration
- **Context**: Send via Resend/SendGrid, abstracted.
- **Inputs**: Email data
- **Outputs**: `EmailProvider` ABC + `ResendProvider` + `SendGridProvider` + `ConsoleProvider` (dev)
- **Acceptance Criteria**:
  - `ConsoleProvider` works without API key
  - Provider via `EMAIL_PROVIDER` env, default `console`
  - Always includes `List-Unsubscribe` header
  - Distinct `HardBounceError` and `SoftBounceError`
- **Dependencies**: STORY-1.1
- **Effort**: M

#### STORY-6.2: Tracking Injection
- **Context**: Injects open pixel + rewrites links before sending.
- **Inputs**: HTML body, email ID
- **Outputs**: `inject_tracking()` function
- **Acceptance Criteria**:
  - Appends 1x1 pixel before `</body>`
  - Rewrites `<a href>` links (except `mailto:`)
  - Appends unsubscribe link
  - Original URLs in Redis with `link:{hash}` key, 90-day TTL
  - If `TRACKING_DOMAIN` not set → skip tracking entirely
- **Dependencies**: STORY-1.1
- **Effort**: M

#### STORY-6.3: Tracking Server Endpoints
- **Context**: Handles open/click/unsubscribe from email recipients.
- **Inputs**: HTTP requests from recipients
- **Outputs**: `/t/o/{id}.png`, `/t/c/{id}/{hash}`, `/t/u/{id}` endpoints + `tracking_events` table
- **Acceptance Criteria**:
  - Pixel returns PNG, < 50ms response
  - Click returns 302 redirect; unknown hash → 404
  - Unsubscribe updates lead + cancels all pending emails across campaigns
  - No authentication required on these endpoints
- **Dependencies**: STORY-6.2, STORY-1.2
- **Effort**: L

#### STORY-6.4: Event Processing Worker
- **Context**: Consumes tracking events, updates records.
- **Inputs**: Redis pub/sub events
- **Outputs**: `process_tracking_event` Celery task
- **Acceptance Criteria**:
  - First open → sets `opened_at` + increments campaign stat
  - Subsequent opens → increment count only
  - Same logic for clicks
  - Stores raw events with IP, user agent, timestamp
- **Dependencies**: STORY-6.3, STORY-1.4
- **Effort**: M

#### STORY-6.5: Scheduler and Send Worker
- **Context**: Sends approved emails on schedule.
- **Inputs**: Approved emails with `scheduled_at`
- **Outputs**: `schedule_campaign_emails()`, `process_scheduled_emails()` (beat: 60s), `send_email()`, `cancel_remaining_sequence()`
- **Acceptance Criteria**:
  - Respects sending window, days, daily limit
  - Jitter: ±15 min random
  - Send rate: 1/s
  - Skip if lead replied/unsubscribed/bounced since scheduling
  - Hard bounce → bounced status, sequence cancelled
  - Soft bounce → retry in 1hr, max 3, then bounce
- **Dependencies**: STORY-6.1, STORY-6.2, STORY-5.4, STORY-1.4
- **Effort**: XL

#### STORY-6.6: Reply Detection
- **Context**: IMAP polling to detect replies, stop sequences.
- **Inputs**: IMAP inbox
- **Outputs**: `check_for_replies()` (beat: 5min), `handle_reply()`, `replies` table
- **Acceptance Criteria**:
  - IMAP config via env; if not set → disabled (not error)
  - Match by In-Reply-To header, fallback to subject
  - Reply → cancel sequence within 60s
  - AI sentiment classification via `safe_generate` + `SentimentOutput`
- **Dependencies**: STORY-6.5, STORY-3.3
- **Effort**: L

---

### EPIC 7: Analytics Dashboard

#### STORY-7.1: Analytics API
- **Context**: Aggregated campaign performance.
- **Inputs**: Campaign ID
- **Outputs**: `GET /campaigns/{id}/analytics` + `GET /campaigns/{id}/leads/{id}/timeline`
- **Acceptance Criteria**:
  - Rates = count / emails_sent; div-by-zero → 0.0
  - `by_day` includes zero-send days
  - `top_subjects` requires min 10 sends
  - Timeline: chronological, includes all event types
  - < 500ms for 1000-lead campaign
- **Dependencies**: STORY-6.4, STORY-6.6
- **Effort**: L

#### STORY-7.2: WebSocket Live Feed
- **Context**: Real-time events on dashboard.
- **Inputs**: Redis pub/sub, WebSocket connection
- **Outputs**: `WS /ws/campaigns/{id}` pushing event JSON
- **Acceptance Criteria**:
  - Auth via query param token
  - Events within 2s of occurrence
  - Disconnected clients cleaned up
  - Multiple concurrent subscribers supported
- **Dependencies**: STORY-6.4, STORY-6.6
- **Effort**: M

#### STORY-7.3: Frontend — Campaign Dashboard
- **Context**: Main campaign view.
- **Inputs**: Analytics API + WebSocket
- **Outputs**: `/campaigns/{id}/dashboard` page
- **Acceptance Criteria**:
  - Stats cards: Sent, Opened %, Clicked %, Replied %
  - Line chart: daily sends + rate overlay
  - Bar chart: performance by step
  - Live feed: scrolling events via WebSocket
  - Sentiment pie chart
  - Pause/resume buttons
  - Loads < 2s; charts handle 0 data gracefully
- **Dependencies**: STORY-7.1, STORY-7.2
- **Effort**: XL

#### STORY-7.4: Frontend — Lead Timeline
- **Context**: Per-lead interaction history.
- **Inputs**: Timeline API
- **Outputs**: `/campaigns/{id}/leads/{id}` page/modal
- **Acceptance Criteria**:
  - Header: lead info + status
  - Collapsible research summary
  - Timeline with icons: 📧 sent, 👁 opened, 🔗 clicked, 💬 replied
  - Relative time + absolute on hover
  - Reply preview truncated at 200 chars with expand
- **Dependencies**: STORY-7.1
- **Effort**: M

---

### Story Dependency Graph (Build Order)

```
PHASE 1 (Week 1-2): Foundation
  STORY-1.1 → STORY-1.2 → STORY-1.3
  STORY-1.1 → STORY-1.4
  STORY-1.2 → STORY-2.1 → STORY-2.2 → STORY-2.4
  STORY-1.2 → STORY-2.3

PHASE 2 (Week 3-4): AI Layer + Research
  STORY-3.1 → STORY-3.3
  STORY-3.2 (parallel)
  STORY-4.1, STORY-4.2, STORY-4.3 (parallel)
  STORY-4.1 + 4.2 + 4.3 + 3.3 + 1.4 → STORY-4.4
  STORY-4.4 + 2.4 → STORY-4.5

PHASE 3 (Week 5-6): Email Generation
  STORY-5.1, STORY-5.2, STORY-5.3 (parallel)
  STORY-5.1 + 5.2 + 5.3 + 3.3 + 4.4 → STORY-5.4
  STORY-5.4 → STORY-5.5
  STORY-5.1 + 5.2 + 2.4 → STORY-5.6
  STORY-5.4 + 5.5 → STORY-5.7

PHASE 4 (Week 7-8): Sending & Tracking
  STORY-6.1 (parallel)
  STORY-6.2 → STORY-6.3 → STORY-6.4
  STORY-6.1 + 6.2 + 5.4 + 1.4 → STORY-6.5
  STORY-6.5 + 3.3 → STORY-6.6

PHASE 5 (Week 9-10): Analytics & Dashboard
  STORY-6.4 + 6.6 → STORY-7.1
  STORY-7.1 → STORY-7.2
  STORY-7.1 + 7.2 → STORY-7.3
  STORY-7.1 → STORY-7.4
```

---

### Backlog Summary

| Epic | Stories | Total Effort |
|------|---------|-------------|
| 1. Setup & Infrastructure | 1.1, 1.2, 1.3, 1.4 | 4× M = ~12 hrs |
| 2. Lead Management | 2.1, 2.2, 2.3, 2.4 | 2L + 2M = ~16 hrs |
| 3. AI Provider Layer | 3.1, 3.2, 3.3 | L + 2M = ~10 hrs |
| 4. Research Pipeline | 4.1, 4.2, 4.3, 4.4, 4.5 | S + 3M + L = ~16 hrs |
| 5. Email Generation | 5.1-5.7 | 3M + L + 3XL = ~40 hrs |
| 6. Sending Engine | 6.1-6.6 | 3M + 2L + XL = ~28 hrs |
| 7. Analytics Dashboard | 7.1-7.4 | 2M + L + XL = ~20 hrs |
| **TOTAL** | **28 stories** | **~142 hrs (~10 weeks at 15 hrs/week)** |

---

## 10. Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| API | FastAPI (Python) | Async, type-safe, auto-docs, you already know Python |
| Database | PostgreSQL | JSONB for flexible fields, robust, production-standard |
| Queue | Redis + Celery | Battle-tested async task processing |
| Frontend | React + Vite + Tailwind | Fast dev, component-based, industry standard |
| Charts | Recharts | Simple React charting library |
| AI (default) | Google Gemini 2.0 Flash (FREE) | 15 RPM, 1M TPM, no credit card needed |
| AI (alt free) | Groq (Llama 3.1 70B) | 30 RPM free, fast inference |
| AI (premium) | Claude Code CLI / Anthropic API | Best quality, needs Pro/Max or API key |
| Email Sending | Resend (or SendGrid) | Dev-friendly API, good free tier |
| Scraping | httpx + BeautifulSoup | Lightweight, async-capable |
| Auth | JWT (python-jose) | Stateless, simple |
| Containers | Docker Compose | Local dev parity, easy deployment |
| CI/CD | GitHub Actions | Free for public repos |

---

## 11. Monetization Angles (If You Want to Ship It)

1. **Open-core model:** Core engine is free/open-source. Charge for hosted version with managed email infrastructure, higher AI generation limits, and team features.

2. **Usage-based pricing:** Free for 100 leads/month. $29/mo for 1,000 leads. $99/mo for 10,000 leads. AI generation and email sends are the variable costs.

3. **Agency model:** White-label it. Let agencies run campaigns for their clients with their own branding. Charge $199/mo per agency seat.

4. **Marketplace play:** Let users share and sell high-performing email templates and research prompt configurations.

---

## 12. Resume Framing

Here's exactly how to describe this on your resume:

**OutboundEngine — AI-Powered Cold Outreach Platform** | *Python, FastAPI, React, PostgreSQL, Redis, Gemini/Claude API*
- Built end-to-end outbound automation platform with multi-provider AI layer (Gemini, Groq, Claude) for company research and hyper-personalized email generation with Pydantic-validated structured outputs
- Designed async job processing pipeline (Celery + Redis) handling lead research, email generation, and scheduled sending with rate limiting and retry logic  
- Implemented custom event tracking system (open pixel, click redirect, reply detection via IMAP) processing 10K+ events/day with real-time WebSocket dashboard
- Engineered deliverability-aware sending engine with timezone-based scheduling, daily send limits, human-like jitter, and automatic sequence control on bounces/replies
- Built anti-hallucination framework: schema validation on every LLM output, confidence scoring, retry with error feedback, and mandatory human review gate before any email sends

---

## 13. Key Learning Outcomes

By the time you finish this project, you'll have hands-on experience with:

- **System design:** Event-driven architecture, async job queues, pub/sub
- **API design:** RESTful endpoints, pagination, filtering, WebSocket
- **Database design:** Normalized schemas, JSONB, indexing strategy
- **AI integration:** Prompt engineering, structured outputs, token management
- **Email systems:** SMTP, tracking pixels, deliverability, SPF/DKIM/DMARC
- **Web scraping:** Async HTTP, HTML parsing, rate limiting, error handling
- **Real-time systems:** WebSocket, Redis pub/sub, live dashboards
- **DevOps:** Docker Compose, CI/CD, environment management
- **Product thinking:** Campaign lifecycle, A/B testing, analytics
