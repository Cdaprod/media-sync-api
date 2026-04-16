"""Aggregate library snapshot service for Explorer clients.

Example:
    from app.services.library_service import build_library_snapshot
    payload = build_library_snapshot()
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.api.projects import _bootstrap_existing_projects
from app.config import get_settings
from app.storage.index import load_index
from app.storage.paths import is_temporary_path, is_thumbnail_path
from app.storage.sources import SourceRegistry


def _build_stream_url(project: str, relative_path: str, source: str) -> str:
    source_query = f"?source={quote(source)}" if source else ""
    return f"/media/{quote(project)}/{quote(relative_path)}{source_query}"


def _build_download_url(project: str, relative_path: str, source: str) -> str:
    source_query = f"&source={quote(source)}" if source else ""
    return (
        f"/api/projects/{quote(project)}/media/file"
        f"?path={quote(relative_path)}{source_query}"
    )


def _build_thumbnail_url(project: str, sha256: str, source: str) -> str:
    source_query = f"?source={quote(source)}" if source else ""
    return f"/thumbnails/{quote(project)}/{quote(sha256)}.jpg{source_query}"


def _as_iso_utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _source_payload(source) -> dict[str, Any]:
    return {
        "name": source.name,
        "root": str(source.root),
        "type": source.type,
        "enabled": source.enabled,
        "accessible": source.accessible,
        "instructions": f"Use ?source={source.name} on project endpoints to target this root.",
    }


def build_library_snapshot(source_name: str | None = None, scope: str = "all") -> dict[str, Any]:
    """Assemble a full Explorer snapshot from sources/projects/index files."""

    settings = get_settings()
    registry = SourceRegistry(settings.project_root)
    if scope != "all":
        raise ValueError("scope must be 'all'")

    sources = [registry.require(source_name)] if source_name else registry.list_enabled()
    source_rows: list[dict[str, Any]] = []
    project_rows: list[dict[str, Any]] = []
    asset_rows: list[dict[str, Any]] = []
    for source in sources:
        source_rows.append(_source_payload(source))
        if not source.accessible:
            continue
        _bootstrap_existing_projects(source.root)
        for project_dir in sorted(source.root.iterdir(), key=lambda item: item.name):
            if not project_dir.is_dir() or project_dir.name.startswith("_"):
                continue
            index_exists = (project_dir / "index.json").exists()
            project_rows.append(
                {
                    "name": project_dir.name,
                    "source": source.name,
                    "source_accessible": source.accessible,
                    "index_exists": index_exists,
                    "upload_url": f"/api/projects/{project_dir.name}/upload?source={source.name}",
                    "instructions": "Uploads land in ingest/originals; use /public/index.html for the adapter UI.",
                }
            )
            if not index_exists:
                continue
            index = load_index(project_dir)
            for entry in index.get("files", []):
                relative_path = entry.get("relative_path")
                if not isinstance(relative_path, str):
                    continue
                relative_obj = Path(relative_path)
                if is_thumbnail_path(relative_obj) or is_temporary_path(relative_obj):
                    continue
                item = dict(entry)
                item["project_name"] = project_dir.name
                item["project_source"] = source.name
                item["source"] = source.name
                item["stream_url"] = _build_stream_url(project_dir.name, relative_path, source.name)
                item["download_url"] = _build_download_url(project_dir.name, relative_path, source.name)
                sha256 = item.get("sha256")
                if isinstance(sha256, str):
                    thumb_url = _build_thumbnail_url(project_dir.name, sha256, source.name)
                    item["thumb_url"] = thumb_url
                    item["thumbnail_url"] = thumb_url
                asset_rows.append(item)

    return {
        "generated_at": _as_iso_utc_now(),
        "scope": scope,
        "sources": sorted(source_rows, key=lambda item: item["name"]),
        "projects": sorted(project_rows, key=lambda item: (item["source"], item["name"])),
        "assets": sorted(asset_rows, key=lambda item: (str(item.get("project_name", "")), str(item.get("relative_path", "")))),
        "jobs": [],
    }
