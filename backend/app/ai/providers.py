"""
AI Provider Interface and Implementations (STORY-3.1)

Abstraction layer so the app never calls an LLM directly.
All providers implement the same AIProvider ABC.
The app uses factory.get_provider(task) to get the right one.

Supported providers:
  - GeminiProvider   — FREE, default, no credit card needed
  - GroqProvider     — FREE, Llama 3.1 70B on Groq hardware
  - ClaudeCodeProvider — Uses local Claude Code CLI (Pro/Max plan)
  - AnthropicAPIProvider — Paid Anthropic API, highest quality
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class AIProvider(ABC):
    """Base interface for all LLM providers.

    Every provider must implement generate() for raw text output.
    generate_json() is built on top with automatic fence-stripping.
    """

    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Send a prompt and return the raw text response."""
        ...

class GeminiProvider(AIProvider):
    """Google Gemini 2.0 Flash — FREE, default provider.

    No credit card needed. Get API key from aistudio.google.com.
    Rate limits: 15 RPM, 1M TPM (free tier).
    """

    def __init__(self, api_key: str):
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError(
                "google-generativeai package required. "
                "Install with: pip install google-generativeai"
            )

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash")
        logger.info("GeminiProvider initialized with gemini-2.0-flash")

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        response = await asyncio.to_thread(self.model.generate_content, full_prompt)
        return response.text


class GroqProvider(AIProvider):
    """Groq — FREE, runs Llama 3.1 70B on custom hardware.

    Fast inference. Get API key from console.groq.com.
    Rate limits: 30 RPM, 15K tokens/min (free tier).
    """

    def __init__(self, api_key: str):
        try:
            from groq import Groq
        except ImportError:
            raise ImportError(
                "groq package required. Install with: pip install groq"
            )

        self.client = Groq(api_key=api_key)
        logger.info("GroqProvider initialized with llama-3.1-70b-versatile")

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = await asyncio.to_thread(
            self.client.chat.completions.create,
            model="llama-3.1-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1000,
        )
        return response.choices[0].message.content


class ClaudeCodeProvider(AIProvider):
    """Claude Code CLI — uses local `claude` binary.

    Requires Claude Pro or Max subscription.
    Calls the CLI as a subprocess, parsing JSON output.
    """

    def __init__(self):
        logger.info("ClaudeCodeProvider initialized (using local claude CLI)")

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["claude", "-p", full_prompt, "--output-format", "json"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"Claude CLI exited with code {result.returncode}: "
                    f"{result.stderr[:500]}"
                )
            parsed = json.loads(result.stdout)
            return parsed.get("result", result.stdout)
        except FileNotFoundError:
            raise RuntimeError(
                "Claude CLI not found. Install from: "
                "https://docs.anthropic.com/en/docs/claude-code"
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Claude CLI timed out after 120 seconds")


class AnthropicAPIProvider(AIProvider):
    """Anthropic API — paid, highest quality.

    Uses the official anthropic Python SDK.
    Best for production workloads with API key access.
    """

    def __init__(self, api_key: str):
        try:
            from anthropic import Anthropic
        except ImportError:
            raise ImportError(
                "anthropic package required. Install with: pip install anthropic"
            )

        self.client = Anthropic(api_key=api_key)
        logger.info("AnthropicAPIProvider initialized with claude-sonnet-4-20250514")

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = await asyncio.to_thread(
            self.client.messages.create,
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text
