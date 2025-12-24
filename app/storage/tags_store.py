"""SQLite-backed tag storage for media assets.

Example:
    store = TagStore(Path("/data/projects/_tags/tags.sqlite"))
    key = asset_key(project="P1-Demo", relative_path="ingest/originals/clip.mov")
    store.add_asset_tags(key, ["b-roll", "interview"])
    print(store.get_asset_tags(key))
"""

from __future__ import annotations

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
    t = re.sub(r"[^a-z0-9._-]+", "", t)
    return t


def asset_key(project: str, relative_path: str, source: Optional[str] = None) -> str:
    s = (source or "primary").strip() or "primary"
    return f"{s}::{project}::{relative_path}"


@dataclass(frozen=True)
class TagMeta:
    tag: str
    color: str | None = None
    description: str | None = None


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
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS asset_tags (
                        asset_key TEXT NOT NULL,
                        tag TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        source TEXT NOT NULL DEFAULT 'user',
                        PRIMARY KEY (asset_key, tag)
                    );

                    CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);
                    CREATE INDEX IF NOT EXISTS idx_asset_tags_asset ON asset_tags(asset_key);

                    CREATE TABLE IF NOT EXISTS tag_meta (
                        tag TEXT PRIMARY KEY,
                        color TEXT,
                        description TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )
                conn.commit()
            finally:
                conn.close()

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

    def get_asset_tags(self, akey: str) -> list[str]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT tag FROM asset_tags WHERE asset_key=? ORDER BY tag",
                    (akey,),
                ).fetchall()
                return [r["tag"] for r in rows]
            finally:
                conn.close()

    def add_asset_tags(self, akey: str, tags: Iterable[str], source: str = "user") -> list[str]:
        norm = [normalize_tag(t) for t in tags]
        norm = [t for t in norm if t]
        now = _utc_now()
        if not norm:
            return self.get_asset_tags(akey)

        with self._lock:
            conn = self._connect()
            try:
                for t in norm:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO asset_tags(asset_key, tag, created_at, source)
                        VALUES(?,?,?,?)
                        """,
                        (akey, t, now, source),
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
        return self.get_asset_tags(akey)

    def remove_asset_tags(self, akey: str, tags: Iterable[str]) -> list[str]:
        norm = [normalize_tag(t) for t in tags]
        norm = [t for t in norm if t]
        if not norm:
            return self.get_asset_tags(akey)

        with self._lock:
            conn = self._connect()
            try:
                conn.executemany(
                    "DELETE FROM asset_tags WHERE asset_key=? AND tag=?",
                    [(akey, t) for t in norm],
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_asset_tags(akey)

    def batch_get_asset_tags(self, asset_keys: list[str]) -> dict[str, list[str]]:
        if not asset_keys:
            return {}

        with self._lock:
            conn = self._connect()
            try:
                out: dict[str, list[str]] = {k: [] for k in asset_keys}
                chunk = 400
                for i in range(0, len(asset_keys), chunk):
                    keys = asset_keys[i : i + chunk]
                    placeholders = ",".join(["?"] * len(keys))
                    rows = conn.execute(
                        f"""
                        SELECT asset_key, tag
                        FROM asset_tags
                        WHERE asset_key IN ({placeholders})
                        ORDER BY asset_key, tag
                        """,
                        keys,
                    ).fetchall()
                    for row in rows:
                        out[row["asset_key"]].append(row["tag"])
                return out
            finally:
                conn.close()
