"""
Tests for Pydantic Output Schemas (STORY-3.2)

25+ test cases covering valid inputs, hallucination detection,
placeholder rejection, and boundary conditions for all three schemas.
"""

import pytest
from pydantic import ValidationError

from app.ai.schemas import EmailOutput, ResearchOutput, SentimentOutput

# ---------------------------------------------------------------------------
# Fixtures — valid data factories
# ---------------------------------------------------------------------------


def valid_research_data(**overrides) -> dict:
    base = {
        "company_summary": "Acme Corp builds developer tools for API testing.",
        "industry": "Developer Tools",
        "company_size_estimate": "51-200",
        "tech_stack_signals": ["React", "Python", "AWS"],
        "potential_pain_points": ["Manual API testing is slow"],
        "personalization_hooks": ["Recently launched v2 of their CLI tool"],
        "confidence_score": 0.85,
    }
    base.update(overrides)
    return base


def valid_email_data(**overrides) -> dict:
    base = {
        "subject_options": ["Quick thought on your API", "Noticed your v2 launch"],
        "body": (
            "Hi Sarah,\n\n"
            "I saw your team just shipped the v2 CLI — the architecture post "
            "was really sharp. We help teams like yours cut API testing time "
            "by 60%. Worth a quick chat?\n\n"
            "Best,\nAlex"
        ),
    }
    base.update(overrides)
    return base


def valid_sentiment_data(**overrides) -> dict:
    base = {
        "sentiment": "interested",
        "confidence": 0.9,
        "reasoning": "The reply asks for a demo link and proposes meeting times.",
    }
    base.update(overrides)
    return base


# ===========================================================================
# ResearchOutput tests (10+)
# ===========================================================================


class TestResearchOutput:
    def test_valid_complete_object(self):
        result = ResearchOutput(**valid_research_data())
        assert result.company_summary == "Acme Corp builds developer tools for API testing."
        assert result.confidence_score == 0.85

    def test_hallucination_founded_in(self):
        with pytest.raises(ValidationError, match="founded in"):
            ResearchOutput(**valid_research_data(
                company_summary="Acme Corp was founded in 2019 and builds dev tools."
            ))

    def test_hallucination_revenue_of(self):
        with pytest.raises(ValidationError, match="revenue of"):
            ResearchOutput(**valid_research_data(
                company_summary="Acme Corp has a revenue of $50M annually."
            ))

    def test_hallucination_raised_dollar(self):
        with pytest.raises(ValidationError, match="raised \\$"):
            ResearchOutput(**valid_research_data(
                company_summary="Acme Corp raised $10M in Series A funding."
            ))

    def test_hallucination_million_users(self):
        with pytest.raises(ValidationError, match="million users"):
            ResearchOutput(**valid_research_data(
                company_summary="The platform serves 5 million users worldwide."
            ))

    def test_hallucination_valued_at(self):
        with pytest.raises(ValidationError, match="valued at"):
            ResearchOutput(**valid_research_data(
                company_summary="Acme Corp is valued at $200M after its latest round."
            ))

    def test_hallucination_according_to(self):
        with pytest.raises(ValidationError, match="according to"):
            ResearchOutput(**valid_research_data(
                company_summary="According to Crunchbase, Acme Corp is growing fast."
            ))

    def test_invalid_company_size(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(company_size_estimate="big"))

    def test_valid_company_size_51_200(self):
        result = ResearchOutput(**valid_research_data(company_size_estimate="51-200"))
        assert result.company_size_estimate == "51-200"

    def test_valid_company_size_unknown(self):
        result = ResearchOutput(**valid_research_data(company_size_estimate="unknown"))
        assert result.company_size_estimate == "unknown"

    def test_valid_company_size_1000_plus(self):
        result = ResearchOutput(**valid_research_data(company_size_estimate="1000+"))
        assert result.company_size_estimate == "1000+"

    def test_confidence_too_high(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(confidence_score=1.5))

    def test_confidence_negative(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(confidence_score=-0.1))

    def test_confidence_boundary_zero(self):
        result = ResearchOutput(**valid_research_data(confidence_score=0.0))
        assert result.confidence_score == 0.0

    def test_confidence_boundary_one(self):
        result = ResearchOutput(**valid_research_data(confidence_score=1.0))
        assert result.confidence_score == 1.0

    def test_empty_pain_points_rejected(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(potential_pain_points=[]))

    def test_too_many_personalization_hooks(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(
                personalization_hooks=["a", "b", "c", "d", "e", "f"]
            ))

    def test_summary_too_long(self):
        with pytest.raises(ValidationError):
            ResearchOutput(**valid_research_data(company_summary="x" * 501))


