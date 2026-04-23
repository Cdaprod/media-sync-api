from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain.live_sessions.models import LiveSession


def test_live_session_start_heartbeat_chunk_list_and_end(client):
    register = client.post(
        "/api/nodes",
        json={
            "node_id": "runner-live-1",
            "label": "Runner Live 1",
            "base_url": "http://127.0.0.1:9001",
            "roles": ["runner"],
            "advertised_source_kinds": ["capture"],
            "status": "healthy",
        },
    )
    assert register.status_code == 201

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "runner-live-1", "source_kind": "camera", "metadata": {"origin": "test"}},
    )
    assert started.status_code == 200
    session = started.json()
    assert session["node_id"] == "runner-live-1"
    assert session["source_kind"] == "camera"
    assert session["status"] == "previewing"
    session_id = session["session_id"]

    heart = client.post(f"/api/live_sessions/{session_id}/heartbeat")
    assert heart.status_code == 200
    assert heart.json()["session_id"] == session_id

    chunk = client.post(
        f"/api/live_sessions/{session_id}/chunk",
        content=b"fake-webm-chunk",
        headers={"content-type": "video/webm"},
    )
    assert chunk.status_code == 200
    assert chunk.json()["chunk_count"] == 1

    listed = client.get("/api/live_sessions")
    assert listed.status_code == 200
    active = listed.json()
    assert len(active) == 1
    assert active[0]["session_id"] == session_id
    assert active[0]["chunk_count"] == 1

    ended = client.post(f"/api/live_sessions/{session_id}/end")
    assert ended.status_code == 200
    payload = ended.json()
    assert payload["session"]["status"] == "ended"
    assert payload["claim_id"] is not None

    listed_after = client.get("/api/live_sessions")
    assert listed_after.status_code == 200
    assert listed_after.json() == []


def test_live_session_requires_registered_node(client):
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "missing-node", "source_kind": "camera"},
    )
    assert started.status_code == 404


def test_live_session_preview_endpoint_returns_latest_chunk(client):
    register = client.post(
        "/api/nodes",
        json={
            "node_id": "runner-live-2",
            "label": "Runner Live 2",
            "base_url": "http://127.0.0.1:9002",
            "roles": ["runner"],
            "advertised_source_kinds": ["capture"],
            "status": "healthy",
        },
    )
    assert register.status_code == 201

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "runner-live-2", "source_kind": "camera"},
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    chunk = client.post(
        f"/api/live_sessions/{session_id}/chunk",
        content=b"preview-webm",
        headers={"content-type": "video/webm"},
    )
    assert chunk.status_code == 200

    preview = client.get(f"/api/live_sessions/{session_id}/preview/latest")
    assert preview.status_code == 200
    assert preview.headers["content-type"].startswith("video/webm")
    assert preview.headers["cache-control"] == "no-store, no-cache, must-revalidate"
    assert preview.headers["pragma"] == "no-cache"
    assert preview.content == b"preview-webm"


def test_live_session_list_drops_stale_active_sessions(client):
    runtime = client.app.state.runtime
    registry = runtime.services.live_session_registry
    assert registry is not None

    stale_session = LiveSession(
        session_id="sess-stale",
        node_id="runner-stale",
        source_kind="camera",
        status="recording",
        started_at=(datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
        last_heartbeat_at=(datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
        chunk_count=1,
    )
    registry.upsert(stale_session)

    listed = client.get("/api/live_sessions")
    assert listed.status_code == 200
    assert listed.json() == []
    assert registry.get("sess-stale") is None


def test_live_session_control_updates_desired_action(client):
    register = client.post(
        "/api/nodes",
        json={
            "node_id": "runner-live-3",
            "label": "Runner Live 3",
            "base_url": "http://127.0.0.1:9003",
            "roles": ["runner"],
            "advertised_source_kinds": ["capture"],
            "status": "healthy",
        },
    )
    assert register.status_code == 201

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "runner-live-3", "source_kind": "camera"},
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    control = client.post(
        f"/api/live_sessions/{session_id}/control",
        json={"action": "start_recording"},
    )
    assert control.status_code == 200
    assert control.json()["ok"] is True
    assert control.json()["action"] == "start_recording"

    fetched = client.get(f"/api/live_sessions/{session_id}")
    assert fetched.status_code == 200
    payload = fetched.json()
    assert payload["desired_action"] == "start_recording"
    assert isinstance(payload["last_control_at"], str)
