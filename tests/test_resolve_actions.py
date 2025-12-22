import pytest

from app.api import resolve_actions


@pytest.fixture(autouse=True)
def clear_jobs():
    resolve_actions._reset_job_queue()


def _seed_project(root, name="P1-Project"):
    project_dir = root / name
    ingest = project_dir / "ingest" / "originals"
    ingest.mkdir(parents=True, exist_ok=True)
    clip = ingest / "clip.mp4"
    clip.write_bytes(b"demo")
    return project_dir, clip


def test_resolve_job_creation_and_claim(client, env_settings):
    project_dir, clip = _seed_project(env_settings)

    response = client.post(
        "/api/resolve/open",
        json={
            "project": project_dir.name,
            "media_rel_paths": ["ingest/originals/clip.mp4"],
            "mode": "reveal",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["job_id"]

    claim = client.post("/api/resolve/jobs/next", params={"claimed_by": "agent-1"})
    assert claim.status_code == 200
    job = claim.json()["jobs"][0]
    assert job["status"] == "claimed"
    assert job["claimed_by"] == "agent-1"
    assert job["source"] == "primary"
    assert job["mode"] == "reveal_in_explorer"

    complete = client.post(f"/api/resolve/jobs/{job['id']}/complete")
    assert complete.status_code == 200
    done = client.post("/api/resolve/jobs/next")
    assert done.status_code == 200
    assert done.json()["jobs"] == []


def test_rejects_out_of_project_paths(client, env_settings):
    _seed_project(env_settings)
    response = client.post(
        "/api/resolve/open",
        json={
            "project": "P1-Project",
            "media_rel_paths": ["../secret/clip.mp4"],
        },
    )
    assert response.status_code == 400
    assert "Invalid rel path" in response.json()["detail"]


def test_rejects_missing_files(client, env_settings):
    project_dir, _ = _seed_project(env_settings)
    missing_rel = "ingest/originals/missing.mp4"
    response = client.post(
        "/api/resolve/open",
        json={"project": project_dir.name, "media_rel_paths": [missing_rel]},
    )
    assert response.status_code == 404
    assert "Missing file" in response.json()["detail"]


def test_new_project_requires_name(client):
    response = client.post(
        "/api/resolve/open",
        json={"project": "__new__", "media_rel_paths": ["ingest/clip.mp4"]},
    )
    assert response.status_code == 400
    assert "new_project_name" in response.json()["detail"]
