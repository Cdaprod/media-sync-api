from __future__ import annotations


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

    heartbeated = client.post("/api/nodes/runner-1/heartbeat")
    assert heartbeated.status_code == 200
    assert heartbeated.json()["last_heartbeat_at"]


def test_nodes_reject_invalid_id(client):
    response = client.post(
        "/api/nodes",
        json={"node_id": "../bad", "label": "Bad", "base_url": "http://127.0.0.1:8787"},
    )
    assert response.status_code == 400
    assert "Node id" in response.json()["detail"]
