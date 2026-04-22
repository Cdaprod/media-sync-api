"""Node registry for runtime control-plane records.

Example:
    registry = NodeRegistry(Path('/data/projects'))
    record = registry.upsert(NodeRecord(node_id='node-a', label='Node A', base_url='http://127.0.0.1:8787'))
    print(record.node_id)
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")

NodeStatus = Literal["unknown", "healthy", "degraded", "offline"]


def validate_node_id(node_id: str) -> str:
    """Validate node identifier safety for persisted registry keys."""

    if not node_id:
        raise ValueError("Node id cannot be empty")
    if not NODE_ID_PATTERN.fullmatch(node_id):
        raise ValueError("Node id may only contain letters, numbers, dots, underscores, and hyphens")
    if ".." in node_id or "/" in node_id or "\\" in node_id:
        raise ValueError("Node id cannot contain path traversal characters")
    return node_id


class NodeRecord(BaseModel):
    """Persisted metadata for a known runtime node."""

    model_config = ConfigDict(frozen=True)

    node_id: str
    label: str
    base_url: str
    roles: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    source_name: str | None = None
    enabled: bool = True
    status: NodeStatus = "unknown"
    version: str | None = None
    advertised_source_kinds: list[str] = Field(default_factory=list)
    ephemeral: bool = False
    last_heartbeat_at: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate(self) -> "NodeRecord":
        validate_node_id(self.node_id)
        if not self.label.strip():
            raise ValueError("label cannot be empty")
        if not self.base_url.strip():
            raise ValueError("base_url cannot be empty")
        return self

    def with_heartbeat(self) -> "NodeRecord":
        return self.model_copy(update={"last_heartbeat_at": datetime.now(timezone.utc).isoformat()})


class NodeRegistry:
    """File-backed registry of runtime nodes under <root>/_runtime/nodes.json."""

    def __init__(self, data_root: Path):
        self.data_root = Path(data_root).expanduser().resolve()
        self.registry_dir = self.data_root / "_runtime"
        self.registry_path = self.registry_dir / "nodes.json"
        self.registry_dir.mkdir(parents=True, exist_ok=True)

    def _load(self) -> list[NodeRecord]:
        if not self.registry_path.exists():
            return []
        try:
            payload = json.loads(self.registry_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []

        records: list[NodeRecord] = []
        if not isinstance(payload, list):
            return records
        for item in payload:
            try:
                records.append(NodeRecord(**item))
            except ValidationError:
                continue
        return records

    def _save(self, records: Iterable[NodeRecord]) -> None:
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        payload = [record.model_dump(mode="json") for record in records]
        self.registry_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    def list_all(self) -> list[NodeRecord]:
        return self._load()

    def get(self, node_id: str) -> NodeRecord | None:
        validated = validate_node_id(node_id)
        for record in self._load():
            if record.node_id == validated:
                return record
        return None

    def require(self, node_id: str) -> NodeRecord:
        record = self.get(node_id)
        if record is None:
            raise ValueError(f"Node '{node_id}' not found")
        return record

    def upsert(self, record: NodeRecord) -> NodeRecord:
        items = [item for item in self._load() if item.node_id != record.node_id]
        items.append(record)
        self._save(items)
        return record

    def heartbeat(self, node_id: str) -> NodeRecord:
        current = self.require(node_id)
        return self.upsert(current.with_heartbeat())

    def remove(self, node_id: str) -> bool:
        validated = validate_node_id(node_id)
        current = self._load()
        next_items = [item for item in current if item.node_id != validated]
        changed = len(next_items) != len(current)
        if changed:
            self._save(next_items)
        return changed
