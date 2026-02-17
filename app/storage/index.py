"""Index helpers for reading and writing project manifests.

Example:
    index = load_index(project_path)
    index['files'].append(entry)
    save_index(project_path, index)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List


INDEX_FILENAME = "index.json"
DEFAULT_COUNTS = {"videos": 0, "duplicates_skipped": 0, "removed_missing_records": 0}
EVENTS_PATH = "_manifest/events.jsonl"


def index_file_path(project_path: Path) -> Path:
    return project_path / INDEX_FILENAME


def _ensure_counts(index: Dict[str, Any]) -> Dict[str, Any]:
    counts = index.get("counts", {}) or {}
    for key, value in DEFAULT_COUNTS.items():
        counts.setdefault(key, value)
    index["counts"] = counts
    return index


def bump_count(index: Dict[str, Any], key: str, amount: int = 1) -> None:
    counts = _ensure_counts(index).get("counts", {})
    counts[key] = max(0, counts.get(key, 0) + amount)
    index["counts"] = counts


def load_index(project_path: Path) -> Dict[str, Any]:
    path = index_file_path(project_path)
    if not path.exists():
        raise FileNotFoundError(f"Missing index for project at {project_path}")
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return _ensure_counts(data)


def save_index(project_path: Path, index: Dict[str, Any]) -> None:
    target = index_file_path(project_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, sort_keys=True)


def seed_index(project_path: Path, project_name: str, notes: str | None = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    data: Dict[str, Any] = {
        "project": project_name,
        "notes": notes or "",
        "created_at": now,
        "files": [],
        "counts": DEFAULT_COUNTS.copy(),
    }
    save_index(project_path, data)
    return data


def append_file_entry(project_path: Path, entry: Dict[str, Any]) -> Dict[str, Any]:
    index = load_index(project_path)
    files: List[Dict[str, Any]] = index.get("files", [])
    files.append(entry)
    index["files"] = files
    bump_count(index, "videos", amount=1)
    save_index(project_path, index)
    return index


def remove_entries(project_path: Path, relative_paths: Iterable[str]) -> Dict[str, Any]:
    index = load_index(project_path)
    paths_to_remove = set(relative_paths)
    files: List[Dict[str, Any]] = [
        entry for entry in index.get("files", []) if entry.get("relative_path") not in paths_to_remove
    ]
    removed = len(index.get("files", [])) - len(files)
    index["files"] = files
    if removed:
        bump_count(index, "videos", amount=-removed)
        bump_count(index, "removed_missing_records", amount=removed)
    save_index(project_path, index)
    return index


def update_file_entry(project_path: Path, relative_path: str, updates: Dict[str, Any]) -> Dict[str, Any] | None:
    """Update a single index entry matching relative_path with provided fields."""

    index = load_index(project_path)
    entries: List[Dict[str, Any]] = index.get("files", [])
    for entry in entries:
        if entry.get("relative_path") == relative_path:
            entry.update(updates)
            save_index(project_path, index)
            return entry
    return None


def append_event(project_path: Path, event: str, payload: Dict[str, Any]) -> None:
    events_path = project_path / EVENTS_PATH
    events_path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "payload": payload,
    }
    with events_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
