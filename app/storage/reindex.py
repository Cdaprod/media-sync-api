"""Filesystem reconciliation helpers for projects."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List, Iterable
from datetime import datetime, timezone

from .dedupe import compute_sha256_from_path, ensure_db, record_file_hash, get_recorded_paths, remove_file_record
from .index import append_file_entry, load_index, remove_entries, update_file_entry
from .metadata import VIDEO_EXTENSIONS, ensure_metadata, remove_metadata
from .orientation import OrientationError, ffprobe_video, normalize_video_orientation_in_place
from .paths import is_thumbnail_path, is_temporary_path, relpath_posix


INGEST_DIR = "ingest/originals"
MANIFEST_DB = "_manifest/manifest.db"
ALLOWED_MEDIA_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".mp3",
    ".wav",
    ".flac",
    ".aac",
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
}


def reindex_project(project_path: Path, *, normalize_videos: bool = True) -> Dict[str, Any]:
    """Re-scan project files and ensure hashes and index entries exist.

    Args:
        project_path: Root project path to reconcile.
        normalize_videos: When true, rotated videos are normalized in place before hashing.
    """

    ingest_path = project_path / INGEST_DIR
    ingest_path.mkdir(parents=True, exist_ok=True)
    db_path = project_path / MANIFEST_DB
    ensure_db(db_path)

    existing_index = load_index(project_path)
    existing_entries = {
        entry.get("relative_path"): entry
        for entry in existing_index.get("files", [])
        if isinstance(entry.get("relative_path"), str)
    }
    sha_ref_counts: dict[str, int] = {}
    for entry in existing_entries.values():
        sha = entry.get("sha256")
        if isinstance(sha, str) and sha:
            sha_ref_counts[sha] = sha_ref_counts.get(sha, 0) + 1
    existing_paths = {entry.get("relative_path") for entry in existing_index.get("files", [])}
    relocated = _relocate_misplaced_media(project_path, ingest_path)

    new_entries: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()
    skipped_unsupported = 0
    normalized = 0
    normalization_failed = 0
    for file_path in ingest_path.rglob("*"):
        if file_path.is_dir():
            continue
        if not _is_supported_media(file_path):
            skipped_unsupported += 1
            continue
        if normalize_videos and _is_video_media(file_path):
            changed = _maybe_normalize_for_reindex(file_path)
            if changed is True:
                normalized += 1
            elif changed is False:
                normalization_failed += 1
        rel_path = relpath_posix(file_path, project_path)
        seen_paths.add(rel_path)
        sha = compute_sha256_from_path(file_path)
        duplicate = record_file_hash(db_path, sha, rel_path)
        existing_entry = existing_entries.get(rel_path)
        previous_sha = existing_entry.get("sha256") if existing_entry else None
        if existing_entry and previous_sha and previous_sha != sha:
            remove_file_record(db_path, previous_sha, rel_path)
        ensure_metadata(
            project_path,
            rel_path,
            sha,
            file_path,
            source="reindex",
            method="filesystem_scan",
        )
        if duplicate and rel_path in existing_paths:
            continue
        if rel_path in existing_paths:
            if existing_entry and previous_sha != sha:
                update_file_entry(
                    project_path,
                    rel_path,
                    {
                        "sha256": sha,
                        "size": file_path.stat().st_size,
                        "indexed_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
                if previous_sha and not _decrement_sha_refcount(sha_ref_counts, previous_sha):
                    remove_metadata(project_path, previous_sha)
            continue
        entry = {
            "relative_path": rel_path,
            "sha256": sha,
            "size": file_path.stat().st_size,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
        }
        append_file_entry(project_path, entry)
        new_entries.append(entry)

    unsupported_existing = _unsupported_entries(existing_paths)
    missing_paths = (existing_paths - seen_paths) | unsupported_existing
    if missing_paths:
        db_records = get_recorded_paths(db_path)
        for missing in missing_paths:
            matching = [entry for entry in existing_index.get("files", []) if entry.get("relative_path") == missing]
            for entry in matching:
                sha = entry.get("sha256")
                if sha and db_records.get(sha) == missing:
                    remove_file_record(db_path, sha, missing)
                if sha and not _decrement_sha_refcount(sha_ref_counts, sha):
                    remove_metadata(project_path, sha)
        remove_entries(project_path, missing_paths)

    return {
        "indexed": len(new_entries),
        "files": new_entries,
        "removed": len(missing_paths),
        "relocated": relocated,
        "skipped_unsupported": skipped_unsupported,
        "normalized": normalized,
        "normalization_failed": normalization_failed,
    }




def _decrement_sha_refcount(sha_ref_counts: dict[str, int], sha: str | None) -> bool:
    """Decrease a sha256 reference count and report whether references remain."""

    if not sha:
        return False
    updated = max(sha_ref_counts.get(sha, 0) - 1, 0)
    sha_ref_counts[sha] = updated
    return updated > 0
def _is_video_media(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def _maybe_normalize_for_reindex(file_path: Path) -> bool | None:
    """Normalize a rotated video before hashing/index writes during reindex.

    Returns:
        True when normalization changed bytes.
        False when normalization was attempted but failed.
        None when no normalization was needed.
    """

    try:
        probe = ffprobe_video(file_path)
    except OrientationError:
        return None
    if probe.rotation not in {90, 180, 270}:
        return None
    try:
        result = normalize_video_orientation_in_place(file_path, keep_backup=False)
        return True if result.changed else None
    except OrientationError:
        return False


def _relocate_misplaced_media(project_root: Path, ingest_path: Path) -> int:
    """Move supported media found outside ingest/originals into the canonical ingest tree."""

    relocated = 0
    for candidate in project_root.rglob("*"):
        if candidate.is_dir():
            continue
        if _is_manifest_path(candidate, project_root) or _is_within_ingest(candidate, ingest_path):
            continue
        if not _is_supported_media(candidate):
            continue
        relative_from_project = candidate.relative_to(project_root)
        destination = ingest_path / relative_from_project
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination = _dedupe_destination(destination)
        candidate.rename(destination)
        relocated += 1
    return relocated


def _dedupe_destination(target: Path) -> Path:
    if not target.exists():
        return target
    counter = 1
    stem = target.stem
    suffix = target.suffix
    while True:
        candidate = target.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def _is_manifest_path(path: Path, project_root: Path) -> bool:
    try:
        relative = path.relative_to(project_root)
    except ValueError:
        return False
    return relative.parts and relative.parts[0].startswith("_manifest")


def _is_within_ingest(path: Path, ingest_path: Path) -> bool:
    try:
        path.relative_to(ingest_path)
        return True
    except ValueError:
        return False


def _is_supported_media(path: Path) -> bool:
    if path.suffix.lower() not in ALLOWED_MEDIA_EXTENSIONS:
        return False
    if is_thumbnail_path(path):
        return False
    return not is_temporary_path(path)


def _unsupported_entries(existing_paths: Iterable[str | None]) -> set[str]:
    unsupported: set[str] = set()
    for rel_path in existing_paths:
        if not rel_path:
            continue
        if not _is_supported_media(Path(rel_path)):
            unsupported.add(rel_path)
    return unsupported
