import uuid

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadList, LeadListMember


async def create_list(db: AsyncSession, data: dict) -> LeadList:
    lead_list = LeadList(**data)
    db.add(lead_list)
    await db.commit()
    await db.refresh(lead_list)
    return lead_list


async def get_lists(db: AsyncSession, owner_id: uuid.UUID) -> list[dict]:
    """Get all lists owned by owner_id with member counts in a single query."""
    query = (
        select(
            LeadList,
            func.count(LeadListMember.lead_id).label("member_count"),
        )
        .outerjoin(LeadListMember, LeadList.id == LeadListMember.lead_list_id)
        .where(LeadList.owner_id == owner_id)
        .group_by(LeadList.id)
        .order_by(LeadList.created_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": row.LeadList.id,
            "name": row.LeadList.name,
            "description": row.LeadList.description,
            "filter_criteria": row.LeadList.filter_criteria,
            "is_dynamic": row.LeadList.is_dynamic,
            "member_count": row.member_count,
            "created_at": row.LeadList.created_at,
        }
        for row in rows
    ]


async def get_list_by_id(
    db: AsyncSession, list_id: uuid.UUID, owner_id: uuid.UUID
) -> LeadList | None:
    result = await db.execute(
        select(LeadList).where(LeadList.id == list_id, LeadList.owner_id == owner_id)
    )
    return result.scalar_one_or_none()


async def get_list_members(db: AsyncSession, list_id: uuid.UUID) -> list[Lead]:
    """Get actual lead objects for a static list."""
    query = (
        select(Lead)
        .join(LeadListMember, Lead.id == LeadListMember.lead_id)
        .where(LeadListMember.lead_list_id == list_id)
        .order_by(Lead.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_dynamic_list_members(
    db: AsyncSession, filter_criteria: dict, owner_id: uuid.UUID
) -> list[Lead]:
    """Evaluate dynamic filter criteria and return matching leads."""
    filters = []

    if "status" in filter_criteria:
        statuses = filter_criteria["status"]
        if isinstance(statuses, list):
            filters.append(Lead.status.in_(statuses))
        else:
            filters.append(Lead.status == statuses)

    if "research_status" in filter_criteria:
        rs = filter_criteria["research_status"]
        if isinstance(rs, list):
            filters.append(Lead.research_status.in_(rs))
        else:
            filters.append(Lead.research_status == rs)

    if "company_size" in filter_criteria:
        sizes = filter_criteria["company_size"]
        if isinstance(sizes, list):
            filters.append(Lead.company_size.in_(sizes))
        else:
            filters.append(Lead.company_size == sizes)

    if "company_industry" in filter_criteria:
        industries = filter_criteria["company_industry"]
        if isinstance(industries, list):
            filters.append(Lead.company_industry.in_(industries))
        else:
            filters.append(Lead.company_industry == industries)

    if "company_domain" in filter_criteria:
        filters.append(Lead.company_domain == filter_criteria["company_domain"])

    # Always scope to owner and exclude deleted leads
    filters.append(Lead.owner_id == owner_id)
    filters.append(Lead.status != "deleted")

    where = and_(*filters) if filters else and_(Lead.owner_id == owner_id, Lead.status != "deleted")
    result = await db.execute(select(Lead).where(where).order_by(Lead.created_at.desc()))
    return list(result.scalars().all())


async def add_leads_to_list(db: AsyncSession, list_id: uuid.UUID, lead_ids: list[uuid.UUID]) -> int:
    """Add leads to a static list. Returns count of newly added leads."""
    added = 0
    for lead_id in lead_ids:
        # Check if already a member
        existing = await db.execute(
            select(LeadListMember).where(
                LeadListMember.lead_list_id == list_id,
                LeadListMember.lead_id == lead_id,
            )
        )
        if existing.scalar_one_or_none() is None:
            member = LeadListMember(lead_list_id=list_id, lead_id=lead_id)
            db.add(member)
            added += 1

    await db.commit()
    return added


async def remove_leads_from_list(db: AsyncSession, list_id: uuid.UUID, lead_ids: list[uuid.UUID]) -> int:
    """Remove leads from a static list. Returns count of removed leads."""
    removed = 0
    for lead_id in lead_ids:
        result = await db.execute(
            select(LeadListMember).where(
                LeadListMember.lead_list_id == list_id,
                LeadListMember.lead_id == lead_id,
            )
        )
        member = result.scalar_one_or_none()
        if member:
            await db.delete(member)
            removed += 1

    await db.commit()
    return removed
