from __future__ import annotations

import hashlib
from pathlib import Path


def _register_node_auth(client, node_id: str) -> tuple[str, str]:
    response = client.post(
        "/connect/register",
        json={
            "node_id": node_id,
            "label": f"{node_id} label",
            "base_url": "http://127.0.0.1:9001",
            "roles": ["runner", "capture"],
            "capabilities": ["can_proxy_streams"],
            "source_name": "camera-primary",
            "source_kind": "capture",
            "source_authority": "runner-local",
            "advertised_source_kinds": ["capture"],
            "status": "healthy",
            "metadata": {"transport_hint": "session"},
        },
    )
    assert response.status_code == 200
    return node_id, response.json()["auth"]["token"]


def _auth_headers(node_id: str, token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Media-Sync-Node-Id": node_id,
    }


def _start_live_session(client, node_id: str, token: str) -> str:
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers(node_id, token),
    )
    assert started.status_code == 200
    return started.json()["session_id"]


def test_upload_recording_persists_webm_and_returns_asset_url(client):
    node_id, token = _register_node_auth(client, "runner-live-recording-upload")
    session_id = _start_live_session(client, node_id, token)

    response = client.post(
        f"/api/live_sessions/{session_id}/recording/upload",
        data={
            "project": "recordings-project",
            "source": "primary",
            "target_dir": "ingest/live",
            "recording_id": "rec-test-1",
            "filename": "peer-recording.webm",
        },
        files={"file": ("peer-recording.webm", b"webm-payload", "video/webm")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["state"] == "completed"
    assert payload["session_id"] == session_id
    assert payload["recording_id"] == "rec-test-1"
    assert payload["filename"] == "peer-recording.webm"
    assert payload["asset_url"] == "/media/recordings-project/ingest/live/peer-recording.webm?source=primary"
    assert payload["size_bytes"] == len(b"webm-payload")
    assert payload.get("sha256") == hashlib.sha256(b"webm-payload").hexdigest()

    output_path = Path(payload["output_path"])
    assert output_path.exists()
    assert output_path.read_bytes() == b"webm-payload"
    assert list(output_path.parent.glob("*.tmp")) == []

    projects = client.get('/api/projects')
    assert projects.status_code == 200
    assert any(item.get('name') == 'recordings-project' for item in projects.json())


def test_upload_recording_rejects_parent_target_dir(client):
    node_id, token = _register_node_auth(client, "runner-live-recording-invalid-dir")
    session_id = _start_live_session(client, node_id, token)

    response = client.post(
        f"/api/live_sessions/{session_id}/recording/upload",
        data={
            "project": "recordings-project",
            "source": "primary",
            "target_dir": "../escape",
        },
        files={"file": ("peer-recording.webm", b"webm-payload", "video/webm")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] in {"target_dir_must_be_relative", "target_dir_contains_parent_segment"}
