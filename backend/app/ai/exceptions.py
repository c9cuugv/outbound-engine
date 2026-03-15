"""
Custom exceptions for the AI layer (STORY-3.1 + STORY-3.3)
"""


class ConfigError(Exception):
    """Raised when provider configuration is missing or invalid.

    Examples:
        - Required API key not set in environment
        - Unknown provider name specified
    """
    pass


class GenerationError(Exception):
    """Raised when LLM generation fails after all retry attempts.

    Contains details about the last error encountered so callers
    can log or display meaningful failure information.
    """
    pass
