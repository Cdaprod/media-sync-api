"""AI tagging pipeline using local WhisperX + DEIM services.

Usage:
    from app.ai_tagging import tag_asset
    result = tag_asset(project_dir, "P1-Demo", "ingest/originals/clip.mov", "primary")
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, Tuple

import httpx

from app.config import get_settings
from app.storage.index import append_event
from app.storage.paths import validate_relative_path
from app.storage.tags_store import TagMeta, TagStore, asset_key, normalize_tag


logger = logging.getLogger("media_sync_api.ai_tagging")

AUDIO_VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".mp3",
    ".wav",
    ".flac",
    ".aac",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic"}


class AITaggingError(RuntimeError):
    """Raised when AI tagging is unavailable or misconfigured."""


def create_http_client(timeout_s: float) -> httpx.Client:
    """Create an HTTP client for local AI services."""

    return httpx.Client(timeout=timeout_s)


def _resolve_asset_path(project_dir: Path, relative_path: str) -> Path:
    safe_rel = validate_relative_path(relative_path)
    target = (project_dir / safe_rel).resolve()
    project_root = project_dir.resolve()
    if project_root not in target.parents and target != project_root:
        raise ValueError("Requested path is outside the project")
    return target


def _requires_transcript(path: Path) -> bool:
    return path.suffix.lower() in AUDIO_VIDEO_EXTENSIONS


def _is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


def _normalize_tags(tags: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for tag in tags:
        norm = normalize_tag(tag)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        output.append(norm)
    return output


def _extract_tags(payload: dict) -> Tuple[list[str], list[TagMeta]]:
    tags: list[str] = []
    metas: list[TagMeta] = []

    def add_tag(value: str, color: str | None = None, description: str | None = None) -> None:
        norm = normalize_tag(value)
        if not norm:
            return
        tags.append(norm)
        if color or description:
            metas.append(TagMeta(tag=norm, color=color, description=description))

    for key in ("tags", "labels", "keywords"):
        for entry in payload.get(key, []) or []:
            if isinstance(entry, str):
                add_tag(entry)
            elif isinstance(entry, dict):
                label = entry.get("tag") or entry.get("label") or entry.get("name")
                if label:
                    add_tag(label, color=entry.get("color"), description=entry.get("description"))
    if "tag" in payload and isinstance(payload["tag"], str):
        add_tag(payload["tag"])
    return _normalize_tags(tags), metas


def _extract_transcript(payload: dict) -> str | None:
    for key in ("text", "transcript", "summary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _call_whisperx(client: httpx.Client, url: str, path: Path, language: str | None) -> str | None:
    payload = {"path": path.as_posix()}
    if language:
        payload["language"] = language
    response = client.post(url, json=payload)
    response.raise_for_status()
    return _extract_transcript(response.json())


def _call_deim(
    client: httpx.Client,
    url: str,
    path: Path,
    transcript: str | None,
    max_tags: int,
) -> Tuple[list[str], list[TagMeta]]:
    payload = {
        "path": path.as_posix(),
        "max_tags": max_tags,
        "transcript": transcript,
    }
    response = client.post(url, json=payload)
    response.raise_for_status()
    return _extract_tags(response.json())


def _ensure_ai_enabled() -> None:
    settings = get_settings()
    if not settings.ai_tagging_enabled:
        raise AITaggingError("AI tagging disabled; set MEDIA_SYNC_AI_TAGGING_ENABLED=1 to enable.")
    if not settings.ai_deim_url:
        raise AITaggingError("MEDIA_SYNC_DEIM_URL is required for AI tagging.")


def tag_asset(
    project_dir: Path,
    project_name: str,
    relative_path: str,
    source_name: str,
    *,
    force: bool = False,
    max_tags: int | None = None,
    language: str | None = None,
    client: httpx.Client | None = None,
) -> dict:
    """Tag a single asset by calling WhisperX and DEIM locally."""

    _ensure_ai_enabled()
    settings = get_settings()
    safe_rel = validate_relative_path(relative_path)
    target = _resolve_asset_path(project_dir, safe_rel)
    if not target.exists() or not target.is_file():
        raise FileNotFoundError("Asset not found on disk")

    if not _requires_transcript(target) and not _is_image(target):
        raise AITaggingError("Unsupported file type for AI tagging")

    store = TagStore(settings.project_root / "_tags" / "tags.sqlite")
    key = asset_key(project_name, safe_rel, source_name)
    counts = store.get_asset_tag_counts(key)
    if not force and counts.get(settings.ai_tagging_source, 0) > 0:
        existing = store.get_asset_tags(key)
        run = store.get_asset_tag_run(key)
        return {
            "status": "skipped",
            "asset_key": key,
            "tags": existing,
            "tag_source_counts": counts,
            "tag_run": run.__dict__ if run else None,
            "detail": "AI tags already present; pass force=true to recompute.",
        }

    run = store.start_asset_tag_run(key, source=settings.ai_tagging_source, model="deim+whisperx")
    transcript: str | None = None
    owned_client = client is None
    client = client or create_http_client(settings.ai_tagging_timeout_s)
    try:
        if _requires_transcript(target):
            if not settings.ai_whisperx_url:
                raise AITaggingError("MEDIA_SYNC_WHISPERX_URL required for audio/video tagging.")
            transcript = _call_whisperx(
                client,
                settings.ai_whisperx_url,
                target,
                language or settings.ai_tagging_language,
            )

        tags, metas = _call_deim(
            client,
            settings.ai_deim_url,
            target,
            transcript,
            max_tags or settings.ai_tagging_max_tags,
        )
        stored = store.add_asset_tags(key, tags, source=settings.ai_tagging_source)
        for meta in metas:
            store.upsert_tag_meta(meta)
        run = store.finish_asset_tag_run(key, "complete")
        append_event(
            project_dir,
            "ai_tagging_complete",
            {
                "relative_path": safe_rel,
                "tag_count": len(stored),
                "source": source_name,
                "tag_source": settings.ai_tagging_source,
                "model": run.model,
            },
        )
        return {
            "status": "complete",
            "asset_key": key,
            "tags": stored,
            "tag_source_counts": store.get_asset_tag_counts(key),
            "tag_run": run.__dict__,
            "transcript": transcript,
        }
    except Exception as exc:
        error = str(exc)
        run = store.finish_asset_tag_run(key, "failed", error=error)
        append_event(
            project_dir,
            "ai_tagging_failed",
            {
                "relative_path": safe_rel,
                "source": source_name,
                "tag_source": settings.ai_tagging_source,
                "error": error,
            },
        )
        logger.exception(
            "ai_tagging_failed",
            extra={
                "project": project_name,
                "relative_path": safe_rel,
                "source": source_name,
                "error": error,
            },
        )
        raise
    finally:
        if owned_client:
            client.close()


def tag_asset_safe(
    project_dir: Path,
    project_name: str,
    relative_path: str,
    source_name: str,
    *,
    force: bool = False,
    max_tags: int | None = None,
    language: str | None = None,
) -> None:
    """Run AI tagging with errors logged instead of raised."""

    try:
        tag_asset(
            project_dir,
            project_name,
            relative_path,
            source_name,
            force=force,
            max_tags=max_tags,
            language=language,
        )
    except Exception:
        return


def enqueue_ai_tagging(
    background_tasks,
    project_dir: Path,
    project_name: str,
    relative_path: str,
    source_name: str,
    *,
    force: bool = False,
    max_tags: int | None = None,
    language: str | None = None,
) -> bool:
    """Queue AI tagging for background execution when enabled."""

    try:
        _ensure_ai_enabled()
    except AITaggingError:
        return False
    background_tasks.add_task(
        tag_asset_safe,
        project_dir,
        project_name,
        relative_path,
        source_name,
        force=force,
        max_tags=max_tags,
        language=language,
    )
    return True
