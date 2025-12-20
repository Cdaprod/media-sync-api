"""Filesystem reconciliation helpers for projects."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime, timezone

from .dedupe import compute_sha256_from_path, ensure_db, record_file_hash, get_recorded_paths, remove_file_record
from .index import append_file_entry, load_index, remove_entries
from .paths import relpath_posix


INGEST_DIR = "ingest/originals"
MANIFEST_DB = "_manifest/manifest.db"


def reindex_project(project_path: Path) -> Dict[str, Any]:
    """Re-scan project files and ensure hashes and index entries exist."""

    ingest_path = project_path / INGEST_DIR
    ingest_path.mkdir(parents=True, exist_ok=True)
    db_path = project_path / MANIFEST_DB
    ensure_db(db_path)

    existing_index = load_index(project_path)
    existing_paths = {entry.get("relative_path") for entry in existing_index.get("files", [])}

    new_entries: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()
    for file_path in ingest_path.rglob("*"):
        if file_path.is_dir():
            continue
        rel_path = relpath_posix(file_path, project_path)
        seen_paths.add(rel_path)
        sha = compute_sha256_from_path(file_path)
        duplicate = record_file_hash(db_path, sha, rel_path)
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
        append_file_entry(project_path, entry)
        new_entries.append(entry)

    missing_paths = existing_paths - seen_paths
    if missing_paths:
        db_records = get_recorded_paths(db_path)
        for missing in missing_paths:
            matching = [entry for entry in existing_index.get("files", []) if entry.get("relative_path") == missing]
            for entry in matching:
                sha = entry.get("sha256")
                if sha and db_records.get(sha) == missing:
                    remove_file_record(db_path, sha, missing)
        remove_entries(project_path, missing_paths)

    return {"indexed": len(new_entries), "files": new_entries, "removed": len(missing_paths)}
