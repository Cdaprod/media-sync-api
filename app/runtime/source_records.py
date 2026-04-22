"""Typed runtime-facing source record models.

Example:
    record = build_primary_source_record(
        project_root=Path('/data/projects'),
        owner_node_id='runner-a',
        runtime_role='runner',
    )
    print(record.authority)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

SourceKind = Literal["filesystem", "capture", "proxy", "virtual"]
SourceAuthority = Literal["canonical", "runner-local", "ephemeral"]


@dataclass(slots=True)
class SourceRecord:
    """Typed runtime-facing source descriptor."""

    name: str
    root: Path | None
    kind: SourceKind = "filesystem"
    authority: SourceAuthority = "canonical"
    owner_node_id: str | None = None
    enabled: bool = True
    accessible: bool = True
    local_only: bool = False
    can_index: bool = True
    can_proxy: bool = False
    can_record: bool = False
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def is_canonical(self) -> bool:
        return self.authority == "canonical"

    @property
    def is_runner_local(self) -> bool:
        return self.authority == "runner-local"

    @property
    def is_ephemeral(self) -> bool:
        return self.authority == "ephemeral"


def build_primary_source_record(*, project_root: Path, owner_node_id: str, runtime_role: str) -> SourceRecord:
    """Return process-local primary source descriptor by role."""

    authority: SourceAuthority = "canonical" if runtime_role == "authority" else "runner-local"
    return SourceRecord(
        name="primary",
        root=project_root,
        kind="filesystem",
        authority=authority,
        owner_node_id=owner_node_id,
        enabled=True,
        accessible=True,
        local_only=(runtime_role == "runner"),
        can_index=True,
        can_proxy=(runtime_role == "runner"),
        can_record=(runtime_role == "runner"),
        metadata={"runtime_role": runtime_role},
    )
