from typing import Any, Callable, Coroutine
import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession


async def get_or_404(fetch_fn: Callable[..., Coroutine[Any, Any, Any]], *args, detail: str = "Not found") -> Any:
    """Call fetch_fn(*args); raise 404 with `detail` if result is None."""
    obj = await fetch_fn(*args)
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj
