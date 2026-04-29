"""Node registry for runtime control-plane records.

Example:
    registry = NodeRegistry(Path('/data/projects'))
    record = registry.upsert(NodeRecord(node_id='node-a', label='Node A', base_url='http://127.0.0.1:8787'))
    print(record.node_id)
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")

NodeStatus = Literal["unknown", "healthy", "degraded", "online", "offline"]


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
    base_url: str | None = None
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
    token_hash: str | None = None
    token_preview: str | None = None
    auth_type: str | None = None
    auth_scopes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate(self) -> "NodeRecord":
        validate_node_id(self.node_id)
        if not self.label.strip():
            raise ValueError("label cannot be empty")
        normalized_base_url = (self.base_url or "").strip()
        metadata = self.metadata or {}
        transport_hint = str(metadata.get("transport_hint", "")).strip().lower()
        session_node = str(metadata.get("session_node", "")).strip().lower() == "true"
        browser_push = str(metadata.get("browser_push", "")).strip().lower() == "true"
        allows_missing_base = transport_hint in {"session", "browser", "webrtc"} or session_node or browser_push

        if normalized_base_url:
            return self
        if not allows_missing_base:
            raise ValueError("base_url cannot be empty for non-session nodes")
        return self

    def with_heartbeat(self) -> "NodeRecord":
        return self.model_copy(update={"last_heartbeat_at": datetime.now(timezone.utc).isoformat()})


def public_node_record_dict(record: "NodeRecord") -> dict[str, object]:
    """Serialize a node record for API/UI surfaces without secret token material."""

    payload = record.model_dump(mode="json")
    payload.pop("token_hash", None)
    return payload


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

    def get_node(self, node_id: str) -> NodeRecord | None:
        normalized = (node_id or "").strip()
        if not normalized:
            return None
        try:
            return self.get(normalized)
        except ValueError:
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

    def delete_node(self, node_id: str) -> bool:
        normalized = (node_id or "").strip()
        if not normalized:
            return False
        try:
            return self.remove(normalized)
        except ValueError:
            return False

    def prune_ephemeral_nodes(self, *, older_than_seconds: int) -> list[str]:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(0, int(older_than_seconds)))
        current = self._load()
        kept: list[NodeRecord] = []
        removed: list[str] = []

        for node in current:
            if not node.ephemeral:
                kept.append(node)
                continue
            if not node.last_heartbeat_at:
                kept.append(node)
                continue
            try:
                parsed = datetime.fromisoformat(node.last_heartbeat_at.replace("Z", "+00:00"))
            except ValueError:
                kept.append(node)
                continue
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            if parsed < cutoff:
                removed.append(node.node_id)
                continue
            kept.append(node)

        if len(kept) != len(current):
            self._save(kept)
        return removed

    def remove(self, node_id: str) -> bool:
        validated = validate_node_id(node_id)
        current = self._load()
        next_items = [item for item in current if item.node_id != validated]
        changed = len(next_items) != len(current)
        if changed:
            self._save(next_items)
        return changed
