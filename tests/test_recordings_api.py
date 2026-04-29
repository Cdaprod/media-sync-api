from __future__ import annotations


def test_start_recording_session_returns_recording_state(client):
    response = client.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec-api-1",
            "session_id": "sess-api-1",
            "node_id": "node-api-1",
            "project": "recordings-project",
        },
    )
    assert response.status_code == 200
    payload = response.json()["recording"]
    assert payload["recording_id"] == "rec-api-1"
    assert payload["state"] == "recording"
    assert payload["project"] == "recordings-project"


def test_list_recording_sessions_returns_created_recording(client):
    started = client.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec-list-1",
            "session_id": "sess-list-1",
            "node_id": "node-list-1",
            "project": "recordings-project",
        },
    )
    assert started.status_code == 200

    response = client.get("/api/recordings")
    assert response.status_code == 200
    recordings = response.json()["recordings"]
    assert any(item["recording_id"] == "rec-list-1" for item in recordings)


def test_complete_recording_session_records_asset_url(client):
    started = client.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec-complete-1",
            "session_id": "sess-complete-1",
            "node_id": "node-complete-1",
            "project": "recordings-project",
        },
    )
    assert started.status_code == 200

    response = client.post(
        "/api/recordings/rec-complete-1/complete",
        json={
            "asset_url": "/media/recordings-project/ingest/live/rec-complete-1.webm?source=primary",
            "filename": "rec-complete-1.webm",
        },
    )
    assert response.status_code == 200
    payload = response.json()["recording"]
    assert payload["state"] == "completed"
    assert payload["asset_url"] == "/media/recordings-project/ingest/live/rec-complete-1.webm?source=primary"
    assert payload["filename"] == "rec-complete-1.webm"


def test_fail_recording_session_records_error(client):
    started = client.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec-fail-1",
            "session_id": "sess-fail-1",
            "node_id": "node-fail-1",
            "project": "recordings-project",
        },
    )
    assert started.status_code == 200

    response = client.post(
        "/api/recordings/rec-fail-1/fail",
        json={"error": "upload failed"},
    )
    assert response.status_code == 200
    payload = response.json()["recording"]
    assert payload["state"] == "failed"
    assert payload["error"] == "upload failed"


def test_delete_recording_session_removes_recording(client):
    started = client.post(
        "/api/recordings/start",
        json={
            "recording_id": "rec-delete-1",
            "session_id": "sess-delete-1",
            "node_id": "node-delete-1",
            "project": "recordings-project",
        },
    )
    assert started.status_code == 200

    deleted = client.delete("/api/recordings/rec-delete-1")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    listed = client.get("/api/recordings")
    assert listed.status_code == 200
    assert all(item["recording_id"] != "rec-delete-1" for item in listed.json()["recordings"])

