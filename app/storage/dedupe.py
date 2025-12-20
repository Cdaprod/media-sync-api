"""Deduplication helpers for media-sync-api.

Example:
    from app.storage.dedupe import record_file_hash
    existing = record_file_hash(db_path, sha256, rel_path)
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone


SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    sha256 TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);
"""


def ensure_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute(SCHEMA)
        conn.commit()


def record_file_hash(db_path: Path, sha256: str, relative_path: str) -> Optional[str]:
    """Record a file hash if it does not exist. Returns existing path when duplicate."""

    ensure_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT relative_path FROM files WHERE sha256 = ?", (sha256,)).fetchone()
        if row:
            return row["relative_path"]
        conn.execute(
            "INSERT INTO files (sha256, relative_path, recorded_at) VALUES (?, ?, ?)",
            (sha256, relative_path, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        return None


def compute_sha256_from_path(path: Path) -> str:
    """Compute the sha256 of a file on disk using a streaming approach."""

    hash_obj = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hash_obj.update(chunk)
    return hash_obj.hexdigest()


def get_recorded_paths(db_path: Path) -> dict[str, str]:
    """Return mapping of sha256 -> relative_path from the manifest database."""

    ensure_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT sha256, relative_path FROM files").fetchall()
    return {row["sha256"]: row["relative_path"] for row in rows}


def remove_file_record(db_path: Path, sha256: str, relative_path: str) -> None:
    """Remove a hash record if it matches the stored relative path."""

    ensure_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "DELETE FROM files WHERE sha256 = ? AND relative_path = ?",
            (sha256, relative_path),
        )
        conn.commit()
