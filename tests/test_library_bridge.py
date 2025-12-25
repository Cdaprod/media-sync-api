from __future__ import annotations

from pathlib import Path

import pytest
from app.api import bridge as bridge_api
from app.storage.bridge import stage_scan_tree
from app.storage.tags_store import asset_id_for_source_relpath


class FakeBridgeAgent:
    def __init__(self):
        self.created: list[tuple[str, str]] = []

    def health(self):
        return bridge_api.BridgeAgentStatus(ok=True, detail="ok")

    def scan_tree(self, target_path: str, max_depth=None, min_files=None, timeout: float = 30.0) -> dict:
        return stage_scan_tree(
            Path(target_path),
            max_depth=max_depth or 6,
            min_files=min_files or 1,
        )

    def create_junction(self, link_path: str, target_path: str, timeout: float = 20.0) -> None:
        self.created.append((link_path, target_path))

    def delete_junction(self, link_path: str, timeout: float = 20.0) -> None:
        return None


@pytest.fixture()
def fake_bridge_agent(monkeypatch: pytest.MonkeyPatch):
    agent = FakeBridgeAgent()
    monkeypatch.setattr(bridge_api, "get_bridge_agent", lambda settings=None: agent)
    return agent


def _stage_scan_and_commit(client, target_path: Path, junction_name: str, selected_paths: list[str]):
    scan = client.post(
        "/api/bridge/stage-scan",
        json={"target_path": str(target_path), "name_hint": junction_name},
    )
    assert scan.status_code == 200
    scan_payload = scan.json()
    commit = client.post(
        "/api/bridge/commit",
        json={
            "items": [
                {
                    "junction_name": junction_name,
                    "target_path": str(target_path),
                    "selected_paths": selected_paths,
                    "scan_id": scan_payload["scan_id"],
                }
            ]
        },
    )
    assert commit.status_code == 200
    return scan_payload, commit.json()


def test_library_media_listing_and_asset_id(client, env_settings: Path, fake_bridge_agent: FakeBridgeAgent):
    sources_root = env_settings.parent / "sources"
    bridge_target = env_settings.parent / "bridge-target"
    (bridge_target / "Sub").mkdir(parents=True, exist_ok=True)
    (bridge_target / "Sub" / "clip.mov").write_bytes(b"library-media")

    _stage_scan_and_commit(client, bridge_target, "library", ["Sub"])

    library_root = sources_root / "library" / "Sub"
    library_root.mkdir(parents=True, exist_ok=True)
    (library_root / "clip.mov").write_bytes(b"library-media")

    listing = client.get("/api/sources/library/media")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["source"] == "library"
    assert payload["media"]
    item = payload["media"][0]
    assert item["relative_path"] == "Sub/clip.mov"
    assert item["stream_url"].startswith("/media/source/library/")
    expected = asset_id_for_source_relpath("library", "Sub/clip.mov")
    assert item["asset_id"] == expected
    assert fake_bridge_agent.created


def test_bucket_discovery_and_listing(client, env_settings: Path, fake_bridge_agent: FakeBridgeAgent):
    sources_root = env_settings.parent / "sources"
    bridge_target = env_settings.parent / "bridge-target-archive"
    (bridge_target / "Events" / "2024" / "Day1").mkdir(parents=True, exist_ok=True)
    (bridge_target / "Events" / "2024" / "Day1" / "a.mov").write_bytes(b"a")
    (bridge_target / "Events" / "2024" / "Day2").mkdir(parents=True, exist_ok=True)
    (bridge_target / "Events" / "2024" / "Day2" / "b.mov").write_bytes(b"b")

    _stage_scan_and_commit(client, bridge_target, "archive", ["Events"])

    library_root = sources_root / "archive" / "Events" / "2024"
    library_root.mkdir(parents=True, exist_ok=True)
    (library_root / "Day1").mkdir(parents=True, exist_ok=True)
    (library_root / "Day1" / "a.mov").write_bytes(b"a")
    (library_root / "Day2").mkdir(parents=True, exist_ok=True)
    (library_root / "Day2" / "b.mov").write_bytes(b"b")

    discovered = client.post("/api/sources/archive/discover-buckets")
    assert discovered.status_code == 200
    payload = discovered.json()
    assert payload["count"] > 0
    bucket_id = payload["buckets"][0]["bucket_id"]

    listing = client.get(f"/api/buckets/{bucket_id}/media")
    assert listing.status_code == 200
    media_payload = listing.json()
    assert media_payload["media"]


def test_stage_scan_commit_limits_library_root(client, env_settings: Path, fake_bridge_agent: FakeBridgeAgent):
    sources_root = env_settings.parent / "sources"
    bridge_target = env_settings.parent / "bridge-target-vault"
    (bridge_target / "Keep").mkdir(parents=True, exist_ok=True)
    (bridge_target / "Keep" / "clip.mov").write_bytes(b"keep")
    (bridge_target / "Skip").mkdir(parents=True, exist_ok=True)
    (bridge_target / "Skip" / "clip.mov").write_bytes(b"skip")

    scan_payload, commit_payload = _stage_scan_and_commit(client, bridge_target, "vault", ["Keep"])
    assert scan_payload["tree"]["path"] == "."
    assert "vault" in {item["source"] for item in commit_payload["sources"]}

    library_root = sources_root / "vault"
    (library_root / "Keep").mkdir(parents=True, exist_ok=True)
    (library_root / "Keep" / "clip.mov").write_bytes(b"keep")
    (library_root / "Skip").mkdir(parents=True, exist_ok=True)
    (library_root / "Skip" / "clip.mov").write_bytes(b"skip")

    listing = client.get("/api/sources/vault/media")
    assert listing.status_code == 200
    payload = listing.json()
    rel_paths = {item["relative_path"] for item in payload["media"]}
    assert "Keep/clip.mov" in rel_paths
    assert "Skip/clip.mov" not in rel_paths
