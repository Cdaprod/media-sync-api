"""Source registry management for multi-root project storage.

Example:
    registry = SourceRegistry(Path("/data/projects"))
    registry.upsert(name="nas", root=Path("/mnt/nas/projects"))
    active = registry.require("nas")
    for source in registry.list_enabled():
        print(source.name, source.root)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable, List

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


SOURCE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_source_name(name: str) -> str:
    """Validate and normalize a logical source name."""

    if not name:
        raise ValueError("Source name cannot be empty")
    if not SOURCE_NAME_PATTERN.fullmatch(name):
        raise ValueError("Source name may only contain letters, numbers, dots, underscores, and hyphens")
    if ".." in name or "/" in name or "\\" in name:
        raise ValueError("Source name cannot contain path traversal characters")
    return name


class Source(BaseModel):
    """Represent a media storage source that hosts projects."""

    model_config = ConfigDict(frozen=True, json_encoders={Path: str})

    name: str = Field(description="Logical identifier for the source")
    root: Path = Field(description="Absolute path to the projects root for this source")
    type: str = Field(default="local", description="Source type hint (e.g., local, smb, nfs)")
    enabled: bool = Field(default=True, description="Whether the source should be used for lookups and indexing")

    @model_validator(mode="after")
    def _validate(self) -> "Source":
        validate_source_name(self.name)
        if not str(self.root):
            raise ValueError("Source root cannot be empty")
        resolved = Path(self.root).expanduser().resolve()
        object.__setattr__(self, "root", resolved)
        return self

    @property
    def accessible(self) -> bool:
        """Return True if the source root is reachable on disk."""

        return Path(self.root).exists()


class SourceRegistry:
    """Persist and retrieve media sources for the API."""

    def __init__(self, default_root: Path):
        self.default_root = Path(default_root).expanduser().resolve()
        self.registry_dir = self.default_root / "_sources"
        self.registry_path = self.registry_dir / "sources.json"
        self.registry_dir.mkdir(parents=True, exist_ok=True)

    def default_source(self) -> Source:
        return Source(name="primary", root=self.default_root, type="local", enabled=True)

    def _load_sources(self) -> List[Source]:
        if not self.registry_path.exists():
            return [self.default_source()]
        try:
            data = json.loads(self.registry_path.read_text())
        except json.JSONDecodeError:
            return [self.default_source()]
        sources: List[Source] = []
        for entry in data if isinstance(data, list) else []:
            try:
                sources.append(Source(**entry))
            except ValidationError:
                continue
        if not any(source.name == "primary" for source in sources):
            sources.append(self.default_source())
        return sources

    def _save_sources(self, sources: Iterable[Source]) -> None:
        serializable = [source.model_dump(mode="json") for source in sources]
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        self.registry_path.write_text(json.dumps(serializable, indent=2))

    def list_all(self) -> List[Source]:
        sources = self._load_sources()
        self._save_sources(sources)
        return sources

    def list_enabled(self) -> List[Source]:
        return [source for source in self.list_all() if source.enabled]

    def require(self, name: str | None) -> Source:
        validated = validate_source_name(name) if name else "primary"
        for source in self.list_all():
            if source.name == validated:
                if not source.enabled:
                    raise ValueError(f"Source '{validated}' is disabled")
                return source
        raise ValueError(f"Source '{validated}' not found")

    def upsert(self, *, name: str, root: Path, type: str = "local", enabled: bool = True) -> Source:
        validated_name = validate_source_name(name)
        candidate = Source(name=validated_name, root=root, type=type, enabled=enabled)
        sources = self.list_all()
        filtered = [source for source in sources if source.name != validated_name]
        if candidate.name == "primary":
            candidate = Source(name="primary", root=self.default_root, type="local", enabled=True)
        filtered.append(candidate)
        self._save_sources(filtered)
        return candidate

