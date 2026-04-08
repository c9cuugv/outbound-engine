"""
Provider Factory (STORY-3.1)

The ONE entry point for getting an AI provider.
Reads task-specific provider config from environment variables.

Usage:
    provider = get_provider("research")   # Uses RESEARCH_PROVIDER env var
    provider = get_provider("email_gen")  # Uses EMAIL_GEN_PROVIDER env var
    provider = get_provider("sentiment")  # Uses SENTIMENT_PROVIDER env var

Defaults to "gemini" when the env var is not set.
"""

from __future__ import annotations

import os
import logging

from app.ai.exceptions import ConfigError
from app.ai.providers import (
    AIProvider,
    AnthropicAPIProvider,
    ClaudeCodeProvider,
    GeminiProvider,
    GroqProvider,
    NvidiaProvider,
)

logger = logging.getLogger(__name__)

# Maps provider name → (class, required env var for API key)
_PROVIDER_REGISTRY: dict[str, tuple[type[AIProvider], str | None]] = {
    "gemini": (GeminiProvider, "GEMINI_API_KEY"),
    "groq": (GroqProvider, "GROQ_API_KEY"),
    "claude_code": (ClaudeCodeProvider, None),  # No API key needed
    "anthropic_api": (AnthropicAPIProvider, "ANTHROPIC_API_KEY"),
    "nvidia": (NvidiaProvider, "NVIDIA_API_KEY"),
}

DEFAULT_PROVIDER = "gemini"


def get_provider(task: str) -> AIProvider:
    """Get the configured AI provider for a given task.

    Reads {TASK}_PROVIDER from environment (e.g., RESEARCH_PROVIDER=gemini).
    Falls back to DEFAULT_PROVIDER if not set.

    Args:
        task: The task name (e.g., "research", "email_gen", "sentiment").

    Returns:
        Configured AIProvider instance.

    Raises:
        ConfigError: If the provider requires an API key that is not set,
                     or if the provider name is not recognized.
    """
    env_var = f"{task.upper()}_PROVIDER"
    provider_name = os.environ.get(env_var, DEFAULT_PROVIDER).lower()

    if provider_name not in _PROVIDER_REGISTRY:
        available = ", ".join(sorted(_PROVIDER_REGISTRY.keys()))
        raise ConfigError(
            f"Unknown provider '{provider_name}' for task '{task}'. "
            f"Available providers: {available}"
        )

    provider_class, api_key_env = _PROVIDER_REGISTRY[provider_name]

    # Providers that need an API key
    if api_key_env is not None:
        api_key = os.environ.get(api_key_env)
        if not api_key:
            raise ConfigError(
                f"{api_key_env} required for {provider_name} provider. "
                f"Set it in your .env file or environment variables."
            )
        logger.info(
            "Creating %s provider for task '%s'", provider_name, task
        )
        # NVIDIA allows overriding the model via NVIDIA_MODEL env var
        if provider_name == "nvidia":
            model = os.environ.get("NVIDIA_MODEL")
            return provider_class(api_key=api_key, model=model or None)
        return provider_class(api_key=api_key)

    # Providers without API key (e.g., ClaudeCodeProvider)
    logger.info(
        "Creating %s provider for task '%s' (no API key required)",
        provider_name,
        task,
    )
    return provider_class()
