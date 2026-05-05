from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain.live_sessions.models import LiveSession


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


def test_live_session_start_heartbeat_chunk_list_and_end(client):
    node_id, token = _register_node_auth(client, "runner-live-1")

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "other-node", "source_kind": "camera", "metadata": {"origin": "test"}},
        headers=_auth_headers(node_id, token),
    )
    assert started.status_code == 200
    session = started.json()
    assert session["node_id"] == node_id
    assert session["source_kind"] == "camera"
    assert session["status"] == "previewing"
    session_id = session["session_id"]

    heart = client.post(f"/api/live_sessions/{session_id}/heartbeat", headers=_auth_headers(node_id, token))
    assert heart.status_code == 200
    assert heart.json()["session_id"] == session_id

    chunk = client.post(
        f"/api/live_sessions/{session_id}/chunk",
        content=b"fake-webm-chunk",
        headers={**_auth_headers(node_id, token), "content-type": "video/webm"},
    )
    assert chunk.status_code == 200
    assert chunk.json()["chunk_count"] == 1

    listed = client.get("/api/live_sessions")
    assert listed.status_code == 200
    active = listed.json()
    assert len(active) == 1
    assert active[0]["session_id"] == session_id
    assert active[0]["chunk_count"] == 1

    ended = client.post(f"/api/live_sessions/{session_id}/end", headers=_auth_headers(node_id, token))
    assert ended.status_code == 200
    payload = ended.json()
    assert payload["session"]["status"] == "ended"
    assert payload["claim_id"] is not None

    listed_after = client.get("/api/live_sessions")
    assert listed_after.status_code == 200
    assert listed_after.json() == []


def test_live_session_start_requires_registered_node_bearer(client):
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": "missing-node", "source_kind": "camera"},
    )
    assert started.status_code == 401


def test_live_session_start_rejects_wrong_node_header_with_valid_token(client):
    node_id, token = _register_node_auth(client, "runner-live-auth")
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers("wrong-node", token),
    )
    assert started.status_code == 401


def test_live_session_preview_endpoint_returns_latest_chunk(client):
    node_id, token = _register_node_auth(client, "runner-live-2")

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers(node_id, token),
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    chunk = client.post(
        f"/api/live_sessions/{session_id}/chunk",
        content=b"preview-webm",
        headers={**_auth_headers(node_id, token), "content-type": "video/webm"},
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
    node_id, token = _register_node_auth(client, "runner-live-3")

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers(node_id, token),
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    control = client.post(
        f"/api/live_sessions/{session_id}/control",
        json={"action": "start_recording"},
        headers=_auth_headers(node_id, token),
    )
    assert control.status_code == 200
    assert control.json()["ok"] is True
    assert control.json()["action"] == "start_recording"

    fetched = client.get(f"/api/live_sessions/{session_id}")
    assert fetched.status_code == 200
    payload = fetched.json()
    assert payload["desired_action"] == "start_recording"
    assert isinstance(payload["last_control_at"], str)

    ack = client.post(
        f"/api/live_sessions/{session_id}/control/ack",
        json={"action": "start_recording"},
        headers=_auth_headers(node_id, token),
    )
    assert ack.status_code == 200
    assert ack.json()["ok"] is True
    assert ack.json()["action"] == "start_recording"

    fetched_after_ack = client.get(f"/api/live_sessions/{session_id}")
    assert fetched_after_ack.status_code == 200
    assert fetched_after_ack.json()["desired_action"] is None


def test_live_session_signal_offer_answer_ice_round_trip(client):
    node_id, token = _register_node_auth(client, "runner-live-signal")

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers(node_id, token),
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    offer = client.post(
        f"/api/live_sessions/{session_id}/signal/offer",
        json={"offer": {"type": "offer", "sdp": "v=0\r\no=device-offer"}},
        headers=_auth_headers(node_id, token),
    )
    assert offer.status_code == 200
    assert offer.json()["offer"]["type"] == "offer"

    answer = client.post(
        f"/api/live_sessions/{session_id}/signal/answer",
        json={"viewer_id": "viewer-a", "answer": {"type": "answer", "sdp": "v=0\r\no=viewer-answer"}},
    )
    assert answer.status_code == 200
    assert answer.json()["answer"]["type"] == "answer"

    device_ice = client.post(
        f"/api/live_sessions/{session_id}/signal/ice",
        json={
            "role": "device",
            "viewer_id": "viewer-a",
            "candidate": {"candidate": "candidate-device-1", "sdpMid": "0", "sdpMLineIndex": 0},
        },
        headers=_auth_headers(node_id, token),
    )
    assert device_ice.status_code == 200
    assert len(device_ice.json()["ice_from_device"]) == 1

    viewer_ice = client.post(
        f"/api/live_sessions/{session_id}/signal/ice",
        json={
            "role": "viewer",
            "viewer_id": "viewer-a",
            "candidate": {"candidate": "candidate-viewer-1", "sdpMid": "0", "sdpMLineIndex": 0},
        },
    )
    assert viewer_ice.status_code == 200
    assert len(viewer_ice.json()["ice_from_viewer"]) == 1

    state = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-a"})
    assert state.status_code == 200
    payload = state.json()
    assert payload["offer"]["sdp"] == "v=0\r\no=device-offer"
    assert payload["answer"]["sdp"] == "v=0\r\no=viewer-answer"
    assert payload["viewer_id"] == "viewer-a"
    assert payload["primary_viewer_id"] == "viewer-a"
    assert len(payload["ice_from_device"]) == 1
    assert len(payload["ice_from_viewer"]) == 1


def test_live_session_signal_isolates_multiple_viewers(client):
    node_id, token = _register_node_auth(client, "runner-live-signal-multi")

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers(node_id, token),
    )
    session_id = started.json()["session_id"]
    client.post(
        f"/api/live_sessions/{session_id}/signal/offer",
        json={"offer": {"type": "offer", "sdp": "v=0\r\no=shared"}},
        headers=_auth_headers(node_id, token),
    )
    client.post(
        f"/api/live_sessions/{session_id}/signal/answer",
        json={"viewer_id": "viewer-a", "answer": {"type": "answer", "sdp": "v=0\r\no=answer-a"}},
    )
    client.post(
        f"/api/live_sessions/{session_id}/signal/answer",
        json={"viewer_id": "viewer-b", "answer": {"type": "answer", "sdp": "v=0\r\no=answer-b"}},
    )
    client.post(
        f"/api/live_sessions/{session_id}/signal/ice",
        json={"role": "viewer", "viewer_id": "viewer-a", "candidate": {"candidate": "viewer-a-ice"}},
    )
    client.post(
        f"/api/live_sessions/{session_id}/signal/ice",
        json={"role": "viewer", "viewer_id": "viewer-b", "candidate": {"candidate": "viewer-b-ice"}},
    )
    state_a = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-a"})
    state_b = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-b"})
    assert state_a.status_code == 200
    assert state_b.status_code == 200
    assert state_a.json()["answer"]["sdp"] == "v=0\r\no=answer-a"
    assert state_b.json()["answer"]["sdp"] == "v=0\r\no=answer-b"
    assert state_a.json()["ice_from_viewer"][0]["candidate"] == "viewer-a-ice"
    assert state_b.json()["ice_from_viewer"][0]["candidate"] == "viewer-b-ice"

    end = client.post(f"/api/live_sessions/{session_id}/end", headers=_auth_headers(node_id, token))
    assert end.status_code == 200
    after_end_signal = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-a"})
    assert after_end_signal.status_code == 404

