"""Resolve bridge endpoints for handoff to a local Resolve agent.

Usage:
    # Request Resolve to open/import media for a project
    curl -X POST http://127.0.0.1:8787/api/resolve/open \
      -H "Content-Type: application/json" \
      -d '{"project":"P1-Public-Accountability","media_rel_paths":["ingest/originals/demo.mp4"],"mode":"import"}'

The in-memory job queue is intentionally simple for LAN use. A polling
Resolve-side agent should claim jobs via `/api/resolve/jobs/next`, then mark
completion or failure using the corresponding endpoints.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.storage.paths import project_path, validate_project_name
from app.storage.sources import Source, SourceRegistry

router = APIRouter(prefix="/api/resolve", tags=["resolve"])


class ResolveOpenReq(BaseModel):
    project: str = Field(
        ..., description="Existing project name, or __new__, or __select__ to defer"
    )
    new_project_name: str | None = Field(
        None, description="Optional when creating a new project on the Resolve host"
    )
    media_rel_paths: List[str] = Field(default_factory=list)
    mode: str = Field("import", description="import | reveal")


@dataclass
class ResolveJob:
    id: str
    created_at: float
    status: str
    project: str
    new_project_name: str | None
    media_rel_paths: List[str]
    mode: str
    source: str
    claimed_by: str | None = None
    claimed_at: float | None = None
    done_at: float | None = None
    failed_at: float | None = None
    error: str | None = None


_RESOLVE_JOBS: List[ResolveJob] = []


def _reset_job_queue() -> None:
    """Reset the Resolve job queue (primarily for tests)."""

    _RESOLVE_JOBS.clear()


_ALLOWED_MODES = {"import", "reveal_in_explorer", "reveal"}


def _require_source(source: str | None) -> Source:
    settings = get_settings()
    registry = SourceRegistry(settings.project_root, settings.sources_parent_root)
    try:
        resolved = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if resolved.mode != "project":
        raise HTTPException(status_code=400, detail="Selected source is not a project source")
    return resolved


def _validate_relpath(rel: str) -> Path:
    relp = Path(rel)
    if relp.is_absolute() or ".." in relp.parts:
        raise HTTPException(status_code=400, detail=f"Invalid rel path: {rel}")
    return relp


@router.post("/open")
def resolve_open(req: ResolveOpenReq, source: str | None = None):
    """Queue a Resolve job for the Resolve host agent to claim and execute."""

    if not req.media_rel_paths:
        raise HTTPException(status_code=400, detail="media_rel_paths is required")
    if req.mode not in _ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="mode must be import or reveal")

    active_source = _require_source(source)

    project = req.project
    if project not in {"__new__", "__select__"}:
        try:
            project = validate_project_name(project)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if project == "__new__":
        if not req.new_project_name:
            raise HTTPException(
                status_code=400,
                detail="new_project_name required when project=__new__",
            )
        try:
            validate_project_name(req.new_project_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if project not in {"__new__", "__select__"}:
        project_dir = project_path(active_source.root, project)
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail="Project not found")

        for rel in req.media_rel_paths:
            relp = _validate_relpath(rel)
            absp = (project_dir / relp).resolve()
            if not str(absp).startswith(str(project_dir.resolve())):
                raise HTTPException(
                    status_code=400, detail=f"Path escapes project: {rel}"
                )
            if not absp.exists():
                raise HTTPException(status_code=404, detail=f"Missing file: {rel}")
    else:
        for rel in req.media_rel_paths:
            _validate_relpath(rel)

    job = ResolveJob(
        id=str(uuid.uuid4()),
        created_at=time.time(),
        status="pending",
        project=project,
        new_project_name=req.new_project_name,
        media_rel_paths=req.media_rel_paths,
        mode="reveal_in_explorer" if req.mode == "reveal" else req.mode,
        source=active_source.name,
    )
    _RESOLVE_JOBS.append(job)
    return {
        "ok": True,
        "job_id": job.id,
        "instructions": "resolve-agent should poll /api/resolve/jobs/next to claim jobs.",
    }


@router.post("/jobs/next")
def resolve_jobs_next(limit: int = 1, claimed_by: str = "resolve-agent"):
    """Claim the next pending Resolve jobs for execution on the host."""

    picked: List[ResolveJob] = []
    for job in _RESOLVE_JOBS:
        if job.status == "pending":
            job.status = "claimed"
            job.claimed_by = claimed_by
            job.claimed_at = time.time()
            picked.append(job)
            if len(picked) >= limit:
                break
    return {"jobs": [job.__dict__ for job in picked]}


@router.post("/jobs/{job_id}/complete")
def resolve_job_complete(job_id: str):
    """Mark a claimed job as complete after Resolve import succeeds."""

    for job in _RESOLVE_JOBS:
        if job.id == job_id:
            job.status = "done"
            job.done_at = time.time()
            return {"ok": True}
    raise HTTPException(status_code=404, detail="job not found")


@router.post("/jobs/{job_id}/fail")
def resolve_job_fail(job_id: str, error: str):
    """Mark a claimed job as failed and store the error for debugging."""

    for job in _RESOLVE_JOBS:
        if job.id == job_id:
            job.status = "failed"
            job.error = error
            job.failed_at = time.time()
            return {"ok": True}
    raise HTTPException(status_code=404, detail="job not found")
