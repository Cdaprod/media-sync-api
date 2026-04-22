from __future__ import annotations


def test_runtime_composition_includes_node_and_ingest_services(client):
    runtime = client.app.state.runtime

    assert runtime.services.node_registry is not None
    assert runtime.services.ingest_registry is not None
    assert runtime.services.ingest_claim_service is not None
