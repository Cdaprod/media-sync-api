from __future__ import annotations


def test_post_offer_creates_session_and_get_offer_returns_payload(client):
    session_id = "sess-live-1"
    posted = client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-1", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )
    assert posted.status_code == 200
    assert posted.json()["ok"] is True

    fetched = client.get(f"/api/live/{session_id}/offer")
    assert fetched.status_code == 200
    assert fetched.json()["type"] == "offer"


def test_get_missing_offer_returns_404(client):
    response = client.get("/api/live/sess-missing/offer")
    assert response.status_code == 404


def test_post_answer_stores_and_get_answer_returns_answer(client):
    session_id = "sess-live-2"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-2", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )

    posted = client.post(
        f"/api/live/{session_id}/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer"}},
    )
    assert posted.status_code == 200

    fetched = client.get(f"/api/live/{session_id}/answer")
    assert fetched.status_code == 200
    assert fetched.json()["answer"]["type"] == "answer"


def test_multiple_viewers_can_post_distinct_answers_and_list_viewers(client):
    session_id = "sess-live-multi-viewers"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-multi", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )

    first = client.post(
        f"/api/live/{session_id}/viewers/viewer-a/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer-a"}},
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/live/{session_id}/viewers/viewer-b/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer-b"}},
    )
    assert second.status_code == 200

    listed = client.get("/api/live")
    assert listed.status_code == 200
    session = next((entry for entry in listed.json()["sessions"] if entry["session_id"] == session_id), None)
    assert session is not None
    assert session["viewer_count"] == 2
    assert set(session["viewer_ids"]) == {"viewer-a", "viewer-b"}
    assert session["state"] == "connected"


def test_legacy_default_answer_compatibility_returns_default_or_first(client):
    session_id = "sess-live-default-compat"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-default", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )

    viewer_only = client.post(
        f"/api/live/{session_id}/viewers/viewer-z/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=viewer-z"}},
    )
    assert viewer_only.status_code == 200

    legacy_fetch = client.get(f"/api/live/{session_id}/answer")
    assert legacy_fetch.status_code == 200
    assert legacy_fetch.json()["answer"]["sdp"] == "v=0\r\no=viewer-z"

    default_post = client.post(
        f"/api/live/{session_id}/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=default-answer"}},
    )
    assert default_post.status_code == 200

    default_fetch = client.get(f"/api/live/{session_id}/answer")
    assert default_fetch.status_code == 200
    assert default_fetch.json()["answer"]["sdp"] == "v=0\r\no=default-answer"


def test_device_and_viewer_ice_exchange_and_viewer_state_updates(client):
    session_id = "sess-live-ice-state"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-ice", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )
    client.post(
        f"/api/live/{session_id}/viewers/viewer-ice/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer"}},
    )

    device_ice = client.post(
        f"/api/live/{session_id}/ice/device",
        json={"candidate": {"candidate": "candidate-device", "sdpMid": "0", "sdpMLineIndex": 0}},
    )
    assert device_ice.status_code == 200
    device_ice_list = client.get(f"/api/live/{session_id}/ice/device")
    assert device_ice_list.status_code == 200
    assert len(device_ice_list.json()["candidates"]) == 1

    viewer_ice = client.post(
        f"/api/live/{session_id}/viewers/viewer-ice/ice",
        json={"candidate": {"candidate": "candidate-viewer", "sdpMid": "0", "sdpMLineIndex": 0}},
    )
    assert viewer_ice.status_code == 200
    viewer_ice_list = client.get(f"/api/live/{session_id}/viewers/viewer-ice/ice")
    assert viewer_ice_list.status_code == 200
    assert len(viewer_ice_list.json()["candidates"]) == 1

    state = client.post(
        f"/api/live/{session_id}/viewers/viewer-ice/state",
        json={"state": "checking"},
    )
    assert state.status_code == 200

    listed = client.get("/api/live")
    assert listed.status_code == 200
    session = next((entry for entry in listed.json()["sessions"] if entry["session_id"] == session_id), None)
    assert session is not None
    assert session["connection_states"]["viewer-ice"] == "checking"


