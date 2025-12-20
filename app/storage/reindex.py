"""Filesystem reconciliation helpers for projects."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime, timezone

from .dedupe import compute_sha256_from_path, ensure_db, record_file_hash
from .index import append_file_entry, load_index


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
    for file_path in ingest_path.rglob("*"):
        if file_path.is_dir():
            continue
        rel_path = str(file_path.relative_to(project_path))
        sha = compute_sha256_from_path(file_path)
        duplicate = record_file_hash(db_path, sha, rel_path)
        if duplicate and rel_path in existing_paths:
            continue
        entry = {
            "relative_path": rel_path,
            "sha256": sha,
            "size": file_path.stat().st_size,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
        }
        append_file_entry(project_path, entry)
        new_entries.append(entry)
    return {"indexed": len(new_entries), "files": new_entries}
