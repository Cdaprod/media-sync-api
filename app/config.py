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

from pydantic import BaseModel, Field, ConfigDict


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
    port: int = Field(default_factory=lambda: int(os.getenv("MEDIA_SYNC_PORT", os.getenv("PORT", "8787"))))
    max_upload_mb: int = Field(default_factory=lambda: int(os.getenv("MEDIA_SYNC_MAX_UPLOAD_MB", "512")))
    cors_origins: List[str] = Field(
        default_factory=lambda: _parse_origins(os.getenv("MEDIA_SYNC_CORS_ORIGINS", ""))
    )
    auto_reindex_enabled: bool = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_AUTO_REINDEX", "1") not in {"0", "false", "False"}
    )
    auto_reindex_interval_seconds: int = Field(
        default_factory=lambda: int(os.getenv("MEDIA_SYNC_AUTO_REINDEX_INTERVAL_SECONDS", "60"))
    )
    temp_root: Path = Field(default_factory=lambda: Path(os.getenv("MEDIA_SYNC_TEMP_ROOT", "/tmp/media-sync-api")))
    cache_root: Path = Field(
        default_factory=lambda: Path(
            os.getenv(
                "MEDIA_SYNC_CACHE_ROOT",
                str((Path(os.getenv("MEDIA_SYNC_PROJECTS_ROOT", "/data/projects")) / ".runtime" / "cache")),
            )
        )
    )
    spool_root: Path = Field(
        default_factory=lambda: Path(
            os.getenv(
                "MEDIA_SYNC_SPOOL_ROOT",
                str((Path(os.getenv("MEDIA_SYNC_PROJECTS_ROOT", "/data/projects")) / ".runtime" / "spool")),
            )
        )
    )
    logs_root: Path = Field(
        default_factory=lambda: Path(
            os.getenv(
                "MEDIA_SYNC_LOGS_ROOT",
                str((Path(os.getenv("MEDIA_SYNC_PROJECTS_ROOT", "/data/projects")) / ".runtime" / "logs")),
            )
        )
    )
    runtime_role: str = Field(default_factory=lambda: os.getenv("APP_RUNTIME_ROLE", "authority"))
    instance_name: str | None = Field(default_factory=lambda: os.getenv("APP_INSTANCE_NAME"))
    node_id: str | None = Field(default_factory=lambda: os.getenv("MEDIA_SYNC_NODE_ID"))
    node_label: str | None = Field(default_factory=lambda: os.getenv("MEDIA_SYNC_NODE_LABEL"))
    node_base_url: str | None = Field(default_factory=lambda: os.getenv("MEDIA_SYNC_NODE_BASE_URL"))
    control_plane_url: str | None = Field(default_factory=lambda: os.getenv("MEDIA_SYNC_CONTROL_PLANE_URL"))
    upstream_token: str | None = Field(default_factory=lambda: os.getenv("MEDIA_SYNC_UPSTREAM_TOKEN"))
    runner_register_enabled: bool = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_RUNNER_REGISTER_ENABLED", "0").strip().lower()
        in {"1", "true", "yes", "on"}
    )
    local_watch_enabled: bool = Field(
        default_factory=lambda: os.getenv("MEDIA_SYNC_LOCAL_WATCH_ENABLED", "0").strip().lower()
        in {"1", "true", "yes", "on"}
    )

def ensure_project_root(path: Path) -> None:
    """Ensure the configured project root exists and is a directory."""

    path.mkdir(parents=True, exist_ok=True)


def ensure_temp_root(path: Path) -> None:
    """Ensure the temp staging root exists and is a directory."""

    path.mkdir(parents=True, exist_ok=True)


def ensure_runtime_roots(*paths: Path) -> None:
    """Ensure runtime-owned directories exist for cache/spool/logs."""

    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings loaded from environment variables."""

    settings = Settings()
    ensure_project_root(settings.project_root)
    ensure_temp_root(settings.temp_root)
    ensure_runtime_roots(settings.cache_root, settings.spool_root, settings.logs_root)
    return settings


def reset_settings_cache() -> None:
    """Clear cached settings (useful for tests when environment changes)."""

    get_settings.cache_clear()
