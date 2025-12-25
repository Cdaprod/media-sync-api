"""SQLite-backed tag storage for media assets.

Example:
    store = TagStore(Path("/data/projects/_tags/tags.sqlite"))
    asset_id = asset_id_for_project("primary", "P1-Demo", "ingest/originals/clip.mov")
    store.add_asset_tags(asset_id, ["b-roll", "interview"])
    print(store.get_asset_tags(asset_id))
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_tag(tag: str) -> str:
    t = (tag or "").strip().lower()
    t = re.sub(r"\s+", "-", t)
    t = re.sub(r"[^a-z0-9._:-]+", "", t)
    return t


def asset_id_for_source_relpath(source: str, rel_path: str) -> str:
    """Return a stable asset id based on source name + source-relative path."""

    base = f"{source}:{rel_path}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def asset_id_for_project(source: str, project: str, relative_path: str) -> str:
    rel_path = (Path(project) / relative_path).as_posix()
    return asset_id_for_source_relpath(source, rel_path)


def _asset_id_from_legacy_key(legacy_key: str) -> str | None:
    parts = legacy_key.split("::", 2)
    if len(parts) != 3:
        return None
    source, project, rel_path = parts
    if not source or not project or not rel_path:
        return None
    return asset_id_for_project(source, project, rel_path)


@dataclass(frozen=True)
class TagMeta:
    tag: str
    color: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class TagRun:
    asset_id: str
    status: str
    updated_at: str
    source: str
    started_at: str | None = None
    completed_at: str | None = None
    model: str | None = None
    error: str | None = None


class TagStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path.as_posix(), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                self._migrate_legacy_tables(conn)
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS asset_tags (
                        asset_id TEXT NOT NULL,
                        tag TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        source TEXT NOT NULL DEFAULT 'user',
                        PRIMARY KEY (asset_id, tag)
                    );

                    CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);
                    CREATE INDEX IF NOT EXISTS idx_asset_tags_asset ON asset_tags(asset_id);

                    CREATE TABLE IF NOT EXISTS tag_meta (
                        tag TEXT PRIMARY KEY,
                        color TEXT,
                        description TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS asset_tag_runs (
                        asset_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        started_at TEXT,
                        completed_at TEXT,
                        updated_at TEXT NOT NULL,
                        source TEXT NOT NULL,
                        model TEXT,
                        error TEXT
                    );
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def _table_has_column(self, conn: sqlite3.Connection, table: str, column: str) -> bool:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return any(row[1] == column for row in rows)

    def _table_exists(self, conn: sqlite3.Connection, table: str) -> bool:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        return row is not None

    def _migrate_legacy_tables(self, conn: sqlite3.Connection) -> None:
        if self._table_exists(conn, "asset_tags") and self._table_has_column(conn, "asset_tags", "asset_key"):
            conn.execute("ALTER TABLE asset_tags RENAME TO asset_tags_legacy")
            conn.execute(
                """
                CREATE TABLE asset_tags (
                    asset_id TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'user',
                    PRIMARY KEY (asset_id, tag)
                );
                """
            )
            rows = conn.execute(
                "SELECT asset_key, tag, created_at, source FROM asset_tags_legacy"
            ).fetchall()
            for row in rows:
                asset_id = _asset_id_from_legacy_key(row["asset_key"])
                if not asset_id:
                    continue
                conn.execute(
                    """
                    INSERT OR IGNORE INTO asset_tags(asset_id, tag, created_at, source)
                    VALUES(?,?,?,?)
                    """,
                    (asset_id, row["tag"], row["created_at"], row["source"]),
                )
            conn.execute("DROP TABLE asset_tags_legacy")

        if self._table_exists(conn, "asset_tag_runs") and self._table_has_column(conn, "asset_tag_runs", "asset_key"):
            conn.execute("ALTER TABLE asset_tag_runs RENAME TO asset_tag_runs_legacy")
            conn.execute(
                """
                CREATE TABLE asset_tag_runs (
                    asset_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    updated_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    model TEXT,
                    error TEXT
                );
                """
            )
            rows = conn.execute(
                """
                SELECT asset_key, status, started_at, completed_at, updated_at, source, model, error
                FROM asset_tag_runs_legacy
                """
            ).fetchall()
            for row in rows:
                asset_id = _asset_id_from_legacy_key(row["asset_key"])
                if not asset_id:
                    continue
                conn.execute(
                    """
                    INSERT OR REPLACE INTO asset_tag_runs(
                        asset_id, status, started_at, completed_at, updated_at, source, model, error
                    )
                    VALUES(?,?,?,?,?,?,?,?)
                    """,
                    (
                        asset_id,
                        row["status"],
                        row["started_at"],
                        row["completed_at"],
                        row["updated_at"],
                        row["source"],
                        row["model"],
                        row["error"],
                    ),
                )
            conn.execute("DROP TABLE asset_tag_runs_legacy")

    def upsert_tag_meta(self, meta: TagMeta) -> TagMeta:
        t = normalize_tag(meta.tag)
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO tag_meta(tag, color, description, created_at, updated_at)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(tag) DO UPDATE SET
                        color=COALESCE(excluded.color, tag_meta.color),
                        description=COALESCE(excluded.description, tag_meta.description),
                        updated_at=excluded.updated_at
                    """,
                    (t, meta.color, meta.description, now, now),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT tag, color, description FROM tag_meta WHERE tag=?",
                    (t,),
                ).fetchone()
                return TagMeta(tag=row["tag"], color=row["color"], description=row["description"])
            finally:
                conn.close()

    def get_tag_meta(self, tag: str) -> Optional[TagMeta]:
        t = normalize_tag(tag)
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT tag, color, description FROM tag_meta WHERE tag=?",
                    (t,),
                ).fetchone()
                if not row:
                    return None
                return TagMeta(tag=row["tag"], color=row["color"], description=row["description"])
            finally:
                conn.close()

    def list_tags(self, q: str | None = None, limit: int = 200) -> list[TagMeta]:
        qn = normalize_tag(q) if q else None
        with self._lock:
            conn = self._connect()
            try:
                if qn:
                    rows = conn.execute(
                        """
                        SELECT tag, color, description
                        FROM tag_meta
                        WHERE tag LIKE ?
                        ORDER BY tag
                        LIMIT ?
                        """,
                        (f"%{qn}%", limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT tag, color, description
                        FROM tag_meta
                        ORDER BY tag
                        LIMIT ?
                        """,
                        (limit,),
                    ).fetchall()
                return [TagMeta(tag=r["tag"], color=r["color"], description=r["description"]) for r in rows]
            finally:
                conn.close()

    def get_asset_tags(self, asset_id: str) -> list[str]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT tag FROM asset_tags WHERE asset_id=? ORDER BY tag",
                    (asset_id,),
                ).fetchall()
                return [r["tag"] for r in rows]
            finally:
                conn.close()

    def add_asset_tags(self, asset_id: str, tags: Iterable[str], source: str = "user") -> list[str]:
        norm = [normalize_tag(t) for t in tags]
        norm = [t for t in norm if t]
        now = _utc_now()
        if not norm:
            return self.get_asset_tags(asset_id)

        with self._lock:
            conn = self._connect()
            try:
                for t in norm:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO asset_tags(asset_id, tag, created_at, source)
                        VALUES(?,?,?,?)
                        """,
                        (asset_id, t, now, source),
                    )
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO tag_meta(tag, color, description, created_at, updated_at)
                        VALUES(?,?,?,?,?)
                        """,
                        (t, None, None, now, now),
                    )
                conn.commit()
            finally:
                conn.close()
        return self.get_asset_tags(asset_id)

    def remove_asset_tags(self, asset_id: str, tags: Iterable[str]) -> list[str]:
        norm = [normalize_tag(t) for t in tags]
        norm = [t for t in norm if t]
        if not norm:
            return self.get_asset_tags(asset_id)

        with self._lock:
            conn = self._connect()
            try:
                conn.executemany(
                    "DELETE FROM asset_tags WHERE asset_id=? AND tag=?",
                    [(asset_id, t) for t in norm],
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_asset_tags(asset_id)

    def batch_get_asset_tags(self, asset_ids: list[str]) -> dict[str, list[str]]:
        if not asset_ids:
            return {}

        with self._lock:
            conn = self._connect()
            try:
                out: dict[str, list[str]] = {k: [] for k in asset_ids}
                chunk = 400
                for i in range(0, len(asset_ids), chunk):
                    keys = asset_ids[i : i + chunk]
                    placeholders = ",".join(["?"] * len(keys))
                    rows = conn.execute(
                        f"""
                        SELECT asset_id, tag
                        FROM asset_tags
                        WHERE asset_id IN ({placeholders})
                        ORDER BY asset_id, tag
                        """,
                        keys,
                    ).fetchall()
                    for row in rows:
                        out[row["asset_id"]].append(row["tag"])
                return out
            finally:
                conn.close()

    def batch_get_asset_tag_counts(self, asset_ids: list[str]) -> dict[str, dict[str, int]]:
        if not asset_ids:
            return {}

        with self._lock:
            conn = self._connect()
            try:
                out: dict[str, dict[str, int]] = {k: {} for k in asset_ids}
                chunk = 400
                for i in range(0, len(asset_ids), chunk):
                    keys = asset_ids[i : i + chunk]
                    placeholders = ",".join(["?"] * len(keys))
                    rows = conn.execute(
                        f"""
                        SELECT asset_id, source, COUNT(*) as count
                        FROM asset_tags
                        WHERE asset_id IN ({placeholders})
                        GROUP BY asset_id, source
                        """,
                        keys,
                    ).fetchall()
                    for row in rows:
                        counts = out.setdefault(row["asset_id"], {})
                        counts[row["source"]] = int(row["count"])
                return out
            finally:
                conn.close()

    def get_asset_tag_counts(self, asset_id: str) -> dict[str, int]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT source, COUNT(*) as count
                    FROM asset_tags
                    WHERE asset_id=?
                    GROUP BY source
                    """,
                    (asset_id,),
                ).fetchall()
                return {row["source"]: int(row["count"]) for row in rows}
            finally:
                conn.close()

    def start_asset_tag_run(self, asset_id: str, source: str, model: str | None = None) -> TagRun:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO asset_tag_runs(
                        asset_id, status, started_at, completed_at, updated_at, source, model, error
                    )
                    VALUES(?,?,?,?,?,?,?,?)
                    ON CONFLICT(asset_id) DO UPDATE SET
                        status=excluded.status,
                        started_at=excluded.started_at,
                        completed_at=NULL,
                        updated_at=excluded.updated_at,
                        source=excluded.source,
                        model=COALESCE(excluded.model, asset_tag_runs.model),
                        error=NULL
                    """,
                    (asset_id, "running", now, None, now, source, model, None),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_asset_tag_run(asset_id) or TagRun(
            asset_id=asset_id,
            status="running",
            updated_at=now,
            started_at=now,
            completed_at=None,
            source=source,
            model=model,
            error=None,
        )

    def finish_asset_tag_run(self, asset_id: str, status: str, error: str | None = None) -> TagRun:
        now = _utc_now()
        completed = now if status in {"complete", "failed"} else None
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE asset_tag_runs
                    SET status=?, updated_at=?, completed_at=?, error=?
                    WHERE asset_id=?
                    """,
                    (status, now, completed, error, asset_id),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_asset_tag_run(asset_id) or TagRun(
            asset_id=asset_id,
            status=status,
            updated_at=now,
            started_at=None,
            completed_at=completed,
            source="ai",
            model=None,
            error=error,
        )

    def get_asset_tag_run(self, asset_id: str) -> Optional[TagRun]:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT asset_id, status, started_at, completed_at, updated_at, source, model, error
                    FROM asset_tag_runs
                    WHERE asset_id=?
                    """,
                    (asset_id,),
                ).fetchone()
                if not row:
                    return None
                return TagRun(
                    asset_id=row["asset_id"],
                    status=row["status"],
                    updated_at=row["updated_at"],
                    source=row["source"],
                    started_at=row["started_at"],
                    completed_at=row["completed_at"],
                    model=row["model"],
                    error=row["error"],
                )
            finally:
                conn.close()