def test_list_live_sessions_returns_sessions_object_shape(client):
    session_id = "sess-live-list-1"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-list-1", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )

    listed = client.get("/api/live")
    assert listed.status_code == 200
    body = listed.json()
    assert isinstance(body, dict)
    assert isinstance(body.get("sessions"), list)

    first = next((entry for entry in body["sessions"] if entry.get("session_id") == session_id), None)
    assert first is not None
    assert first["session_id"] == session_id
    assert first["node_id"] == "node-live-list-1"
    assert first["has_offer"] is True
    assert first["has_answer"] is False
    assert first["state"] == "waiting_for_answer"


def test_list_live_sessions_state_connected_after_answer(client):
    session_id = "sess-live-list-2"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-list-2", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )
    client.post(
        f"/api/live/{session_id}/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer"}},
    )

    listed = client.get("/api/live")
    assert listed.status_code == 200
    body = listed.json()
    assert isinstance(body.get("sessions"), list)

    first = next((entry for entry in body["sessions"] if entry.get("session_id") == session_id), None)
    assert first is not None
    assert first["has_offer"] is True
    assert first["has_answer"] is True
    assert first["state"] == "connected"


def test_live_offer_is_visible_in_live_session_list(client):
    session_id = "test-live-align-001"
    node_id = "test-node-align-001"

    res = client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": node_id, "offer": {"type": "offer", "sdp": "v=0\\n"}},
    )
    assert res.status_code == 200

    listed = client.get("/api/live")
    assert listed.status_code == 200
    payload = listed.json()
    sessions = payload["sessions"] if isinstance(payload, dict) else payload

    match = next((s for s in sessions if s["session_id"] == session_id), None)
    assert match is not None
    assert match["node_id"] == node_id
    assert match["has_offer"] is True
    assert match["has_answer"] is False
    assert match["state"] == "waiting_for_answer"


def test_live_session_contract_alignment_includes_webrtc_and_recording_fields(client):
    session_id = "sess-live-contract-alignment"
    node_id = "node-live-contract-alignment"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": node_id, "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )
    client.post(
        f"/api/live/{session_id}/viewers/viewer-contract/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer"}},
    )

    listed = client.get("/api/live")
    assert listed.status_code == 200
    sessions = listed.json()["sessions"]
    match = next((entry for entry in sessions if entry["session_id"] == session_id), None)
    assert match is not None
    assert match["node_id"] == node_id
    assert match["has_offer"] is True
    assert match["has_answer"] is True
    assert match["state"] == "connected"
    assert isinstance(match.get("viewer_ids"), list)
    assert match.get("viewer_count") == len(match["viewer_ids"])
    # Contract alignment for browser/runtime lanes.
    assert "recording_count" in match
    assert "active_recording_id" in match
    assert "recording_state" in match


def test_connect_device_renders_camera_shell_for_registered_node(client):
    registered = client.post(
        "/connect/register",
        json={
            "node_id": "node-device-shell",
            "label": "Node Device Shell",
            "base_url": "http://127.0.0.1:9009",
            "roles": ["runner", "capture"],
            "source_name": "primary",
            "source_kind": "capture",
        },
    )
    assert registered.status_code == 200

    response = client.get("/connect/device", params={"node_id": "node-device-shell"})
    assert response.status_code == 200
    assert "navigator.mediaDevices.getUserMedia" in response.text
    assert "/api/live/" in response.text
    assert "/ice/device" in response.text
    assert "viewers/default/ice" in response.text

def test_record_start_is_idempotent_and_visible_in_live_list(client):
    session_id = "sess-live-rec-idem"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-rec", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )

    started = client.post(f"/api/live/{session_id}/record/start", json={"project": "ProjA", "source": "primary"})
    assert started.status_code == 200
    first = started.json()["recording"]
    assert first["state"] == "recording"

    started_again = client.post(f"/api/live/{session_id}/record/start", json={"project": "ProjA", "source": "primary"})
    assert started_again.status_code == 200
    second = started_again.json()["recording"]
    assert second["recording_id"] == first["recording_id"]
    assert started_again.json()["idempotent"] is True

    listed = client.get("/api/live")
    session = next((entry for entry in listed.json()["sessions"] if entry["session_id"] == session_id), None)
    assert session is not None
    assert session["active_recording_id"] == first["recording_id"]
    assert session["recording_state"] == "recording"


