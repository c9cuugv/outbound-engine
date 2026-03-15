import csv
import io
import uuid
from typing import Any

# Characters that trigger formula execution in spreadsheet apps
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_field(value: str) -> str:
    """Strip leading formula-injection characters from a CSV field value."""
    while value and value[0] in _FORMULA_PREFIXES:
        value = value[1:].lstrip()
    return value

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.utils.email_validator import is_valid_email, is_role_based_email, check_mx_record

REQUIRED_FIELDS = ["email", "first_name", "last_name"]
ALLOWED_FIELDS = [
    "first_name", "last_name", "email", "company_name",
    "company_domain", "title", "linkedin_url",
]


async def import_leads_from_csv(
    db: AsyncSession, file_content: bytes, owner_id: uuid.UUID
) -> dict[str, Any]:
    """
    Parse CSV and import leads with full validation pipeline.
    Returns: {imported, skipped_duplicate, skipped_invalid, errors}
    """
    imported = 0
    skipped_duplicate = 0
    skipped_invalid = 0
    errors: list[dict] = []

    # Parse CSV
    text = file_content.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    # Get existing emails in one query (for dedup)
    result = await db.execute(select(Lead.email))
    existing_emails = {row[0].lower() for row in result.all()}

    for row_num, row in enumerate(reader, start=2):  # row 1 is header
        # Normalize keys
        row = {k.strip().lower(): v.strip() if v else "" for k, v in row.items()}

        email = row.get("email", "").lower()

        # 1. Required fields check
        missing = [f for f in REQUIRED_FIELDS if not row.get(f)]
        if missing:
            skipped_invalid += 1
            errors.append({
                "row": row_num,
                "email": email or "(empty)",
                "reason": f"missing required fields: {', '.join(missing)}",
            })
            continue

        # 2. Email format check
        if not is_valid_email(email):
            skipped_invalid += 1
            errors.append({
                "row": row_num,
                "email": email,
                "reason": "invalid email format",
            })
            continue

        # 3. Role-based email check
        if is_role_based_email(email):
            skipped_invalid += 1
            errors.append({
                "row": row_num,
                "email": email,
                "reason": "role-based email rejected",
            })
            continue

        # 4. MX record check
        domain = email.split("@")[1]
        has_mx = await check_mx_record(domain)
        if not has_mx:
            skipped_invalid += 1
            errors.append({
                "row": row_num,
                "email": email,
                "reason": f"domain '{domain}' has no MX records",
            })
            continue

        # 5. Dedup against existing leads
        if email in existing_emails:
            skipped_duplicate += 1
            continue

        # Build lead data — sanitize all string fields against formula injection
        lead_data = {}
        for field in ALLOWED_FIELDS:
            value = row.get(field)
            if value:
                lead_data[field] = _sanitize_csv_field(value)

        lead_data["email"] = email
        lead_data["source"] = "csv_import"
        lead_data["owner_id"] = owner_id

        lead = Lead(**lead_data)
        db.add(lead)
        existing_emails.add(email)  # prevent dupes within same file
        imported += 1

    await db.commit()

    return {
        "imported": imported,
        "skipped_duplicate": skipped_duplicate,
        "skipped_invalid": skipped_invalid,
        "errors": errors,
    }
