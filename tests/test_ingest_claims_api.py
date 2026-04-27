from __future__ import annotations


def _register_node_auth(client, node_id: str, source_name: str = "primary") -> tuple[str, str]:
    response = client.post(
        "/connect/register",
        json={
            "node_id": node_id,
            "label": f"{node_id} label",
            "base_url": "http://127.0.0.1:9999",
            "roles": ["runner", "capture"],
            "capabilities": ["can_proxy_streams"],
            "source_name": source_name,
            "source_kind": "capture",
            "source_authority": "runner-local",
            "advertised_source_kinds": ["capture"],
            "status": "healthy",
            "metadata": {"transport_hint": "session"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    return node_id, body["auth"]["token"]


def _headers(node_id: str, token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Media-Sync-Node-Id": node_id,
    }


def _payload(**overrides):
    base = {
        "node_id": "runner-21",
        "source_name": "primary",
        "kind": "file",
        "local_ref": "/mnt/runner/staged/clip.mov",
        "materialization_mode": "upload",
        "fingerprint": "sha256:abc",
        "content_type": "video/quicktime",
        "size_bytes": 42,
        "metadata": {"lane": "test"},
    }
    base.update(overrides)
    return base


def test_submit_ingest_claim_requires_bearer_token(client):
    response = client.post("/api/ingest/claims", json=_payload())
    assert response.status_code == 401


def test_submit_ingest_claim_rejects_wrong_node_header(client):
    node_id, token = _register_node_auth(client, "runner-21")
    response = client.post(
        "/api/ingest/claims",
        json=_payload(node_id="wrong-node"),
        headers=_headers("wrong-node", token),
    )
    assert response.status_code == 401


def test_submit_ingest_claim_success_and_deferred_materialization(client):
    node_id, token = _register_node_auth(client, "runner-21")
    response = client.post("/api/ingest/claims", json=_payload(node_id="other-node"), headers=_headers(node_id, token))
    assert response.status_code == 201
    payload = response.json()
    assert payload["claim_id"].startswith("claim_")
    assert payload["status"] == "materialization_pending"
    assert payload["acceptance"]["status"] == "deferred_materialization"
    assert payload["node_id"] == node_id


def test_get_list_delete_and_prune_ingest_claims(client):
    node_id, token = _register_node_auth(client, "runner-22")
    create = client.post(
        "/api/ingest/claims",
        json=_payload(node_id=node_id, source_name="primary", materialization_mode="shared-path"),
        headers=_headers(node_id, token),
    )
    assert create.status_code == 201
    claim_id = create.json()["claim_id"]

    listed = client.get("/api/ingest/claims")
    assert listed.status_code == 200
    rows = listed.json()
    assert any(row["claim_id"] == claim_id for row in rows)

    fetched = client.get(f"/api/ingest/claims/{claim_id}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "under_review"

    deleted = client.delete(f"/api/ingest/claims/{claim_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    missing = client.get(f"/api/ingest/claims/{claim_id}")
    assert missing.status_code == 404

    prune = client.post("/api/ingest/claims/prune", params={"older_than_seconds": 1})
    assert prune.status_code == 200
    assert prune.json()["ok"] is True


def test_submit_ingest_claim_invalid_rejected_with_client_error(client):
    node_id, token = _register_node_auth(client, "runner-23")
    response = client.post(
        "/api/ingest/claims",
        json=_payload(node_id=node_id, size_bytes=-1),
        headers=_headers(node_id, token),
    )
    assert response.status_code == 422


def test_runtime_wiring_exposes_ingest_services(client):
    runtime = client.app.state.runtime
    assert runtime.services.ingest_registry is not None
    assert runtime.services.ingest_claim_service is not None


def test_authority_does_not_auto_canonicalize_everything(client):
    node_id, token = _register_node_auth(client, "runner-24")
    response = client.post(
        "/api/ingest/claims",
        json=_payload(node_id=node_id, materialization_mode="stream-ref"),
        headers=_headers(node_id, token),
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["acceptance"]["status"] == "deferred_materialization"
    assert payload["acceptance"]["canonical_asset_id"] is None
