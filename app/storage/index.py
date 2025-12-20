"""Index helpers for reading and writing project manifests.

Example:
    index = load_index(project_path)
    index['files'].append(entry)
    save_index(project_path, index)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List
from datetime import datetime, timezone


INDEX_FILENAME = "index.json"


def index_file_path(project_path: Path) -> Path:
    return project_path / INDEX_FILENAME


def load_index(project_path: Path) -> Dict[str, Any]:
    path = index_file_path(project_path)
    if not path.exists():
        raise FileNotFoundError(f"Missing index for project at {project_path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


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
    }
    save_index(project_path, data)
    return data


def append_file_entry(project_path: Path, entry: Dict[str, Any]) -> Dict[str, Any]:
    index = load_index(project_path)
    files: List[Dict[str, Any]] = index.get("files", [])
    files.append(entry)
    index["files"] = files
    save_index(project_path, index)
    return index
