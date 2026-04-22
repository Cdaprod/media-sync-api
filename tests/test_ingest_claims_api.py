from __future__ import annotations


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


def test_submit_ingest_claim_success_and_deferred_materialization(client):
    response = client.post("/api/ingest/claims", json=_payload())
    assert response.status_code == 201
    payload = response.json()
    assert payload["claim_id"].startswith("claim_")
    assert payload["status"] == "materialization_pending"
    assert payload["acceptance"]["status"] == "deferred_materialization"


def test_get_and_list_ingest_claims(client):
    create = client.post("/api/ingest/claims", json=_payload(materialization_mode="shared-path"))
    assert create.status_code == 201
    claim_id = create.json()["claim_id"]

    listed = client.get("/api/ingest/claims")
    assert listed.status_code == 200
    rows = listed.json()
    assert any(row["claim_id"] == claim_id for row in rows)

    fetched = client.get(f"/api/ingest/claims/{claim_id}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "under_review"


def test_submit_ingest_claim_invalid_rejected_with_client_error(client):
    response = client.post("/api/ingest/claims", json=_payload(size_bytes=-1))
    assert response.status_code == 422


def test_runtime_wiring_exposes_ingest_services(client):
    runtime = client.app.state.runtime
    assert runtime.services.ingest_registry is not None
    assert runtime.services.ingest_claim_service is not None


def test_authority_does_not_auto_canonicalize_everything(client):
    response = client.post("/api/ingest/claims", json=_payload(materialization_mode="stream-ref"))
    assert response.status_code == 201
    payload = response.json()
    assert payload["acceptance"]["status"] == "deferred_materialization"
    assert payload["acceptance"]["canonical_asset_id"] is None
