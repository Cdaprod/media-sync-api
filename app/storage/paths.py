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
