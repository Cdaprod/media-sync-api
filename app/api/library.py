"""Aggregate library endpoints.

Example:
    curl "http://localhost:8787/api/library?scope=all"
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.library_service import build_library_snapshot


router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("")
async def get_library_snapshot(
    source: str | None = Query(default=None, description="Optional source name"),
    scope: str = Query(default="all", description="Snapshot scope. Currently only 'all' is supported."),
):
    """Return the Explorer aggregate snapshot in a single request."""

    try:
        return build_library_snapshot(source_name=source, scope=scope)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
