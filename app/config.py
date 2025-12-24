"""Application configuration helpers for media-sync-api.

Usage:
    from app.config import get_settings
    settings = get_settings()
    print(settings.project_root)
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

from pydantic import BaseModel, ConfigDict, Field


def _parse_origins(raw: str | None) -> List[str]:
    if not raw:
        return []
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseModel):
    """Strongly-typed settings loaded from environment variables."""

    model_config = ConfigDict(frozen=True)

    project_root: Path = Field(default_factory=lambda: Path(
        os.getenv("MEDIA_SYNC_PROJECTS_ROOT")
        or os.getenv("PROJECT_ROOT", "/data/projects")
    ))
    sources_parent_root: Path = Field(
        default_factory=lambda: Path(os.getenv("MEDIA_SYNC_SOURCES_PARENT_ROOT", "/mnt/media-sources"))
    )
    cache_root: Path = Field(
        default_factory=lambda: Path(os.getenv("MEDIA_SYNC_CACHE_ROOT", "/app/storage/cache"))
    )
    port: int = Field(default_factory=lambda: int(os.getenv("MEDIA_SYNC_PORT", os.getenv("PORT", "8787"))))
    max_upload_mb: int = Field(default_factory=lambda: int(os.getenv("MEDIA_SYNC_MAX_UPLOAD_MB", "512")))
    cors_origins: List[str] = Field(
        default_factory=lambda: _parse_origins(os.getenv("MEDIA_SYNC_CORS_ORIGINS", ""))
    )
    ai_tagging_enabled: bool = Field(
        default_factory=lambda: _parse_bool(os.getenv("MEDIA_SYNC_AI_TAGGING_ENABLED"), default=False)
    )
    ai_tagging_auto: bool = Field(
        default_factory=lambda: _parse_bool(os.getenv("MEDIA_SYNC_AI_TAGGING_AUTO"), default=False)
    )
    ai_tagging_timeout_s: float = Field(
        default_factory=lambda: float(os.getenv("MEDIA_SYNC_AI_TAGGING_TIMEOUT_S", "180"))
    )
    ai_tagging_max_tags: int = Field(
        default_factory=lambda: int(os.getenv("MEDIA_SYNC_AI_TAGGING_MAX_TAGS", "12"))
    )
    ai_tagging_source: str = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_AI_TAGGING_SOURCE", "ai")
    )
    ai_tagging_language: str | None = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_AI_TAGGING_LANGUAGE")
    )
    ai_whisperx_url: str | None = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_WHISPERX_URL")
    )
    ai_deim_url: str | None = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_DEIM_URL")
    )

def ensure_project_root(path: Path) -> None:
    """Ensure the configured project root exists and is a directory."""

    path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings loaded from environment variables."""

    settings = Settings()
    ensure_project_root(settings.project_root)
    settings.cache_root.mkdir(parents=True, exist_ok=True)
    return settings


def reset_settings_cache() -> None:
    """Clear cached settings (useful for tests when environment changes)."""

    get_settings.cache_clear()
