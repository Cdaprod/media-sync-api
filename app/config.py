"""Application configuration helpers for media-sync-api.

Usage:
    from app.config import settings
    print(settings.project_root)
"""

from __future__ import annotations

import os
from pathlib import Path
from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Strongly-typed settings loaded from environment variables."""

    project_root: Path = Field(default_factory=lambda: Path(os.getenv("PROJECT_ROOT", "/data/projects")))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8787")))

    class Config:
        frozen = True


def ensure_project_root(path: Path) -> None:
    """Ensure the configured project root exists and is a directory."""

    path.mkdir(parents=True, exist_ok=True)


settings = Settings()
ensure_project_root(settings.project_root)
