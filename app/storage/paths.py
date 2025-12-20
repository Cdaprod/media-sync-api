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


def validate_project_name(name: str) -> str:
    """Validate that a project name is safe for filesystem usage."""

    if not name:
        raise ValueError("Project name cannot be empty")
    if not PROJECT_NAME_PATTERN.fullmatch(name):
        raise ValueError("Project name may only contain letters, numbers, dots, underscores, and hyphens")
    if ".." in name or "/" in name or "\\" in name:
        raise ValueError("Project name cannot contain path traversal characters")
    return name


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

    cleaned = name.split("/")[-1].split("\\")[-1]
    if not cleaned:
        raise ValueError("Filename cannot be empty")
    return cleaned
