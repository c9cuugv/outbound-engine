"""
Email Generation Prompts (STORY-5.3)

System prompt and builder function for personalized email generation.
Produces cold emails, follow-ups, and breakup emails based on
campaign config, lead research, and sequence position.

Anti-spam rules:
  - Banned buzzwords and fake urgency phrases
  - Banned opening lines ("I hope this email finds you well")
  - Enforces human-like tone with word count limits
"""

from __future__ import annotations

# Words and phrases that make emails sound like spam
_BANNED_WORDS = [
    "synergy",
    "leverage",
    "cutting-edge",
    "game-changer",
    "circle back",
    "touch base",
    "move the needle",
    "ecosystem",
    "holistic",
]

_BANNED_URGENCY = [
    "limited time",
    "act now",
    "don't miss out",
]

_BANNED_OPENERS = [
    "I hope this email finds you well",
    "I came across your company",
]


def build_system_prompt(campaign: dict) -> str:
    """Build the system prompt for email generation.

    Includes product context, ICP, value prop, and writing rules
    that apply to ALL emails in the campaign sequence.

    Args:
        campaign: Campaign record with product_name, product_description,
                  icp_description, value_prop, max_word_count (from template).

    Returns:
        System prompt string for the LLM.
    """
    max_words = campaign.get("max_word_count", 120)

    banned_words_str = '", "'.join(_BANNED_WORDS)
    banned_urgency_str = '", "'.join(_BANNED_URGENCY)
    banned_openers_str = "\n".join(f'- Never start with "{o}"' for o in _BANNED_OPENERS)

    return f"""You are a sales copywriter for {campaign.get('product_name', 'our product')}.

Product: {campaign.get('product_description', 'N/A')}
Target ICP: {campaign.get('icp_description', 'N/A')}
Value proposition: {campaign.get('value_prop', 'N/A')}

RULES:
- Maximum {max_words} words
- NEVER use these words: "{banned_words_str}"
- NEVER use fake urgency: "{banned_urgency_str}"
{banned_openers_str}
- Sound like a real human, not a marketing bot
- One clear CTA per email
- Paragraphs: 2-3 sentences max
- Use the prospect's first name naturally (not in every sentence)
- Reference specific details from the research — generic flattery is worse than nothing
- Return ONLY valid JSON with "subject_options" (list of 1-3 strings) and "body" (string)"""


def build_email_prompt(
    template: dict,
    lead: dict,
    research: dict,
    previous_context: dict | None = None,
) -> str:
    """Build the user prompt for generating a specific email.

    Creates step-specific instructions based on sequence position:
      - Step 1 (initial outreach): Full research context, soft CTA
      - Step 2 (follow-up): New value angle, references previous email
      - Step 3+ (breakup): Direct ask, last chance

    Args:
        template: Email template with sequence_position, name.
        lead: Lead record with first_name, last_name, title, company_name.
        research: Research data with company_summary, personalization_hooks,
                  potential_pain_points, recent_developments.
        previous_context: Previous email context for follow-ups
                         (previous_subject, previous_body_summary).

    Returns:
        User prompt string for the LLM.
    """
    position = template.get("sequence_position", 1)

    # Common lead context
    lead_info = (
        f"Prospect: {lead.get('first_name', '')} {lead.get('last_name', '')}, "
        f"{lead.get('title', 'Unknown')} at {lead.get('company_name', 'Unknown')}"
    )

    # Research context
    research_section = _format_research(research)

    if position == 1:
        return _build_initial_outreach(lead_info, research_section, lead)
    elif position == 2:
        return _build_follow_up(
            lead_info, research_section, lead, previous_context
        )
    else:
        return _build_breakup(
            lead_info, research_section, lead, previous_context
        )


def _build_initial_outreach(
    lead_info: str, research_section: str, lead: dict
) -> str:
    """Step 1: Cold email — first contact."""
    first_name = lead.get("first_name", "there")
    return f"""Write a cold email to {lead_info}.

RESEARCH (use this for personalization):
{research_section}

This is the FIRST email in the sequence. Goals:
1. Open with something specific about their company (NOT generic flattery)
2. Connect their situation to a problem we solve
3. End with a soft CTA — suggest a quick call, not "buy now"

Address the email to {first_name}.

Subject line: Write 2-3 options. Keep under 6 words. No clickbait.

Return JSON:
{{"subject_options": ["option1", "option2"], "body": "the email body"}}"""


def _build_follow_up(
    lead_info: str,
    research_section: str,
    lead: dict,
    previous_context: dict | None,
) -> str:
    """Step 2: Follow-up — add new value, don't just 'follow up'."""
    first_name = lead.get("first_name", "there")

    prev_subject = "N/A"
    prev_body = "N/A"
    if previous_context:
        prev_subject = previous_context.get("previous_subject", "N/A")
        prev_body = previous_context.get("previous_body_summary", "N/A")

    return f"""Write follow-up #1 to {lead_info}.

Context from initial email:
- Subject used: {prev_subject}
- Key point made: {prev_body[:200]}

Status: No reply received.

RESEARCH (for additional angles):
{research_section}

Rules for this follow-up:
- DO NOT just say "following up on my last email"
- Add NEW value — share a relevant insight, case study stat, or different angle
- Keep it shorter than the first email (max 80 words)
- Reference the first email casually, don't rehash it
- Different CTA angle (e.g., if first was "grab a call", try "send a quick demo video?")

Address the email to {first_name}.

Return JSON:
{{"subject_options": ["option1", "option2"], "body": "the email body"}}"""


def _build_breakup(
    lead_info: str,
    research_section: str,
    lead: dict,
    previous_context: dict | None,
) -> str:
    """Step 3+: Breakup email — last chance, direct ask."""
    first_name = lead.get("first_name", "there")

    prev_subject = "N/A"
    if previous_context:
        prev_subject = previous_context.get("previous_subject", "N/A")

    return f"""Write the FINAL "breakup" email to {lead_info}.

Previous emails sent (no reply to any):
- Last subject: {prev_subject}

RESEARCH:
{research_section}

Rules for breakup emails:
- Acknowledge this is the last email
- Be direct and respectful — no guilt-tripping
- Offer one clear, low-commitment next step
- Keep it under 60 words
- Leave the door open without being pushy
- Tone: warm but professional, not desperate

Address the email to {first_name}.

Return JSON:
{{"subject_options": ["option1", "option2"], "body": "the email body"}}"""


def _format_research(research: dict) -> str:
    """Format research data into prompt-friendly text."""
    parts = []

    if research.get("company_summary"):
        parts.append(f"- Company does: {research['company_summary']}")

    hooks = research.get("personalization_hooks", [])
    if hooks:
        hooks_str = "; ".join(hooks)
        parts.append(f"- Personalization hooks: {hooks_str}")

    pain_points = research.get("potential_pain_points", [])
    if pain_points:
        pain_str = "; ".join(pain_points)
        parts.append(f"- Pain points: {pain_str}")

    tech = research.get("tech_stack_signals", [])
    if tech:
        parts.append(f"- Tech stack: {', '.join(tech)}")

    industry = research.get("industry")
    if industry:
        parts.append(f"- Industry: {industry}")

    if not parts:
        return "- No research data available (use general approach)"

    return "\n".join(parts)
