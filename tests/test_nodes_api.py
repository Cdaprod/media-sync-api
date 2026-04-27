from __future__ import annotations


def _register_node_auth(client, node_id: str) -> tuple[str, str]:
    response = client.post(
        "/connect/register",
        json={
            "node_id": node_id,
            "label": f"{node_id} label",
            "base_url": "http://127.0.0.1:9998",
            "roles": ["runner", "capture"],
            "source_name": "primary",
            "source_kind": "capture",
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


def test_nodes_register_list_get_claim_and_heartbeat(client):
    payload = {
        "node_id": "runner-1",
        "label": "Runner 1",
        "base_url": "http://127.0.0.1:9787",
        "roles": ["runner"],
        "capabilities": ["list_projects"],
        "status": "healthy",
        "version": "0.2.0",
        "advertised_source_kinds": ["filesystem"],
    }

    register = client.post("/api/nodes", json=payload)
    assert register.status_code == 201
    created = register.json()
    assert created["node_id"] == "runner-1"
    assert created["status"] == "healthy"
    assert created["last_heartbeat_at"]

    listed = client.get("/api/nodes")
    assert listed.status_code == 200
    nodes = listed.json()
    assert len(nodes) == 1
    assert nodes[0]["node_id"] == "runner-1"

    fetched = client.get("/api/nodes/runner-1")
    assert fetched.status_code == 200
    assert fetched.json()["label"] == "Runner 1"

    claimed = client.post(
        "/api/nodes/runner-1/claim",
        json={"capabilities": ["list_projects", "list_media"], "status": "degraded", "metadata": {"zone": "lab"}},
    )
    assert claimed.status_code == 200
    claim_data = claimed.json()
    assert claim_data["status"] == "degraded"
    assert claim_data["metadata"]["zone"] == "lab"

    _, token = _register_node_auth(client, "runner-1")
    heartbeated = client.post("/api/nodes/runner-1/heartbeat", headers=_auth_headers("runner-1", token))
    assert heartbeated.status_code == 200
    assert heartbeated.json()["last_heartbeat_at"]
    assert heartbeated.json()["status"] == "online"


def test_nodes_reject_invalid_id(client):
    response = client.post(
        "/api/nodes",
        json={"node_id": "../bad", "label": "Bad", "base_url": "http://127.0.0.1:8787"},
    )
    assert response.status_code == 400
    assert "Node id" in response.json()["detail"]


def test_nodes_reject_invalid_claim_status_without_deleting_record(client):
    create = client.post(
        "/api/nodes",
        json={"node_id": "runner-2", "label": "Runner 2", "base_url": "http://127.0.0.1:8788"},
    )
    assert create.status_code == 201

    invalid_claim = client.post("/api/nodes/runner-2/claim", json={"status": "bad-status"})
    assert invalid_claim.status_code == 422

    still_exists = client.get("/api/nodes/runner-2")
    assert still_exists.status_code == 200
    assert still_exists.json()["node_id"] == "runner-2"


def test_nodes_reject_empty_label_as_client_error(client):
    response = client.post(
        "/api/nodes",
        json={"node_id": "runner-3", "label": "", "base_url": "http://127.0.0.1:8789"},
    )
    assert response.status_code == 400
    assert "label" in response.json()["detail"]


def test_nodes_accept_session_node_with_null_base_url_and_preserve_null_in_list(client):
    payload = {
        "node_id": "browser-session-1",
        "label": "Browser Session",
        "base_url": None,
        "roles": ["runner", "capture"],
        "metadata": {
            "transport_hint": "session",
            "session_node": "true",
            "browser_push": "true",
        },
    }
    response = client.post("/api/nodes", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["base_url"] is None

    listed = client.get("/api/nodes")
    assert listed.status_code == 200
    nodes = listed.json()
    target = next(node for node in nodes if node["node_id"] == "browser-session-1")
    assert target["base_url"] is None


def test_nodes_reject_missing_base_url_for_non_session_node(client):
    payload = {
        "node_id": "runner-no-base",
        "label": "Runner No Base",
        "base_url": "",
        "roles": ["runner"],
        "metadata": {},
    }
    response = client.post("/api/nodes", json=payload)
    assert response.status_code == 400
    assert "base_url" in response.json()["detail"]



def test_nodes_delete_endpoint(client):
    create = client.post(
        "/api/nodes",
        json={"node_id": "runner-delete", "label": "Runner Delete", "base_url": "http://127.0.0.1:8777"},
    )
    assert create.status_code == 201

    deleted = client.delete("/api/nodes/runner-delete")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    missing = client.get("/api/nodes/runner-delete")
    assert missing.status_code == 404


def test_nodes_prune_endpoint(client):
    create = client.post(
        "/api/nodes",
        json={
            "node_id": "runner-prune",
            "label": "Runner Prune",
            "base_url": None,
            "ephemeral": True,
            "metadata": {
                "transport_hint": "session",
                "session_node": "true",
                "browser_push": "true",
            },
        },
    )
    assert create.status_code == 201

    claim = client.post(
        "/api/nodes/runner-prune/claim",
        json={"metadata": {"transport_hint": "session", "session_node": "true", "browser_push": "true"}},
    )
    assert claim.status_code == 200

    import time
    time.sleep(1.1)
    pruned = client.post("/api/nodes/prune", params={"older_than_seconds": 1})
    assert pruned.status_code == 200
    assert pruned.json()["ok"] is True
    assert "runner-prune" in pruned.json()["removed"]
