import hashlib
import re
import uuid

import redis
from bs4 import BeautifulSoup

from app.config import settings

redis_client = redis.Redis.from_url(settings.REDIS_URL)

LINK_TTL_SECONDS = 90 * 24 * 60 * 60  # 90 days


def inject_tracking(html_body: str, email_id: str) -> str:
    """
    Inject tracking pixel and rewrite links in email HTML.
    
    1. Appends 1×1 transparent pixel <img> before </body>
    2. Rewrites all <a href> links to point to tracking server
    3. Appends unsubscribe link
    4. Stores original URLs in Redis with 90-day TTL
    
    Returns the modified HTML body.
    Skips entirely if TRACKING_DOMAIN is not configured.
    """
    tracking_domain = settings.TRACKING_DOMAIN
    if not tracking_domain:
        return html_body

    soup = BeautifulSoup(html_body, "html.parser")

    # 1. Rewrite <a href> links
    for link in soup.find_all("a", href=True):
        original_url = link["href"]
        if original_url.startswith("mailto:") or original_url.startswith("#"):
            continue

        link_hash = hashlib.sha256(
            f"{email_id}:{original_url}".encode()
        ).hexdigest()[:16]

        # Store original URL in Redis
        redis_client.setex(f"link:{link_hash}", LINK_TTL_SECONDS, original_url)

        # Rewrite link
        link["href"] = f"https://{tracking_domain}/t/c/{email_id}/{link_hash}"

    # 2. Append tracking pixel
    pixel_url = f"https://{tracking_domain}/t/o/{email_id}.png"
    pixel_tag = soup.new_tag("img", src=pixel_url, width="1", height="1", alt="", style="display:none")

    body_tag = soup.find("body")
    if body_tag:
        body_tag.append(pixel_tag)
    else:
        soup.append(pixel_tag)

    # 3. Append unsubscribe link
    unsub_url = f"https://{tracking_domain}/t/u/{email_id}"
    unsub_p = soup.new_tag("p", style="font-size:11px;color:#999;margin-top:20px;")
    unsub_a = soup.new_tag("a", href=unsub_url, style="color:#999;")
    unsub_a.string = "Unsubscribe"
    unsub_p.append(unsub_a)

    if body_tag:
        body_tag.append(unsub_p)
    else:
        soup.append(unsub_p)

    return str(soup)


def get_original_url(link_hash: str) -> str | None:
    """Retrieve original URL from Redis by link hash."""
    result = redis_client.get(f"link:{link_hash}")
    return result.decode() if result else None