def test_live_session_registry_owner_consistent_across_start_read_signal_and_heartbeat(client):
    node_id, token = _register_node_auth(client, "runner-live-owner")
    headers = _auth_headers(node_id, token)

    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera", "metadata": {"origin": "owner-test"}},
        headers=headers,
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    registry_id = started.headers["x-live-session-registry-id"]
    service_registry_id = started.headers["x-live-session-service-registry-id"]
    assert registry_id == service_registry_id

    fetched = client.get(f"/api/live_sessions/{session_id}")
    assert fetched.status_code == 200
    assert fetched.headers["x-live-session-registry-id"] == registry_id

    signal_initial = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-owner"})
    assert signal_initial.status_code == 200
    assert signal_initial.headers["x-live-session-registry-id"] == registry_id

    offer = client.post(
        f"/api/live_sessions/{session_id}/signal/offer",
        json={"offer": {"type": "offer", "sdp": "v=0\r\no=owner-offer"}},
        headers=headers,
    )
    assert offer.status_code == 200
    assert offer.headers["x-live-session-registry-id"] == registry_id

    signal_after_offer = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-owner"})
    assert signal_after_offer.status_code == 200
    assert signal_after_offer.json()["offer"]["sdp"] == "v=0\r\no=owner-offer"

    answer = client.post(
        f"/api/live_sessions/{session_id}/signal/answer",
        json={"viewer_id": "viewer-owner", "answer": {"type": "answer", "sdp": "v=0\r\no=owner-answer"}},
    )
    assert answer.status_code == 200
    assert answer.headers["x-live-session-registry-id"] == registry_id

    viewer_ice = client.post(
        f"/api/live_sessions/{session_id}/signal/ice",
        json={"role": "viewer", "viewer_id": "viewer-owner", "candidate": {"candidate": "viewer-owner-ice"}},
    )
    assert viewer_ice.status_code == 200
    assert viewer_ice.headers["x-live-session-registry-id"] == registry_id

    signal_after_viewer = client.get(f"/api/live_sessions/{session_id}/signal", params={"viewer_id": "viewer-owner"})
    assert signal_after_viewer.status_code == 200
    assert signal_after_viewer.json()["answer"]["sdp"] == "v=0\r\no=owner-answer"
    assert signal_after_viewer.json()["ice_from_viewer"][0]["candidate"] == "viewer-owner-ice"

    heartbeat = client.post(f"/api/live_sessions/{session_id}/heartbeat", headers=headers)
    assert heartbeat.status_code == 200
    assert heartbeat.headers["x-live-session-registry-id"] == registry_id

    fetched_after_heartbeat = client.get(f"/api/live_sessions/{session_id}")
    assert fetched_after_heartbeat.status_code == 200
    assert fetched_after_heartbeat.headers["x-live-session-registry-id"] == registry_id


def test_starting_second_live_session_supersedes_previous_active_same_node_source(client):
    node_id, token = _register_node_auth(client, "runner-live-supersede")
    headers = _auth_headers(node_id, token)

    first = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=headers,
    )
    assert first.status_code == 200
    first_id = first.json()["session_id"]

    second = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=headers,
    )
    assert second.status_code == 200
    second_id = second.json()["session_id"]
    assert second_id != first_id

    listed = client.get("/api/live_sessions")
    assert listed.status_code == 200
    active_ids = [entry["session_id"] for entry in listed.json()]
    assert active_ids == [second_id]

    old = client.get(f"/api/live_sessions/{first_id}")
    assert old.status_code == 200
    assert old.json()["status"] == "ended"
    assert old.json()["metadata"]["superseded_by_session_id"] == second_id

    signal = client.get(f"/api/live_sessions/{second_id}/signal", params={"viewer_id": "viewer-current"})
    assert signal.status_code == 200

    heartbeat = client.post(f"/api/live_sessions/{second_id}/heartbeat", headers=headers)
    assert heartbeat.status_code == 200
    assert heartbeat.json()["session_id"] == second_id
