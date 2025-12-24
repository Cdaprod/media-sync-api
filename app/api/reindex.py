"""Reindex endpoints for reconciling filesystem state.

Example calls:
    curl http://localhost:8787/api/projects/demo/reindex
    curl http://localhost:8787/reindex
"""

from __future__ import annotations

import logging

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.ai_tagging import enqueue_ai_tagging
from app.config import get_settings
from app.storage.index import seed_index
from app.storage.paths import ensure_subdirs
from app.storage.paths import project_path, validate_project_name
from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry

router = APIRouter(prefix="/api/projects", tags=["reindex"])
all_router = APIRouter(tags=["reindex"])


logger = logging.getLogger("media_sync_api.reindex")


@router.api_route("/{project_name}/reindex", methods=["GET", "POST"])
async def reindex(
    project_name: str,
    background_tasks: BackgroundTasks,
    source: str | None = None,
    auto_tag: bool | None = None,
):
    try:
        name = validate_project_name(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        active_source = registry.require(source)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not active_source.accessible:
        raise HTTPException(status_code=503, detail="Source root is not reachable")
    project = project_path(active_source.root, name)
    if not project.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    if not (project / "index.json").exists():
        raise HTTPException(status_code=404, detail="Project index missing")
    result = reindex_project(project)
    ai_queued = 0
    if background_tasks and settings.ai_tagging_enabled:
        should_auto_tag = settings.ai_tagging_auto if auto_tag is None else auto_tag
        if should_auto_tag:
            for entry in result.get("files", []):
                rel_path = entry.get("relative_path")
                if isinstance(rel_path, str):
                    if enqueue_ai_tagging(background_tasks, project, name, rel_path, active_source.name):
                        ai_queued += 1
    if ai_queued:
        result["ai_tagging_queued"] = ai_queued
    result["instructions"] = "Use this after manual file moves; see /public/index.html for workflow steps."
    logger.info(
        "project_reindexed",
        extra={
            "project": name,
            "source": active_source.name,
            **{k: result.get(k) for k in ("indexed", "removed")},
        },
    )
    return result


def _seed_if_missing(project_dir: Path) -> None:
    ensure_subdirs(project_dir, ["ingest/originals", "_manifest"])
    if not (project_dir / "index.json").exists():
        seed_index(project_dir, project_dir.name)


@all_router.api_route("/reindex", methods=["GET", "POST"])
async def reindex_all(source: str | None = None):
    """Reindex every accessible project across enabled sources."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    try:
        sources = [registry.require(source)] if source else registry.list_enabled()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    total_projects = 0
    total_indexed = 0
    total_removed = 0
    source_summaries = []

    for src in sources:
        summary = {
            "source": src.name,
            "root": str(src.root),
            "accessible": src.accessible,
            "projects": [],
        }
        if not src.accessible:
            summary["error"] = "Source root is not reachable"
            source_summaries.append(summary)
            continue

        for project_dir in sorted(src.root.iterdir()):
            if not project_dir.is_dir():
                continue
            try:
                validated_name = validate_project_name(project_dir.name)
            except ValueError:
                logger.warning(
                    "skip_invalid_project_dir",
                    extra={"source": src.name, "path": str(project_dir)},
                )
                continue
            _seed_if_missing(project_dir)
            result = reindex_project(project_dir)
            total_projects += 1
            total_indexed += result.get("indexed", 0)
            total_removed += result.get("removed", 0)
            summary["projects"].append(
                {
                    "name": validated_name,
                    **result,
                }
            )
            logger.info(
                "project_reindexed_bulk",
                extra={
                    "project": validated_name,
                    "source": src.name,
                    **{k: result.get(k) for k in ("indexed", "removed")},
                },
            )

        source_summaries.append(summary)

    logger.info(
        "root_reindex_complete",
        extra={
            "sources": len(sources),
            "projects": total_projects,
            "indexed": total_indexed,
            "removed": total_removed,
        },
    )
    return {
        "sources": source_summaries,
        "indexed_projects": total_projects,
        "indexed_files": total_indexed,
        "removed_missing": total_removed,
        "instructions": "Use this to reconcile all sources after manual moves; see /public/index.html for per-project reindex controls.",
    }
