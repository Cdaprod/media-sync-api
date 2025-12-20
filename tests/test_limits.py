from __future__ import annotations


def test_upload_respects_size_limit(limited_client):
    limited_client.post("/api/projects", json={"name": "small"})
    payload = b"a" * (2 * 1024 * 1024)
    response = limited_client.post(
        "/api/projects/small/upload",
        files={"file": ("big.bin", payload, "application/octet-stream")},
    )
    assert response.status_code in (400, 413)
