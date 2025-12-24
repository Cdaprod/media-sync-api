"""Source registry helpers with schema validation and atomic persistence.

Example:
    registry = SourceRegistry(Path("/data/projects"), Path("/mnt/media-sources"))
    registry.upsert(name="nas", root=Path("/mnt/media-sources/raid"), mode="library", read_only=True)
    for source in registry.list_all():
        print(source.name, source.mode, source.root)
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Iterable, List

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


SOURCE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def normalize_source_name(name: str) -> str:
    """Normalize a source name to lowercase and trim whitespace."""

    cleaned = (name or "").strip().lower()
    if not cleaned:
        raise ValueError("Source name cannot be empty")
    if not SOURCE_NAME_PATTERN.fullmatch(cleaned):
        raise ValueError("Source name may only contain letters, numbers, dots, underscores, and hyphens")
    if ".." in cleaned or "/" in cleaned or "\\" in cleaned:
        raise ValueError("Source name cannot contain path traversal characters")
    return cleaned


def validate_source_name(name: str) -> str:
    """Validate a source name and return the normalized value."""

    return normalize_source_name(name)


class SourceCapabilities(BaseModel):
    """Capabilities supported by a given source."""

    browse: bool = True
    tags: bool = True
    ai_tags: bool = True
    derive: bool = True


class Source(BaseModel):
    """Represent a media storage source for projects or libraries."""

    model_config = ConfigDict(frozen=True, json_encoders={Path: str})

    name: str = Field(description="Logical identifier for the source")
    root: Path = Field(description="Absolute path to the storage root for this source")
    type: str = Field(default="local", description="Source type hint (e.g., local, smb, nfs)")
    enabled: bool = Field(default=True, description="Whether the source should be used for lookups and indexing")
    mode: str = Field(default="project", description="project or library")
    read_only: bool = Field(default=False, description="Whether the source is read-only")
    capabilities: SourceCapabilities = Field(default_factory=SourceCapabilities)
    id_strategy: str = Field(default="sha256_source_relpath", description="Asset ID strategy")

    @model_validator(mode="after")
    def _validate(self) -> "Source":
        normalized = validate_source_name(self.name)
        object.__setattr__(self, "name", normalized)
        if not str(self.root):
            raise ValueError("Source root cannot be empty")
        resolved = Path(self.root).expanduser().resolve()
        object.__setattr__(self, "root", resolved)
        if self.mode not in {"project", "library"}:
            raise ValueError("Source mode must be 'project' or 'library'")
        return self

    @property
    def accessible(self) -> bool:
        """Return True if the source root is reachable on disk."""

        return Path(self.root).exists()


class SourceRegistry:
    """Persist and retrieve sources for the API."""

    def __init__(self, default_root: Path, sources_parent_root: Path):
        self.default_root = Path(default_root).expanduser().resolve()
        self.sources_parent_root = Path(sources_parent_root).expanduser().resolve()
        self.registry_dir = self.default_root / "_sources"
        self.registry_path = self.registry_dir / "index.json"
        self.registry_dir.mkdir(parents=True, exist_ok=True)

    def default_source(self) -> Source:
        return Source(
            name="primary",
            root=self.default_root,
            type="local",
            enabled=True,
            mode="project",
            read_only=False,
        )

    def _load_sources(self) -> List[Source]:
        if not self.registry_path.exists():
            return [self.default_source()]
        try:
            data = json.loads(self.registry_path.read_text())
        except json.JSONDecodeError:
            return [self.default_source()]
        sources: dict[str, Source] = {}
        for entry in data if isinstance(data, list) else []:
            try:
                source = Source(**entry)
            except ValidationError:
                continue
            sources[source.name] = self._normalize_source(source)
        if "primary" not in sources:
            sources["primary"] = self.default_source()
        else:
            sources["primary"] = self.default_source()
        return list(sources.values())

    def _save_sources(self, sources: Iterable[Source]) -> None:
        serializable = [source.model_dump(mode="json") for source in sources]
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        self._atomic_write_json(self.registry_path, serializable)

    def _atomic_write_json(self, path: Path, payload: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=path.name, dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, path)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)

    def _normalize_source(self, source: Source) -> Source:
        if source.name == "primary":
            return self.default_source()
        return source

    def _ensure_library_root(self, root: Path) -> None:
        if not self.sources_parent_root:
            raise ValueError("Sources parent root is not configured")
        parent = self.sources_parent_root.resolve()
        target = Path(root).expanduser().resolve()
        try:
            target.relative_to(parent)
        except ValueError as exc:
            raise ValueError("Library sources must live under the configured parent root") from exc

    def list_all(self) -> List[Source]:
        sources = self._load_sources()
        self._save_sources(sources)
        return sources

    def list_enabled(self) -> List[Source]:
        return [source for source in self.list_all() if source.enabled]

    def require(self, name: str | None, *, include_disabled: bool = False) -> Source:
        """Return a source by name, optionally allowing disabled entries."""

        validated = validate_source_name(name) if name else "primary"
        for source in self.list_all():
            if source.name == validated:
                if not include_disabled and not source.enabled:
                    raise ValueError(f"Source '{validated}' is disabled")
                return source
        raise ValueError(f"Source '{validated}' not found")

    def upsert(
        self,
        *,
        name: str,
        root: Path,
        type: str = "local",
        enabled: bool = True,
        mode: str = "project",
        read_only: bool = False,
        capabilities: SourceCapabilities | None = None,
        id_strategy: str = "sha256_source_relpath",
    ) -> Source:
        validated_name = validate_source_name(name)
        if validated_name == "primary":
            candidate = self.default_source()
        else:
            if mode == "library":
                if not read_only:
                    raise ValueError("Library sources must be read-only")
                self._ensure_library_root(root)
            candidate = Source(
                name=validated_name,
                root=root,
                type=type,
                enabled=enabled,
                mode=mode,
                read_only=read_only,
                capabilities=capabilities or SourceCapabilities(),
                id_strategy=id_strategy,
            )
        sources = self.list_all()
        filtered = [source for source in sources if source.name != validated_name]
        filtered.append(candidate)
        self._save_sources(filtered)
        return candidate

    def remove(self, name: str) -> None:
        validated_name = validate_source_name(name)
        if validated_name == "primary":
            raise ValueError("Primary source cannot be removed")
        sources = [source for source in self.list_all() if source.name != validated_name]
        self._save_sources(sources)
