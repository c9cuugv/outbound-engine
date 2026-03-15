import abc
import json
from dataclasses import dataclass

from app.config import settings


class HardBounceError(Exception):
    """Permanent delivery failure — do not retry."""
    pass


class SoftBounceError(Exception):
    """Temporary delivery failure — safe to retry."""
    pass


@dataclass
class SendResult:
    success: bool
    message_id: str | None = None
    error: str | None = None


class EmailProvider(abc.ABC):
    """Abstract email sending interface."""

    @abc.abstractmethod
    async def send(
        self,
        to_email: str,
        from_email: str,
        from_name: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> SendResult:
        """Send an email. Raises HardBounceError or SoftBounceError on failure."""
        ...


class ConsoleProvider(EmailProvider):
    """Prints emails to stdout. Zero-config default for development."""

    async def send(
        self,
        to_email: str,
        from_email: str,
        from_name: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> SendResult:
        print("\n" + "=" * 60)
        print(f"📧 EMAIL (Console Provider)")
        print(f"  To:       {to_email}")
        print(f"  From:     {from_name} <{from_email}>")
        print(f"  Reply-To: {reply_to or from_email}")
        print(f"  Subject:  {subject}")
        if headers:
            print(f"  Headers:  {json.dumps(headers, indent=2)}")
        print("-" * 60)
        print(html_body[:500])
        if len(html_body) > 500:
            print(f"  ... ({len(html_body)} chars total)")
        print("=" * 60 + "\n")

        return SendResult(success=True, message_id="console-dev")


class ResendProvider(EmailProvider):
    """Send emails via Resend API."""

    def __init__(self):
        import resend
        resend.api_key = settings.RESEND_API_KEY

    async def send(
        self,
        to_email: str,
        from_email: str,
        from_name: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> SendResult:
        import resend

        all_headers = headers or {}
        all_headers["List-Unsubscribe"] = all_headers.get("List-Unsubscribe", "")

        try:
            result = resend.Emails.send({
                "from": f"{from_name} <{from_email}>",
                "to": [to_email],
                "subject": subject,
                "html": html_body,
                "reply_to": reply_to or from_email,
                "headers": all_headers,
            })
            return SendResult(success=True, message_id=result.get("id"))
        except Exception as e:
            error_msg = str(e).lower()
            if "bounced" in error_msg or "invalid" in error_msg or "not found" in error_msg:
                raise HardBounceError(str(e))
            raise SoftBounceError(str(e))


class SendGridProvider(EmailProvider):
    """Send emails via SendGrid API."""

    def __init__(self):
        from sendgrid import SendGridAPIClient
        self.client = SendGridAPIClient(settings.SENDGRID_API_KEY)

    async def send(
        self,
        to_email: str,
        from_email: str,
        from_name: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
        headers: dict | None = None,
    ) -> SendResult:
        from sendgrid.helpers.mail import Mail, Email, To, Content, Header

        message = Mail(
            from_email=Email(from_email, from_name),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html_body),
        )

        if reply_to:
            message.reply_to = Email(reply_to)

        # Add custom headers
        all_headers = headers or {}
        all_headers["List-Unsubscribe"] = all_headers.get("List-Unsubscribe", "")
        for key, value in all_headers.items():
            message.header = Header(key, value)

        try:
            response = self.client.send(message)
            msg_id = response.headers.get("X-Message-Id", "")
            return SendResult(success=True, message_id=msg_id)
        except Exception as e:
            error_msg = str(e).lower()
            if "bounce" in error_msg or "invalid" in error_msg or "does not exist" in error_msg:
                raise HardBounceError(str(e))
            raise SoftBounceError(str(e))


def get_email_provider() -> EmailProvider:
    """Factory: returns the configured email provider."""
    provider_name = settings.EMAIL_PROVIDER.lower()

    if provider_name == "resend":
        return ResendProvider()
    elif provider_name == "sendgrid":
        return SendGridProvider()
    else:
        return ConsoleProvider()