def test_record_stop_transitions_honestly(client):
    session_id = "sess-live-rec-stop"
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-rec-stop", "offer": {"type": "offer", "sdp": "v=0\r\no=offer"}},
    )
    started = client.post(f"/api/live/{session_id}/record/start", json={"project": "ProjA", "source": "primary"})
    assert started.status_code == 200

    stopped = client.post(f"/api/live/{session_id}/record/stop", json={})
    assert stopped.status_code == 200
    assert stopped.json()["recording"]["state"] == "failed"
    assert stopped.json()["recording"]["error"] == "recording_not_materialized"

def test_viewer_attach_does_not_overwrite_publisher_offer_and_supports_two_viewers(client):
    session_id = "sess-live-viewer-iso"
    offer_payload = {"type": "offer", "sdp": "v=0\r\no=publisher-offer"}
    client.post(
        f"/api/live/{session_id}/offer",
        json={"node_id": "node-live-view", "offer": offer_payload},
    )

    client.post(
        f"/api/live/{session_id}/viewers/viewer-a/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer-a"}},
    )
    client.post(
        f"/api/live/{session_id}/viewers/viewer-b/answer",
        json={"answer": {"type": "answer", "sdp": "v=0\r\no=answer-b"}},
    )

    offer = client.get(f"/api/live/{session_id}/offer")
    assert offer.status_code == 200
    assert offer.json()["sdp"] == offer_payload["sdp"]

    listed = client.get('/api/live')
    match = next((s for s in listed.json()["sessions"] if s["session_id"] == session_id), None)
    assert match is not None
    assert match["viewer_count"] >= 2
    assert match["has_offer"] is True


def _register_node_auth_webrtc(client, node_id: str) -> tuple[str, str]:
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


def _auth_headers_webrtc(node_id: str, token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Media-Sync-Node-Id": node_id,
    }


def test_signal_offer_via_live_sessions_is_visible_in_api_live(client):
    """POST /api/live_sessions/{id}/signal/offer must bridge into WebRtcLiveSessionRegistry.

    Device posts the WebRTC offer via the durable /api/live_sessions signal route;
    Explorer reads /api/live to derive has_offer for Watch Live visibility and
    ensureLiveBroadcastAlignment checks this too. Without the bridge these two stores
    are decoupled and alignment always fails with offer_missing / session_not_listed.
    """
    node_id, token = _register_node_auth_webrtc(client, "node-bridge-signal-test")
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers_webrtc(node_id, token),
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]

    offer_res = client.post(
        f"/api/live_sessions/{session_id}/signal/offer",
        json={"offer": {"type": "offer", "sdp": "v=0\r\no=bridged-offer"}},
        headers=_auth_headers_webrtc(node_id, token),
    )
    assert offer_res.status_code == 200

    listed = client.get("/api/live")
    assert listed.status_code == 200
    sessions = listed.json().get("sessions", listed.json() if isinstance(listed.json(), list) else [])
    match = next((s for s in sessions if s["session_id"] == session_id), None)
    assert match is not None, f"session {session_id} not found in /api/live after signal/offer post"
    assert match["has_offer"] is True, "has_offer must be True after signal/offer is posted"
    assert match["node_id"] == node_id


def test_signal_answer_via_live_sessions_is_visible_in_api_live(client):
    """POST /api/live_sessions/{id}/signal/answer must bridge into WebRtcLiveSessionRegistry."""
    node_id, token = _register_node_auth_webrtc(client, "node-bridge-answer-test")
    started = client.post(
        "/api/live_sessions/start",
        json={"node_id": node_id, "source_kind": "camera"},
        headers=_auth_headers_webrtc(node_id, token),
    )
    session_id = started.json()["session_id"]

    client.post(
        f"/api/live_sessions/{session_id}/signal/offer",
        json={"offer": {"type": "offer", "sdp": "v=0\r\no=bridged-offer"}},
        headers=_auth_headers_webrtc(node_id, token),
    )
    answer_res = client.post(
        f"/api/live_sessions/{session_id}/signal/answer",
        json={"viewer_id": "viewer-bridge-a", "answer": {"type": "answer", "sdp": "v=0\r\no=viewer-answer"}},
    )
    assert answer_res.status_code == 200

    listed = client.get("/api/live")
    sessions = listed.json().get("sessions", [])
    match = next((s for s in sessions if s["session_id"] == session_id), None)
    assert match is not None
    assert match["has_offer"] is True
    assert match["has_answer"] is True
    assert match["state"] == "connected"
    assert match["has_offer"] is True
