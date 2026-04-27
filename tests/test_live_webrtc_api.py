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
