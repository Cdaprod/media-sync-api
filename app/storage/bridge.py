"""Bridge staging scans and committed library roots.

Example:
    store = BridgeStore(Path("/data/projects/_sources/bridge.sqlite"))
    tree = stage_scan_tree(Path("/mnt/media-sources/nas"), max_depth=4, min_files=1)
    scan_id = store.create_scan("nas", tree)
    scan = store.get_scan(scan_id, ttl_minutes=60)
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Sequence

from app.storage.buckets import IGNORED_DIRS, IGNORED_FILES
from app.storage.reindex import ALLOWED_MEDIA_EXTENSIONS


@dataclass(frozen=True)
class LibraryRoot:
    root_id: str
    source_name: str
    rel_root: str
    stats: dict
    selected_at: str


@dataclass(frozen=True)
class StageScan:
    scan_id: str
    source_name: str
    created_at: str
    tree: dict


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _root_id(source_name: str, rel_root: str) -> str:
    return f"{source_name}::{rel_root}"


class BridgeStore:
    """Persist bridge staging scans and committed library roots."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path.as_posix(), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS stage_scans (
                        scan_id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        tree_json TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS library_roots (
                        root_id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        rel_root TEXT NOT NULL,
                        stats_json TEXT NOT NULL,
                        selected_at TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_library_roots_source ON library_roots(source_name);
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def create_scan(self, source_name: str, tree: dict) -> str:
        scan_id = str(uuid.uuid4())
        created_at = _utc_now()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO stage_scans(scan_id, source_name, created_at, tree_json)
                    VALUES(?,?,?,?)
                    """,
                    (scan_id, source_name, created_at, json.dumps(tree)),
                )
                conn.commit()
            finally:
                conn.close()
        return scan_id

    def get_scan(self, scan_id: str, ttl_minutes: int) -> StageScan | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT scan_id, source_name, created_at, tree_json FROM stage_scans WHERE scan_id=?",
                    (scan_id,),
                ).fetchone()
                if not row:
                    return None
                created_at = _parse_time(row["created_at"])
                if ttl_minutes > 0 and datetime.now(timezone.utc) - created_at > timedelta(minutes=ttl_minutes):
                    conn.execute("DELETE FROM stage_scans WHERE scan_id=?", (scan_id,))
                    conn.commit()
                    return None
                return StageScan(
                    scan_id=row["scan_id"],
                    source_name=row["source_name"],
                    created_at=row["created_at"],
                    tree=json.loads(row["tree_json"]),
                )
            finally:
                conn.close()

    def delete_scan(self, scan_id: str) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM stage_scans WHERE scan_id=?", (scan_id,))
                conn.commit()
            finally:
                conn.close()

    def replace_library_roots(self, source_name: str, roots: Iterable[LibraryRoot]) -> list[LibraryRoot]:
        selected_at = _utc_now()
        normalized: list[LibraryRoot] = [
            LibraryRoot(
                root_id=_root_id(source_name, root.rel_root),
                source_name=source_name,
                rel_root=root.rel_root,
                stats=root.stats,
                selected_at=selected_at,
            )
            for root in roots
        ]
        with self._lock:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM library_roots WHERE source_name=?", (source_name,))
                for root in normalized:
                    conn.execute(
                        """
                        INSERT INTO library_roots(root_id, source_name, rel_root, stats_json, selected_at)
                        VALUES(?,?,?,?,?)
                        """,
                        (
                            root.root_id,
                            root.source_name,
                            root.rel_root,
                            json.dumps(root.stats),
                            root.selected_at,
                        ),
                    )
                conn.commit()
            finally:
                conn.close()
        return normalized

    def list_library_roots(self, source_name: str) -> list[LibraryRoot]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT root_id, source_name, rel_root, stats_json, selected_at
                    FROM library_roots
                    WHERE source_name=?
                    ORDER BY rel_root
                    """,
                    (source_name,),
                ).fetchall()
                return [
                    LibraryRoot(
                        root_id=row["root_id"],
                        source_name=row["source_name"],
                        rel_root=row["rel_root"],
                        stats=json.loads(row["stats_json"]),
                        selected_at=row["selected_at"],
                    )
                    for row in rows
                ]
            finally:
                conn.close()


def stage_scan_tree(
    source_root: Path,
    *,
    max_depth: int = 6,
    min_files: int = 1,
) -> dict:
    """Scan a library root and return a tree of candidate directories."""

    max_depth = max(0, int(max_depth))
    min_files = max(1, int(min_files))

    def scan_dir(path: Path, rel_path: str, depth: int) -> dict | None:
        if depth > max_depth and max_depth > 0:
            return None
        if path.name.lower() in IGNORED_DIRS:
            return None

        direct_media = 0
        media_kinds: set[str] = set()
        children: list[dict] = []

        try:
            entries = list(path.iterdir())
        except OSError:
            entries = []

        for entry in entries:
            if entry.is_dir():
                if entry.name.lower() in IGNORED_DIRS:
                    continue
                child_rel = f"{rel_path}/{entry.name}" if rel_path else entry.name
                child = scan_dir(entry, child_rel, depth + 1)
                if child:
                    children.append(child)
            elif entry.is_file():
                if entry.name.lower() in IGNORED_FILES:
                    continue
                suffix = entry.suffix.lower()
                if suffix not in ALLOWED_MEDIA_EXTENSIONS:
                    continue
                direct_media += 1
                media_kinds.add(_kind_for_suffix(suffix))

        descendant_media = direct_media + sum(child["descendant_media_count"] for child in children)
        descendant_kinds: set[str] = set(media_kinds)
        for child in children:
            descendant_kinds.update(child.get("media_kinds", []))
        kinds_list = sorted(k for k in descendant_kinds if k)
        mixed = len(kinds_list) > 1
        score = _score_node(descendant_media, depth, mixed, min_files)
        suggested = descendant_media >= min_files and depth > 0 and not mixed

        return {
            "path": rel_path or ".",
            "depth": depth,
            "direct_media_count": direct_media,
            "descendant_media_count": descendant_media,
            "media_kinds": kinds_list,
            "mixed": mixed,
            "score": score,
            "suggested": suggested,
            "children": children,
        }

    tree = scan_dir(source_root, "", 0)
    return tree or {
        "path": ".",
        "depth": 0,
        "direct_media_count": 0,
        "descendant_media_count": 0,
        "media_kinds": [],
        "mixed": False,
        "score": 0.0,
        "suggested": False,
        "children": [],
    }


def _kind_for_suffix(suffix: str) -> str:
    if suffix in {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}:
        return "video"
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}:
        return "image"
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac"}:
        return "audio"
    return "document"


def _score_node(descendant_media: int, depth: int, mixed: bool, min_files: int) -> float:
    baseline = descendant_media / max(1, min_files * 10)
    score = min(1.0, baseline)
    if mixed:
        score *= 0.7
    if depth <= 1:
        score *= 0.85
    return round(score, 3)


def collect_scan_paths(tree: dict) -> set[str]:
    paths: set[str] = set()

    def walk(node: dict) -> None:
        path = node.get("path")
        if isinstance(path, str):
            paths.add(path)
        for child in node.get("children", []) or []:
            walk(child)

    walk(tree)
    return paths


def index_scan_tree(tree: dict) -> dict[str, dict]:
    index: dict[str, dict] = {}

    def walk(node: dict) -> None:
        path = node.get("path")
        if isinstance(path, str):
            index[path] = node
        for child in node.get("children", []) or []:
            walk(child)

    walk(tree)
    return index
