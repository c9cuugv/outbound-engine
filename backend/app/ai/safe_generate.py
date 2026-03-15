"""
Safe Generate with Retry (STORY-3.3)

The ONE function the entire app uses to call LLMs.
Wraps provider calls with JSON parsing, Pydantic validation,
and automatic retry with error feedback to the model.

Usage:
    from app.ai.safe_generate import safe_generate
    from app.ai.schemas import ResearchOutput

    result = await safe_generate(
        provider=provider,
        system_prompt="You are a research analyst.",
        user_prompt="Analyze this company...",
        output_schema=ResearchOutput,
    )
    # result is a validated ResearchOutput instance
"""

from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.exceptions import GenerationError
from app.ai.providers import AIProvider

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _extract_json(raw: str) -> dict:
    """Extract JSON from an LLM response, stripping markdown fences.

    Handles common LLM output patterns:
      - Raw JSON
      - ```json ... ```
      - ``` ... ```
      - JSON embedded in prose (finds first { ... } block)
    """
    cleaned = raw.strip()

    # Strip markdown code fences
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Fallback: find the first JSON object in the response
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError(
        "No valid JSON found in response",
        cleaned[:200],
        0,
    )


async def safe_generate(
    provider: AIProvider,
    system_prompt: str,
    user_prompt: str,
    output_schema: type[T],
    max_retries: int = 3,
) -> T:
    """Generate structured output from an LLM with validation and retry.

    This function:
    1. Appends schema instructions to the user prompt
    2. Calls the provider
    3. Parses JSON from the response (stripping markdown fences)
    4. Validates against the Pydantic schema
    5. On JSON error → retries with error feedback in prompt
    6. On validation error → retries with specific validation error
    7. After max_retries → raises GenerationError

    Args:
        provider: The AI provider instance to use.
        system_prompt: System-level instructions for the LLM.
        user_prompt: The actual task prompt with data.
        output_schema: Pydantic model class to validate against.
        max_retries: Maximum number of attempts (default 3).

    Returns:
        A validated instance of output_schema.

    Raises:
        GenerationError: If all retry attempts fail.
    """
    schema_instruction = (
        "\n\nRespond ONLY with valid JSON matching this schema:\n"
        f"{json.dumps(output_schema.model_json_schema(), indent=2)}\n\n"
        "Rules:\n"
        "- No markdown code fences.\n"
        "- No explanation text before or after the JSON.\n"
        "- Every field is required.\n"
        "- Use ONLY facts from the data provided above.\n"
    )

    # Keep the original prompt intact for retries
    original_user_prompt = user_prompt
    full_prompt = user_prompt + schema_instruction
    last_error: str | None = None

    for attempt in range(1, max_retries + 1):
        logger.info(
            "safe_generate attempt %d/%d for schema %s",
            attempt,
            max_retries,
            output_schema.__name__,
        )

        try:
            # Call the LLM
            raw = await provider.generate(system_prompt, full_prompt)
            logger.debug("Raw LLM response (first 500 chars): %s", raw[:500])

            # Parse JSON
            parsed = _extract_json(raw)

            # Validate with Pydantic
            validated = output_schema.model_validate(parsed)
            logger.info(
                "safe_generate succeeded on attempt %d for %s",
                attempt,
                output_schema.__name__,
            )
            return validated

        except json.JSONDecodeError as e:
            last_error = f"Invalid JSON on attempt {attempt}: {e}"
            logger.warning(last_error)

            # Rebuild prompt with error feedback, preserving original context
            full_prompt = (
                f"Your previous response was not valid JSON.\n"
                f"Error: {last_error}\n"
                f"Return ONLY raw JSON with no markdown fences or extra text.\n\n"
                f"{original_user_prompt}{schema_instruction}"
            )

        except ValidationError as e:
            last_error = f"Schema validation failed on attempt {attempt}: {e}"
            logger.warning(last_error)

            # Rebuild prompt with specific validation errors
            full_prompt = (
                f"Your previous response failed schema validation.\n"
                f"Errors:\n{e}\n"
                f"Fix these specific issues and try again.\n\n"
                f"{original_user_prompt}{schema_instruction}"
            )

        except Exception as e:
            last_error = f"Unexpected error on attempt {attempt}: {e}"
            logger.error(last_error, exc_info=True)

            # For unexpected errors, still retry with original prompt
            full_prompt = original_user_prompt + schema_instruction

    raise GenerationError(
        f"Failed to generate valid {output_schema.__name__} "
        f"after {max_retries} attempts. Last error: {last_error}"
    )
