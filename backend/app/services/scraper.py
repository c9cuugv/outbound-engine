"""
Company Website Scraper (STORY-4.1)

Scrapes key pages from a company's website to provide raw text
for the AI research synthesis pipeline.

Usage:
    scraper = CompanyScraper()
    data = await scraper.scrape_company("stripe.com")
    # Returns: {"/": "homepage text...", "/about": "about text...", ...}
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Tags to remove — these contain navigation/boilerplate, not content
_REMOVE_TAGS = ["script", "style", "nav", "footer", "header", "noscript", "svg", "iframe"]

# Max characters per page to stay within LLM token limits
_MAX_CHARS_PER_PAGE = 2000

# Timeout per page request
_PAGE_TIMEOUT = 10.0

_USER_AGENT = "OutboundEngine/1.0 (research bot)"


class CompanyScraper:
    """Scrapes company websites for AI research input.

    Attempts to fetch key pages (homepage, about, blog, careers, pricing),
    strips HTML boilerplate, and returns clean text per page.

    Designed to be resilient — unreachable pages are silently skipped,
    and the scraper never raises exceptions to callers.
    """

    PAGES = [
        "/",
        "/about",
        "/about-us",
        "/company",
        "/blog",
        "/careers",
        "/pricing",
    ]

    async def scrape_company(self, domain: str) -> dict[str, str]:
        """Scrape key pages from a company website.

        Args:
            domain: The company domain (e.g., "stripe.com").

        Returns:
            Dict mapping page paths to extracted text content.
            Empty dict if the domain is entirely unreachable.
        """
        results: dict[str, str] = {}

        async with httpx.AsyncClient(
            timeout=_PAGE_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            pages = await asyncio.gather(
                *(self._scrape_page(client, domain, p) for p in self.PAGES)
            )
            for path, text in zip(self.PAGES, pages):
                if text:
                    results[path] = text

        if results:
            logger.info(
                "Scraped %d pages from %s: %s",
                len(results),
                domain,
                list(results.keys()),
            )
        else:
            logger.warning("No pages scraped from %s", domain)

        return results

    async def _scrape_page(
        self, client: httpx.AsyncClient, domain: str, path: str
    ) -> str | None:
        """Attempt to scrape a single page, trying HTTPS then HTTP.

        Returns extracted text or None if the page is unreachable.
        """
        for scheme in ("https", "http"):
            url = f"{scheme}://{domain}{path}"
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return self._extract_text(resp.text)
            except httpx.TimeoutException:
                logger.debug("Timeout fetching %s", url)
            except httpx.HTTPError as e:
                logger.debug("HTTP error fetching %s: %s", url, e)
            except Exception as e:
                logger.debug("Unexpected error fetching %s: %s", url, e)

            # Only try HTTP fallback if HTTPS failed
            if scheme == "https":
                continue
        return None

    @staticmethod
    def _extract_text(html: str) -> str | None:
        """Extract clean text from HTML, removing boilerplate elements.

        Returns None if the resulting text is too short to be useful.
        """
        soup = BeautifulSoup(html, "html.parser")

        # Remove non-content elements
        for tag in soup(_REMOVE_TAGS):
            tag.decompose()

        # Extract text with newline separators, strip whitespace
        text = soup.get_text(separator="\n", strip=True)

        # Truncate to limit
        text = text[:_MAX_CHARS_PER_PAGE]

        # Skip pages with very little content (likely error pages)
        if len(text.strip()) < 50:
            return None

        return text
