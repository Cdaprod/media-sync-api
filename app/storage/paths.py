"""Path helpers for safe project resolution.

Example:
    from app.storage.paths import validate_project_name, project_path
    safe_path = project_path(Path('/data/projects'), 'demo')
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

PROJECT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
PROJECT_SEQUENCE_PATTERN = re.compile(r"^P(?P<num>\d+)-(?P<label>.+)$")
CAPTURE_SEGMENT_PATTERN = re.compile(r"^[a-z0-9_-]+$")
CAPTURE_FILENAME_PATTERN = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_(?P<hostnode>[^_]+)_(?P<role>[^_]+)(?:_(?P<seq>\d+))?$"
)

CAPTURE_SCHEMA_VERSION = "p1_hostapp_device_v1"


def validate_project_name(name: str) -> str:
    """Validate that a project name is safe for filesystem usage."""

    if not name:
        raise ValueError("Project name cannot be empty")
    if not PROJECT_NAME_PATTERN.fullmatch(name):
        raise ValueError("Project name may only contain letters, numbers, dots, underscores, and hyphens")
    if ".." in name or "/" in name or "\\" in name:
        raise ValueError("Project name cannot contain path traversal characters")
    return name


def _slugify_label(label: str | None) -> str:
    cleaned = (label or "Project").strip()
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", cleaned)
    cleaned = cleaned.strip("-") or "Project"
    return cleaned


def next_project_sequence(root: Path) -> int:
    """Return the next available project sequence number based on P{n}- prefixes."""

    highest = 0
    if root.exists():
        for path in root.iterdir():
            if not path.is_dir():
                continue
            match = PROJECT_SEQUENCE_PATTERN.match(path.name)
            if match:
                highest = max(highest, int(match.group("num")))
    return highest + 1


def sequenced_project_name(root: Path, label: str | None = None) -> str:
    """Generate a project name using the P{n}-<label> convention idempotently."""

    suffix = _slugify_label(label)
    seq = next_project_sequence(root)
    candidate = f"P{seq}-{suffix}"
    while (root / candidate).exists():
        seq += 1
        candidate = f"P{seq}-{suffix}"
    return validate_project_name(candidate)


def project_path(root: Path, name: str) -> Path:
    """Return the absolute project path for a validated project name."""

    validated = validate_project_name(name)
    return (root / validated).resolve()


def ensure_subdirs(base: Path, subdirs: Iterable[str]) -> None:
    """Create expected subdirectories inside a project path idempotently."""

    for subdir in subdirs:
        target = base / subdir
        target.mkdir(parents=True, exist_ok=True)


def relpath_posix(target: Path, base: Path) -> str:
    """Return POSIX-style relative path between two locations."""

    return target.relative_to(base).as_posix()


def safe_filename(name: str) -> str:
    """Strip path separators to keep filenames within expected folder."""

    if "/" in name or "\\" in name:
        raise ValueError("Filename cannot contain path separators")
    if ".." in name:
        raise ValueError("Filename cannot include traversal sequences")
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Filename cannot be empty")
    return cleaned


def validate_relative_path(relative_path: str) -> str:
    """Ensure a path stays relative and traversal-safe."""

    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("Relative path cannot be absolute")
    if ".." in path.parts:
        raise ValueError("Relative path cannot traverse directories")
    cleaned = path.as_posix().lstrip("/")
    if not cleaned:
        raise ValueError("Relative path cannot be empty")
    return cleaned


def derive_ingest_metadata(relative_path: str) -> dict[str, object]:
    """Derive capture metadata from canonical ingest/originals paths."""

    metadata: dict[str, object] = {
        "schema_version": "legacy",
        "ingest_tier": "unknown",
        "host_app": "unknown",
        "device_id": "unknown",
        "date": None,
        "ts": None,
        "hostnode": None,
        "role": None,
        "seq": None,
    }
    path = Path(relative_path)
    parts = path.parts
    if len(parts) >= 2 and parts[0] == "ingest" and parts[1] == "originals":
        metadata["ingest_tier"] = "originals"
    if len(parts) < 8:
        return metadata
    if parts[0] != "ingest" or parts[1] != "originals":
        return metadata

    host_app, device_id, year, month, day = parts[2], parts[3], parts[4], parts[5], parts[6]
    if not _valid_date_parts(year, month, day):
        return metadata
    if not CAPTURE_SEGMENT_PATTERN.fullmatch(host_app) or not CAPTURE_SEGMENT_PATTERN.fullmatch(device_id):
        return metadata

    metadata.update(
        {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "host_app": host_app,
            "device_id": device_id,
            "date": f"{year}-{month}-{day}",
            "ingest_tier": "originals",
        }
    )

    filename_match = CAPTURE_FILENAME_PATTERN.match(path.stem)
    if filename_match:
        metadata["ts"] = filename_match.group("ts")
        metadata["hostnode"] = filename_match.group("hostnode")
        metadata["role"] = filename_match.group("role")
        seq = filename_match.group("seq")
        metadata["seq"] = int(seq) if seq is not None else None
    return metadata


def _valid_date_parts(year: str, month: str, day: str) -> bool:
    if len(year) != 4 or len(month) != 2 or len(day) != 2:
        return False
    if not (year.isdigit() and month.isdigit() and day.isdigit()):
        return False
    month_num = int(month)
    day_num = int(day)
    return 1 <= month_num <= 12 and 1 <= day_num <= 31
