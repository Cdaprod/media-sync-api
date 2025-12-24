from __future__ import annotations

from app.storage.tags_store import asset_id_for_project


def test_asset_tag_roundtrip(client):
    project = "P1-Demo"
    rel_path = "ingest/originals/clip.mov"
    add = client.post(
        f"/api/projects/{project}/assets/tags",
        params={"rel_path": rel_path},
        json={"tags": ["My Tag", "b-roll", "WF:Select"]},
    )
    assert add.status_code == 200
    assert sorted(add.json()["tags"]) == ["b-roll", "my-tag", "wf:select"]

    fetched = client.get(
        f"/api/projects/{project}/assets/tags",
        params={"rel_path": rel_path},
    )
    assert fetched.status_code == 200
    assert fetched.json()["tags"] == ["b-roll", "my-tag", "wf:select"]

    removed = client.request(
        "DELETE",
        f"/api/projects/{project}/assets/tags",
        params={"rel_path": rel_path},
        json={"tags": ["my-tag"]},
    )
    assert removed.status_code == 200
    assert removed.json()["tags"] == ["b-roll", "wf:select"]


def test_batch_tags(client):
    project = "P2-Batch"
    rel_one = "ingest/originals/a.mov"
    rel_two = "ingest/originals/b.mov"

    client.post(
        f"/api/projects/{project}/assets/tags",
        params={"rel_path": rel_one},
        json={"tags": ["alpha", "beta"]},
    )

    batch = client.post(
        "/api/tags/batch",
        json={"project": project, "rel_paths": [rel_one, rel_two]},
    )
    assert batch.status_code == 200
    payload = batch.json()
    asset_one = asset_id_for_project("primary", project, rel_one)
    asset_two = asset_id_for_project("primary", project, rel_two)
    assert payload["map"][asset_one] == ["alpha", "beta"]
    assert payload["map"][asset_two] == []


def test_asset_id_tag_roundtrip(client):
    project = "P3-AssetId"
    rel_path = "ingest/originals/clip.mov"
    asset_id = asset_id_for_project("primary", project, rel_path)

    add = client.post(
        f"/api/projects/{project}/assets/tags",
        params={"asset_id": asset_id},
        json={"tags": ["alpha", "beta"]},
    )
    assert add.status_code == 200
    assert sorted(add.json()["tags"]) == ["alpha", "beta"]

    fetched = client.get(
        f"/api/projects/{project}/assets/tags",
        params={"asset_id": asset_id},
    )
    assert fetched.status_code == 200
    assert fetched.json()["tags"] == ["alpha", "beta"]
