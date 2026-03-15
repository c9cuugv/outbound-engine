import re
import asyncio
from typing import Any

import dns.resolver


# ── Email Validation ──

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

ROLE_BASED_PREFIXES = [
    "info@", "support@", "sales@", "admin@", "contact@",
    "help@", "noreply@", "no-reply@", "billing@", "abuse@",
    "postmaster@", "webmaster@", "hostmaster@", "marketing@",
]


def is_valid_email(email: str) -> bool:
    """Check email against regex pattern."""
    return bool(EMAIL_REGEX.match(email))


def is_role_based_email(email: str) -> bool:
    """Check if email starts with a role-based prefix."""
    email_lower = email.lower()
    return any(email_lower.startswith(prefix) for prefix in ROLE_BASED_PREFIXES)


# ── MX Record Check ──

_mx_cache: dict[str, bool] = {}


async def check_mx_record(domain: str, timeout: float = 3.0) -> bool:
    """
    Check if domain has valid MX records. Results cached per domain.
    Returns True if MX records exist, False otherwise.
    Times out after `timeout` seconds — returns True on timeout (fail-open).
    """
    if domain in _mx_cache:
        return _mx_cache[domain]

    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: dns.resolver.resolve(domain, "MX")),
            timeout=timeout,
        )
        has_mx = len(result) > 0
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        has_mx = False
    except (asyncio.TimeoutError, Exception):
        # Fail open on timeout or unexpected errors
        has_mx = True

    _mx_cache[domain] = has_mx
    return has_mx


def clear_mx_cache():
    """Clear the MX record cache (useful for testing)."""
    _mx_cache.clear()
