"""Filesystem reconciliation helpers for projects."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List, Iterable
from datetime import datetime, timezone

from .dedupe import compute_sha256_from_path, ensure_db, record_file_hash, get_recorded_paths, remove_file_record
from .index import bump_count, load_index, save_index
from .paths import relpath_posix, derive_ingest_metadata


INGEST_DIR = "ingest/originals"
MANIFEST_DB = "_manifest/manifest.db"
ALLOWED_MEDIA_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".m4v",
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".aac",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
}


def reindex_project(project_path: Path) -> Dict[str, Any]:
    """Re-scan project files and ensure hashes and index entries exist."""

    ingest_path = project_path / INGEST_DIR
    ingest_path.mkdir(parents=True, exist_ok=True)
    db_path = project_path / MANIFEST_DB
    ensure_db(db_path)

    existing_index = load_index(project_path)
    existing_entries = existing_index.get("files", [])
    existing_paths = {entry.get("relative_path") for entry in existing_entries if entry.get("relative_path")}
    entries_by_path = {entry.get("relative_path"): entry for entry in existing_entries if entry.get("relative_path")}
    relocated = _relocate_misplaced_media(project_path, ingest_path)

    new_entries: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()
    skipped_unsupported = 0
    updated_entries = False
    for file_path in ingest_path.rglob("*"):
        if file_path.is_dir():
            continue
        if not _is_supported_media(file_path):
            skipped_unsupported += 1
            continue
        rel_path = relpath_posix(file_path, project_path)
        seen_paths.add(rel_path)
        metadata = derive_ingest_metadata(rel_path)
        sha = compute_sha256_from_path(file_path)
        duplicate = record_file_hash(db_path, sha, rel_path)
        existing_entry = entries_by_path.get(rel_path)
        if existing_entry is not None:
            if _merge_entry_metadata(existing_entry, metadata):
                updated_entries = True
            continue
        if duplicate and rel_path in existing_paths:
            continue
        if rel_path in existing_paths:
            continue
        entry = {
            "relative_path": rel_path,
            "sha256": sha,
            "size": file_path.stat().st_size,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
        }
        entry.update(metadata)
        existing_entries.append(entry)
        entries_by_path[rel_path] = entry
        existing_paths.add(rel_path)
        bump_count(existing_index, "videos", amount=1)
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
        remaining = [entry for entry in existing_entries if entry.get("relative_path") not in missing_paths]
        removed = len(existing_entries) - len(remaining)
        if removed:
            existing_index["files"] = remaining
            bump_count(existing_index, "videos", amount=-removed)
            bump_count(existing_index, "removed_missing_records", amount=removed)
        existing_entries = remaining
        entries_by_path = {entry.get("relative_path"): entry for entry in existing_entries if entry.get("relative_path")}
        save_index(project_path, existing_index)

    if new_entries or updated_entries:
        existing_index["files"] = existing_entries
        save_index(project_path, existing_index)

    return {
        "indexed": len(new_entries),
        "files": new_entries,
        "removed": len(missing_paths),
        "relocated": relocated,
        "skipped_unsupported": skipped_unsupported,
    }


def _merge_entry_metadata(entry: Dict[str, Any], metadata: Dict[str, Any]) -> bool:
    updated = False
    for key, value in metadata.items():
        if entry.get(key) != value:
            entry[key] = value
            updated = True
    return updated


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
    return path.suffix.lower() in ALLOWED_MEDIA_EXTENSIONS


def _unsupported_entries(existing_paths: Iterable[str | None]) -> set[str]:
    unsupported: set[str] = set()
    for rel_path in existing_paths:
        if not rel_path:
            continue
        if not _is_supported_media(Path(rel_path)):
            unsupported.add(rel_path)
    return unsupported
