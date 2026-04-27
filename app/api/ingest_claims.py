"""Ingest claim endpoints for authority intake.

Example:
    curl -X POST http://localhost:8787/api/ingest/claims \
      -H 'Content-Type: application/json' \
      -d '{"node_id":"runner-1","source_name":"primary","kind":"file","local_ref":"/mnt/clip.mov","materialization_mode":"upload"}'
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.runtime_device_auth import RuntimeDeviceAuthContext, require_device_scope
from app.domain.ingest.contracts import SubmitAssetClaimRequest, SubmitAssetClaimResponse
from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(prefix="/api/ingest/claims", tags=["ingest"])
"""Route ownership:
- Audience: operator/read + registered node mutation for claim submission.
- Auth boundary: Caddy/operator boundary for read/maintenance; node bearer token for submit mutation.
- State owner: ingest claim service/registry.
- Naming policy: keep ingest claim ownership under /api/ingest/claims.
"""


@router.post("", response_model=SubmitAssetClaimResponse, status_code=201)
async def submit_ingest_claim(
    payload: SubmitAssetClaimRequest,
    ctx: RuntimeDeviceAuthContext = Depends(require_device_scope("ingest:write")),
    runtime: AppRuntime = Depends(get_runtime),
) -> SubmitAssetClaimResponse:
    service = runtime.services.ingest_claim_service
    if service is None:
        raise HTTPException(status_code=503, detail="Ingest claim service is unavailable")

    node_source_name = getattr(ctx.node, "source_name", None)
    source_name = payload.source_name
    if node_source_name and source_name and source_name != node_source_name:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "source_not_owned_by_node",
                "node_id": ctx.node_id,
                "node_source_name": node_source_name,
                "claim_source_name": source_name,
            },
        )

    updates = {"node_id": ctx.node_id}
    if not source_name and node_source_name:
        updates["source_name"] = node_source_name
    payload = payload.model_copy(update=updates)

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


@router.delete("/{claim_id}")
async def delete_ingest_claim(claim_id: str, runtime: AppRuntime = Depends(get_runtime)) -> dict[str, object]:
    service = runtime.services.ingest_claim_service
    if service is None:
        raise HTTPException(status_code=503, detail="Ingest claim service is unavailable")

    deleted = service.delete_claim(claim_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="ingest_claim_not_found")

    return {
        "ok": True,
        "deleted": True,
        "claim_id": claim_id,
    }


@router.post("/prune")
async def prune_ingest_claims(
    older_than_seconds: int = Query(default=86400, ge=1),
    runtime: AppRuntime = Depends(get_runtime),
) -> dict[str, object]:
    service = runtime.services.ingest_claim_service
    if service is None:
        raise HTTPException(status_code=503, detail="Ingest claim service is unavailable")

    removed_count = service.prune_claims(
        older_than_seconds=older_than_seconds,
        statuses={"materialization_pending", "failed"},
    )
    return {
        "ok": True,
        "removed": removed_count,
        "count": removed_count,
        "older_than_seconds": older_than_seconds,
    }
