import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.leads import LeadResponse
from app.schemas.lists import ListCreate, ListResponse, AddLeadsRequest
from app.services.list_service import (
    create_list,
    get_lists,
    get_list_by_id,
    get_list_members,
    get_dynamic_list_members,
    add_leads_to_list,
    remove_leads_from_list,
)
from app.services.csv_import import import_leads_from_csv

router = APIRouter(prefix="/api/v1", tags=["leads", "lists"])


# ── CSV Bulk Import ──

_CSV_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_CONTENT_TYPES = {"text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"}


@router.post("/leads/bulk")
async def bulk_import_leads(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk import leads from CSV file. Max 5 MB; must be .csv content type."""
    # Filename extension check
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV (.csv extension required)")

    # MIME type check
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type '{content_type}'. Expected a CSV content type.",
        )

    # Read with size limit
    content = await file.read(_CSV_MAX_BYTES + 1)
    if len(content) > _CSV_MAX_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 5 MB size limit")

    result = await import_leads_from_csv(db, content, owner_id=current_user.id)
    return result


# ── Lead Lists ──

@router.post("/lists", response_model=ListResponse, status_code=status.HTTP_201_CREATED)
async def create_list_endpoint(
    data: ListCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a static or dynamic lead list."""
    if data.is_dynamic and not data.filter_criteria:
        raise HTTPException(status_code=400, detail="Dynamic lists require filter_criteria")

    lead_list = await create_list(db, {**data.model_dump(), "owner_id": current_user.id})
    return {**lead_list.__dict__, "member_count": 0}


@router.get("/lists", response_model=list[ListResponse])
async def list_all_lists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all lists with member counts."""
    return await get_lists(db, owner_id=current_user.id)


@router.get("/lists/{list_id}")
async def get_list_detail(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list details with members (evaluates filter if dynamic)."""
    lead_list = await get_list_by_id(db, list_id, owner_id=current_user.id)
    if not lead_list:
        raise HTTPException(status_code=404, detail="List not found")

    if lead_list.is_dynamic and lead_list.filter_criteria:
        members = await get_dynamic_list_members(db, lead_list.filter_criteria, owner_id=current_user.id)
    else:
        members = await get_list_members(db, list_id)

    return {
        "id": lead_list.id,
        "name": lead_list.name,
        "description": lead_list.description,
        "filter_criteria": lead_list.filter_criteria,
        "is_dynamic": lead_list.is_dynamic,
        "member_count": len(members),
        "created_at": lead_list.created_at,
        "members": members,
    }


@router.post("/lists/{list_id}/leads")
async def add_leads_to_list_endpoint(
    list_id: uuid.UUID,
    data: AddLeadsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add leads to a static list. Returns 400 for dynamic lists."""
    lead_list = await get_list_by_id(db, list_id, owner_id=current_user.id)
    if not lead_list:
        raise HTTPException(status_code=404, detail="List not found")
    if lead_list.is_dynamic:
        raise HTTPException(status_code=400, detail="Cannot manually add leads to a dynamic list")

    added = await add_leads_to_list(db, list_id, data.lead_ids)
    return {"added": added}


@router.delete("/lists/{list_id}/leads")
async def remove_leads_from_list_endpoint(
    list_id: uuid.UUID,
    data: AddLeadsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove leads from a static list."""
    lead_list = await get_list_by_id(db, list_id, owner_id=current_user.id)
    if not lead_list:
        raise HTTPException(status_code=404, detail="List not found")
    if lead_list.is_dynamic:
        raise HTTPException(status_code=400, detail="Cannot manually remove leads from a dynamic list")

    removed = await remove_leads_from_list(db, list_id, data.lead_ids)
    return {"removed": removed}