# ===========================================================================
# EmailOutput tests (10+)
# ===========================================================================


class TestEmailOutput:
    def test_valid_email(self):
        result = EmailOutput(**valid_email_data())
        assert len(result.subject_options) == 2
        assert len(result.body) > 50

    def test_body_with_first_name_placeholder(self):
        with pytest.raises(ValidationError, match="first_name"):
            EmailOutput(**valid_email_data(
                body="Hi {first_name}, I wanted to reach out about your company and discuss how we can help improve your workflow significantly."
            ))

    def test_body_with_insert_placeholder(self):
        with pytest.raises(ValidationError, match="INSERT"):
            EmailOutput(**valid_email_data(
                body="Hi Sarah, I noticed [INSERT YOUR CTA HERE] and wanted to connect about your team's API testing challenges."
            ))

    def test_body_with_your_placeholder(self):
        with pytest.raises(ValidationError, match="YOUR"):
            EmailOutput(**valid_email_data(
                body="Hi Sarah, I noticed [YOUR COMPANY] is growing and wanted to connect about your team's API testing challenges."
            ))

    def test_body_with_curly_braces(self):
        with pytest.raises(ValidationError, match="\\{\\{"):
            EmailOutput(**valid_email_data(
                body="Hi {{name}}, I wanted to reach out about your company and how we can help your team scale their testing workflows."
            ))

    def test_body_with_company_placeholder(self):
        with pytest.raises(ValidationError, match="company"):
            EmailOutput(**valid_email_data(
                body="Hi Sarah, I noticed {company} is growing and wanted to connect about your team's API testing process and challenges."
            ))

    def test_body_too_short(self):
        with pytest.raises(ValidationError):
            EmailOutput(**valid_email_data(body="Hi, let's chat."))

    def test_body_too_long(self):
        with pytest.raises(ValidationError):
            EmailOutput(**valid_email_data(body="x" * 2501))

    def test_subject_one_word_rejected(self):
        with pytest.raises(ValidationError, match="too short"):
            EmailOutput(**valid_email_data(subject_options=["Hello"]))

    def test_subject_twelve_words_rejected(self):
        with pytest.raises(ValidationError, match="too long"):
            EmailOutput(**valid_email_data(
                subject_options=["This is a very long subject line that has way too many words in it"]
            ))

    def test_subject_five_words_passes(self):
        result = EmailOutput(**valid_email_data(
            subject_options=["Quick thought on your API"]
        ))
        assert len(result.subject_options) == 1

    def test_empty_subject_list_rejected(self):
        with pytest.raises(ValidationError):
            EmailOutput(**valid_email_data(subject_options=[]))

    def test_body_with_angle_placeholder(self):
        with pytest.raises(ValidationError, match="PLACEHOLDER"):
            EmailOutput(**valid_email_data(
                body="Hi Sarah, <PLACEHOLDER for personalization> I wanted to reach out about your company and discuss testing."
            ))


# ===========================================================================
# SentimentOutput tests (5+)
# ===========================================================================


class TestSentimentOutput:
    def test_valid_sentiment(self):
        result = SentimentOutput(**valid_sentiment_data())
        assert result.sentiment == "interested"

    def test_invalid_sentiment_value(self):
        with pytest.raises(ValidationError):
            SentimentOutput(**valid_sentiment_data(sentiment="maybe"))

    def test_all_valid_sentiments(self):
        for s in ["interested", "not_interested", "out_of_office", "unsubscribe", "question"]:
            result = SentimentOutput(**valid_sentiment_data(sentiment=s))
            assert result.sentiment == s

    def test_confidence_too_high(self):
        with pytest.raises(ValidationError):
            SentimentOutput(**valid_sentiment_data(confidence=2.0))

    def test_reasoning_too_long(self):
        with pytest.raises(ValidationError):
            SentimentOutput(**valid_sentiment_data(reasoning="x" * 201))

    def test_reasoning_at_limit(self):
        result = SentimentOutput(**valid_sentiment_data(reasoning="x" * 200))
        assert len(result.reasoning) == 200

    def test_confidence_zero(self):
        result = SentimentOutput(**valid_sentiment_data(confidence=0.0))
        assert result.confidence == 0.0
