"""
Research Synthesis Prompts (STORY-4.3)

System prompt and builder function for the research pipeline.
Turns scraped website data + signals into structured research via LLM.

The prompts enforce strict anti-hallucination rules:
  - LLM must ONLY use provided data
  - Data is wrapped in VERIFIED DATA markers
  - Total content is truncated to 4000 chars for free-tier token limits
"""

from __future__ import annotations

# Maximum total prompt length (for free-tier token limits like Gemini 15 RPM)
_MAX_PROMPT_CHARS = 4000

RESEARCH_SYSTEM_PROMPT = """You are a B2B sales research analyst.
Your job is to analyze scraped website data and produce a structured research brief.

CRITICAL RULES:
- Use ONLY the information provided below.
- Do not invent any facts, statistics, funding amounts, revenue figures, or user counts.
- If information is not available in the provided data, set the field to "unknown".
- Never guess founding dates, team sizes, or revenue unless explicitly stated in the data.
- Base your analysis solely on the text between the VERIFIED DATA markers.
- Pain points should be INFERRED from the company's stage, industry, and what they do — not fabricated statistics.
- Personalization hooks must reference SPECIFIC details you found in the data."""


def build_research_prompt(
    lead: dict,
    scraped_data: dict[str, str],
    signals: dict,
) -> str:
    """Build the user prompt for research synthesis.

    Assembles lead info, scraped website text, and signal data
    into a structured prompt that the LLM processes.

    Args:
        lead: Lead record with first_name, last_name, title,
              company_name, company_domain.
        scraped_data: Dict of page_path → extracted_text from CompanyScraper.
        signals: Dict with tech_stack (list) and hiring_signals (dict)
                 from SignalCollector.

    Returns:
        Complete user prompt string, truncated to _MAX_PROMPT_CHARS.
    """
    # Lead context
    lead_section = (
        f"Research target:\n"
        f"  Name: {lead.get('first_name', '')} {lead.get('last_name', '')}\n"
        f"  Title: {lead.get('title', 'Unknown')}\n"
        f"  Company: {lead.get('company_name', 'Unknown')} "
        f"({lead.get('company_domain', 'Unknown')})\n"
    )

    # Scraped website data
    scraped_section = _format_scraped_data(scraped_data)

    # Signal data
    signal_section = _format_signals(signals)

    # Output instructions
    output_section = (
        "\nBased on the VERIFIED DATA above, produce a JSON research brief.\n"
        "Include: company_summary, industry, company_size_estimate, "
        "tech_stack_signals, potential_pain_points, personalization_hooks, "
        "confidence_score.\n"
        "Set confidence_score lower if data is sparse or ambiguous."
    )

    # Assemble full prompt
    full_prompt = (
        f"{lead_section}\n"
        f"--- VERIFIED DATA ---\n"
        f"{scraped_section}\n"
        f"{signal_section}\n"
        f"--- END DATA ---\n"
        f"{output_section}"
    )

    # Truncate if too long (preserves beginning which has lead context)
    if len(full_prompt) > _MAX_PROMPT_CHARS:
        full_prompt = full_prompt[:_MAX_PROMPT_CHARS - 50] + (
            "\n\n[Data truncated for token limits. "
            "Use available data only.]"
        )

    return full_prompt


def _format_scraped_data(scraped_data: dict[str, str]) -> str:
    """Format scraped page data into labeled sections."""
    if not scraped_data:
        return "[No website data available]"

    sections = []
    for path, text in scraped_data.items():
        page_label = {
            "/": "Homepage",
            "/about": "About Page",
            "/about-us": "About Page",
            "/company": "Company Page",
            "/blog": "Blog",
            "/careers": "Careers Page",
            "/pricing": "Pricing Page",
        }.get(path, f"Page: {path}")

        sections.append(f"[{page_label}]\n{text}")

    return "\n\n".join(sections)


def _format_signals(signals: dict) -> str:
    """Format signal data into readable text."""
    parts = []

    # Tech stack
    tech_stack = signals.get("tech_stack", [])
    if tech_stack:
        parts.append(f"Detected technologies: {', '.join(tech_stack)}")

    # Hiring signals
    hiring = signals.get("hiring_signals")
    if hiring and hiring.get("is_hiring"):
        active_boards = [
            board for board, active in hiring.get("boards", {}).items()
            if active
        ]
        parts.append(
            f"Hiring signal: Active job postings found on {', '.join(active_boards)}"
        )
    elif hiring:
        parts.append("Hiring signal: No active job postings detected")

    if parts:
        return "\n[Additional Signals]\n" + "\n".join(parts)
    return ""
