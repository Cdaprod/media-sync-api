"""Virtual bucket discovery and persistence.

Example:
    store = BucketStore(Path("/data/projects/_sources/buckets.sqlite"))
    buckets = store.discover("library", Path("/mnt/media-sources/library"))
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from app.storage.reindex import ALLOWED_MEDIA_EXTENSIONS


@dataclass(frozen=True)
class Bucket:
    bucket_id: str
    source_name: str
    bucket_rel_root: str
    title: str
    stats: dict
    pinned: bool = False


def bucket_id_for(source_name: str, bucket_rel_root: str) -> str:
    base = f"{source_name}:{bucket_rel_root}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


class BucketStore:
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
                    CREATE TABLE IF NOT EXISTS buckets (
                        bucket_id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        bucket_rel_root TEXT NOT NULL,
                        title TEXT NOT NULL,
                        stats_json TEXT NOT NULL,
                        pinned INTEGER NOT NULL DEFAULT 0
                    );

                    CREATE INDEX IF NOT EXISTS idx_buckets_source ON buckets(source_name);
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def list_buckets(self, source_name: str) -> list[Bucket]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT bucket_id, source_name, bucket_rel_root, title, stats_json, pinned
                    FROM buckets
                    WHERE source_name=?
                    ORDER BY title
                    """,
                    (source_name,),
                ).fetchall()
                return [
                    Bucket(
                        bucket_id=row["bucket_id"],
                        source_name=row["source_name"],
                        bucket_rel_root=row["bucket_rel_root"],
                        title=row["title"],
                        stats=json.loads(row["stats_json"]),
                        pinned=bool(row["pinned"]),
                    )
                    for row in rows
                ]
            finally:
                conn.close()

    def get_bucket(self, bucket_id: str) -> Bucket | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT bucket_id, source_name, bucket_rel_root, title, stats_json, pinned
                    FROM buckets
                    WHERE bucket_id=?
                    """,
                    (bucket_id,),
                ).fetchone()
                if not row:
                    return None
                return Bucket(
                    bucket_id=row["bucket_id"],
                    source_name=row["source_name"],
                    bucket_rel_root=row["bucket_rel_root"],
                    title=row["title"],
                    stats=json.loads(row["stats_json"]),
                    pinned=bool(row["pinned"]),
                )
            finally:
                conn.close()

    def discover(self, source_name: str, source_root: Path) -> list[Bucket]:
        candidates = _collect_candidates(source_root)
        buckets = _collapse_candidates(candidates)
        buckets = [
            Bucket(
                bucket_id=bucket_id_for(source_name, bucket.bucket_rel_root),
                source_name=source_name,
                bucket_rel_root=bucket.bucket_rel_root,
                title=bucket.title,
                stats=bucket.stats,
                pinned=bucket.pinned,
            )
            for bucket in buckets
        ]
        with self._lock:
            conn = self._connect()
            try:
                existing = conn.execute(
                    "SELECT bucket_rel_root, pinned FROM buckets WHERE source_name=?",
                    (source_name,),
                ).fetchall()
                pinned_map = {row["bucket_rel_root"]: bool(row["pinned"]) for row in existing}
                conn.execute("DELETE FROM buckets WHERE source_name=?", (source_name,))
                for bucket in buckets:
                    pinned = pinned_map.get(bucket.bucket_rel_root, False)
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO buckets(
                            bucket_id, source_name, bucket_rel_root, title, stats_json, pinned
                        )
                        VALUES(?,?,?,?,?,?)
                        """,
                        (
                            bucket.bucket_id,
                            source_name,
                            bucket.bucket_rel_root,
                            bucket.title,
                            json.dumps(bucket.stats),
                            1 if pinned else 0,
                        ),
                    )
                conn.commit()
            finally:
                conn.close()
        return buckets


def _collect_candidates(source_root: Path) -> dict[str, set[str]]:
    candidates: dict[str, set[str]] = {}
    for path in source_root.rglob("*") if source_root.exists() else []:
        if not path.is_file() or path.suffix.lower() not in ALLOWED_MEDIA_EXTENSIONS:
            continue
        rel_path = path.relative_to(source_root).as_posix()
        parent = Path(rel_path).parent
        if parent == Path("."):
            parent_parts: Iterable[Path] = [Path(".")]
        else:
            parent_parts = [Path(*parent.parts[: i + 1]) for i in range(len(parent.parts))]
        for ancestor in parent_parts:
            rel_root = ancestor.as_posix()
            candidates.setdefault(rel_root, set()).add(rel_path)
    return candidates


def _collapse_candidates(candidates: dict[str, set[str]], overlap_threshold: float = 0.9) -> list[Bucket]:
    scored: list[tuple[str, set[str], dict]] = []
    for rel_root, assets in candidates.items():
        if not assets:
            continue
        depth = 0 if rel_root == "." else len(Path(rel_root).parts)
        ext_counts: dict[str, int] = {}
        for item in assets:
            ext = Path(item).suffix.lower()
            ext_counts[ext] = ext_counts.get(ext, 0) + 1
        stats = {
            "count": len(assets),
            "depth": depth,
            "extensions": ext_counts,
            "mixedness": len(ext_counts),
        }
        scored.append((rel_root, assets, stats))

    scored.sort(key=lambda item: (item[2]["depth"], item[2]["count"]), reverse=True)
    kept: list[tuple[str, set[str], dict]] = []
    for rel_root, assets, stats in scored:
        redundant = False
        for kept_root, kept_assets, _ in kept:
            overlap = len(assets & kept_assets) / min(len(assets), len(kept_assets))
            if overlap >= overlap_threshold:
                if _is_ancestor(rel_root, kept_root):
                    redundant = True
                    break
        if not redundant:
            kept.append((rel_root, assets, stats))

    buckets: list[Bucket] = []
    for rel_root, assets, stats in kept:
        title = "Root" if rel_root == "." else Path(rel_root).name
        buckets.append(
            Bucket(
                bucket_id="pending",
                source_name="pending",
                bucket_rel_root=rel_root,
                title=title,
                stats=stats,
                pinned=False,
            )
        )
    return buckets


def _is_ancestor(candidate: str, descendant: str) -> bool:
    if candidate == ".":
        return True
    candidate_path = Path(candidate)
    descendant_path = Path(descendant)
    return candidate_path == descendant_path or candidate_path in descendant_path.parents
