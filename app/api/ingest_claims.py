"""Ingest claim endpoints for authority intake.

Example:
    curl -X POST http://localhost:8787/api/ingest/claims \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-1","source_name":"primary","kind":"file","local_ref":"/mnt/clip.mov","materialization_mode":"upload"}'
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException

from app.domain.ingest.contracts import SubmitAssetClaimRequest, SubmitAssetClaimResponse
from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/ingest/claims", tags=["ingest"])


@router.post("", response_model=SubmitAssetClaimResponse, status_code=201)
async def submit_ingest_claim(
    payload: SubmitAssetClaimRequest,
    runtime: AppRuntime = Depends(get_runtime),
) -> SubmitAssetClaimResponse:
    service = runtime.services.ingest_claim_service
    if service is None:
        raise HTTPException(status_code=503, detail="Ingest claim service is unavailable")
    try:
        return service.submit_claim(payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
async def list_ingest_claims(runtime: AppRuntime = Depends(get_runtime)) -> list[dict]:
    service = runtime.services.ingest_claim_service
    if service is None:
        return []
    return [asdict(item) for item in service.list_claims()]


@router.get("/{claim_id}")
async def get_ingest_claim(claim_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict:
    service = runtime.services.ingest_claim_service
    if service is None:
        raise HTTPException(status_code=503, detail="Ingest claim service is unavailable")
    try:
        return asdict(service.get_claim(claim_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
