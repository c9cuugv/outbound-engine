"""
Signal Collector (STORY-4.2)

Supplements the website scraper with structured signals:
  - Tech stack detection via HTML meta tags and script patterns
  - Hiring signals via job board presence (Greenhouse, Lever)

Usage:
    collector = SignalCollector()
    tech = await collector.get_tech_signals("stripe.com")
    hiring = await collector.get_hiring_signals("stripe.com")
    all_signals = await collector.collect_all("stripe.com")
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx

logger = logging.getLogger(__name__)

_HIRING_TIMEOUT = 5.0
_SCRAPE_TIMEOUT = 10.0
_USER_AGENT = "OutboundEngine/1.0 (research bot)"

# Script/meta patterns to detect technologies
_TECH_PATTERNS: dict[str, list[str]] = {
    # Frontend frameworks
    "React": [r"react", r"__NEXT_DATA__", r"_next/"],
    "Angular": [r"angular", r"ng-app", r"ng-controller"],
    "Vue.js": [r"vue\.js", r"vuejs", r"__vue__"],
    "jQuery": [r"jquery"],
    # Payment / Commerce
    "Stripe": [r"stripe\.js", r"js\.stripe\.com"],
    "Shopify": [r"shopify", r"cdn\.shopify"],
    # Analytics / Marketing
    "Segment": [r"segment\.com/analytics", r"analytics\.js"],
    "HubSpot": [r"hubspot", r"hs-scripts"],
    "Intercom": [r"intercom", r"widget\.intercom"],
    "Google Analytics": [r"gtag", r"google-analytics", r"googletagmanager"],
    # CMS / Site builders
    "WordPress": [r"wp-content", r"wordpress"],
    "Webflow": [r"webflow"],
    "Squarespace": [r"squarespace"],
    "Wix": [r"wix\.com", r"parastorage"],
}

# Job board URL patterns
_JOB_BOARD_URLS = [
    "https://{domain}.greenhouse.io/jobs",
    "https://jobs.lever.co/{domain}",
]


class SignalCollector:
    """Collects supplementary signals about a company.

    Detects technology stack from homepage HTML patterns
    and checks for hiring activity on major job boards.
    All errors are caught internally — methods never raise.
    """

    async def collect_all(self, domain: str) -> dict:
        """Collect all available signals for a domain.

        Args:
            domain: Company domain (e.g., "stripe.com").

        Returns:
            Dict with tech_stack (list) and hiring_signals (dict or None).
        """
        tech, hiring = await asyncio.gather(
            self.get_tech_signals(domain),
            self.get_hiring_signals(domain),
        )
        return {
            "tech_stack": tech,
            "hiring_signals": hiring,
        }

    async def get_tech_signals(self, domain: str) -> list[str]:
        """Detect technologies from homepage HTML.

        Scans the raw HTML for known script patterns, meta tags,
        and link patterns that indicate specific technologies.

        Args:
            domain: Company domain (e.g., "stripe.com").

        Returns:
            List of detected technology names. Empty list if none found.
        """
        html = await self._fetch_homepage(domain)
        if not html:
            return []

        detected: list[str] = []
        html_lower = html.lower()

        for tech_name, patterns in _TECH_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, html_lower):
                    detected.append(tech_name)
                    break  # One match is enough per technology

        # Check meta generator tag specifically
        generator = self._extract_meta_generator(html)
        if generator and generator not in detected:
            detected.append(generator)

        logger.info("Tech signals for %s: %s", domain, detected)
        return detected

    async def get_hiring_signals(self, domain: str) -> dict | None:
        """Check major job boards for open positions.

        A company actively hiring is a growth signal useful for
        personalization in outreach emails.

        Args:
            domain: Company domain (e.g., "stripe.com").

        Returns:
            Dict with board name and status, or None on timeout/error.
        """
        # Strip TLD for job board URL patterns (stripe.com → stripe)
        company_slug = domain.split(".")[0]

        results: dict[str, bool] = {}

        async with httpx.AsyncClient(
            timeout=_HIRING_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            async def _check_board(client: httpx.AsyncClient, url: str, board_name: str) -> tuple[str, bool]:
                try:
                    resp = await client.get(url)
                    return board_name, resp.status_code == 200
                except httpx.TimeoutException:
                    logger.debug("Hiring check timeout: %s", url)
                    return board_name, False
                except httpx.HTTPError:
                    return board_name, False
                except Exception:
                    return board_name, False

            board_checks = []
            for url_template in _JOB_BOARD_URLS:
                url = url_template.format(domain=company_slug)
                board_name = "greenhouse" if "greenhouse" in url else "lever"
                board_checks.append(_check_board(client, url, board_name))

            for board_name, is_active in await asyncio.gather(*board_checks):
                results[board_name] = is_active

        is_hiring = any(results.values())

        if is_hiring:
            logger.info(
                "Hiring signals for %s: actively hiring (boards: %s)",
                domain,
                results,
            )
        return {
            "is_hiring": is_hiring,
            "boards": results,
        }

    async def _fetch_homepage(self, domain: str) -> str | None:
        """Fetch raw homepage HTML for tech detection."""
        async with httpx.AsyncClient(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            for scheme in ("https", "http"):
                try:
                    resp = await client.get(f"{scheme}://{domain}")
                    if resp.status_code == 200:
                        return resp.text
                except Exception:
                    continue
        return None

    @staticmethod
    def _extract_meta_generator(html: str) -> str | None:
        """Extract the content of <meta name="generator"> tag."""
        match = re.search(
            r'<meta\s+name=["\']generator["\']\s+content=["\']([^"\']+)["\']',
            html,
            re.IGNORECASE,
        )
        if match:
            return match.group(1).strip()
        return None
