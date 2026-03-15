"""
Pydantic Output Schemas for LLM responses (STORY-3.2)

Three strict schemas that validate every LLM output before the app uses it.
Includes hallucination detection, placeholder rejection, and enum constraints.
"""

from pydantic import BaseModel, Field, field_validator


class ResearchOutput(BaseModel):
    """Schema for AI research synthesis output.

    Validates company research data from LLM, with hallucination
    detection on company_summary to reject fabricated facts.
    """

    company_summary: str = Field(
        max_length=500,
        description="2-3 sentence description of what the company does",
    )
    industry: str = Field(description="Primary industry category")
    company_size_estimate: str = Field(
        pattern=r"^(1-10|11-50|51-200|201-1000|1000\+|unknown)$",
        description="Estimated employee count range",
    )
    tech_stack_signals: list[str] = Field(
        max_length=20,
        description="Technologies detected from website",
    )
    potential_pain_points: list[str] = Field(
        min_length=1,
        max_length=5,
        description="Inferred pain points based on company stage/industry",
    )
    personalization_hooks: list[str] = Field(
        min_length=1,
        max_length=5,
        description="Specific, non-generic observations for outreach personalization",
    )
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in the research quality (0.0-1.0)",
    )

    @field_validator("company_summary")
    @classmethod
    def flag_hallucination_patterns(cls, v: str) -> str:
        """Reject summaries containing commonly hallucinated claims.

        LLMs frequently invent founding dates, revenue figures, user counts,
        funding amounts, and valuations. These are almost never present in
        scraped website text and indicate the model is fabricating data.
        """
        red_flags = [
            "founded in",
            "revenue of",
            "million users",
            "raised $",
            "valued at",
            "according to",
        ]
        v_lower = v.lower()
        for flag in red_flags:
            if flag in v_lower:
                raise ValueError(
                    f"Possible hallucination detected: '{flag}'. "
                    f"Only use facts from the provided scraped data. "
                    f"Do not invent statistics, dates, or financial figures."
                )
        return v


class EmailOutput(BaseModel):
    """Schema for AI-generated email output.

    Validates that the email body contains no unresolved placeholders
    and that subject lines are reasonable length.
    """

    subject_options: list[str] = Field(
        min_length=1,
        max_length=3,
        description="1-3 subject line options",
    )
    body: str = Field(
        min_length=50,
        max_length=2000,
        description="The email body text",
    )

    @field_validator("body")
    @classmethod
    def no_unresolved_placeholders(cls, v: str) -> str:
        """Reject email bodies containing template placeholders.

        If the LLM returns placeholders instead of actual personalization,
        the email would look broken to the recipient.
        """
        placeholders = [
            "{first_name}",
            "{company}",
            "[INSERT",
            "[YOUR",
            "{{",
            "}}",
            "<PLACEHOLDER",
        ]
        for p in placeholders:
            if p in v:
                raise ValueError(
                    f"Unresolved placeholder found: '{p}'. "
                    f"Replace all placeholders with actual personalized content."
                )
        return v

    @field_validator("subject_options")
    @classmethod
    def subjects_reasonable_length(cls, v: list[str]) -> list[str]:
        """Enforce subject line word count constraints.

        Too-short subjects look spammy. Too-long subjects get truncated
        in email clients and reduce open rates.
        """
        for s in v:
            word_count = len(s.split())
            if word_count > 10:
                raise ValueError(
                    f"Subject too long (max 10 words, got {word_count}): '{s}'"
                )
            if word_count < 2:
                raise ValueError(
                    f"Subject too short (min 2 words, got {word_count}): '{s}'"
                )
        return v


class SentimentOutput(BaseModel):
    """Schema for AI reply sentiment classification.

    Classifies incoming replies into actionable categories
    so the system can auto-route responses appropriately.
    """

    sentiment: str = Field(
        pattern=r"^(interested|not_interested|out_of_office|unsubscribe|question)$",
        description="Classified sentiment of the reply",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in the classification (0.0-1.0)",
    )
    reasoning: str = Field(
        max_length=200,
        description="Brief explanation of why this sentiment was assigned",
    )
