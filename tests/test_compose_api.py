from __future__ import annotations

from pathlib import Path


def _fake_concat(input_paths: list[Path], output_path: Path, mode: str, *, allow_overwrite: bool = False) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = b""
    for path in input_paths:
        payload += path.read_bytes()
    output_path.write_bytes(payload or b"compiled")
    return "encode" if mode == "encode" else "copy"


def _failing_concat(input_paths: list[Path], output_path: Path, mode: str, *, allow_overwrite: bool = False) -> str:
    from fastapi import HTTPException

    raise HTTPException(status_code=500, detail="ffmpeg failure simulated")


def test_compose_existing_registers_one_asset(client, monkeypatch):
    created = client.post("/api/projects", json={"name": "compose-existing"})
    project_name = created.json()["name"]

    first = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("a.mp4", b"aaa", "video/mp4")},
    )
    second = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("b.mp4", b"bbb", "video/mp4")},
    )
    assert first.status_code == 200
    assert second.status_code == 200

    inputs = [first.json()["path"], second.json()["path"]]
    monkeypatch.setattr("app.api.compose._concat_files", _fake_concat)

    response = client.post(
        f"/api/projects/{project_name}/compose",
        json={"inputs": inputs, "output_name": "timeline", "target_dir": "exports", "mode": "auto"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "stored"
    assert body["path"].startswith("exports/timeline")
    assert "/media/" in body["served"]["stream_url"]
    assert "/download/" in body["served"]["download_url"]

    media = client.get(f"/api/projects/{project_name}/media")
    assert media.status_code == 200
    rel_paths = {item["relative_path"] for item in media.json()["media"]}
    assert body["path"] in rel_paths


def test_compose_upload_uses_temp_root_and_cleans(client, monkeypatch):
    from app.config import get_settings

    temp_root = get_settings().temp_root

    created = client.post("/api/projects", json={"name": "compose-upload"})
    project_name = created.json()["name"]

    monkeypatch.setattr("app.api.compose._concat_files", _fake_concat)

    response = client.post(
        f"/api/projects/{project_name}/compose/upload?output_name=final-cut&target_dir=exports&mode=auto",
        files=[
            ("files", ("one.mp4", b"111", "video/mp4")),
            ("files", ("two.mp4", b"222", "video/mp4")),
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "stored"
    assert body["path"] == "exports/final-cut.mp4"
    assert temp_root.exists()
    assert not any(path.name.startswith("compose_") for path in temp_root.iterdir())


def test_compose_existing_blocks_overwrite_by_default(client, monkeypatch):
    created = client.post("/api/projects", json={"name": "compose-overwrite"})
    project_name = created.json()["name"]
    client.post(f"/api/projects/{project_name}/upload", files={"file": ("a.mp4", b"aaa", "video/mp4")})
    client.post(f"/api/projects/{project_name}/upload", files={"file": ("b.mp4", b"bbb", "video/mp4")})

    monkeypatch.setattr("app.api.compose._concat_files", _fake_concat)

    payload = {
        "inputs": ["ingest/originals/a.mp4", "ingest/originals/b.mp4"],
        "output_name": "same-name.mp4",
        "target_dir": "exports",
        "mode": "auto",
    }
    first = client.post(f"/api/projects/{project_name}/compose", json=payload)
    assert first.status_code == 200

    second = client.post(f"/api/projects/{project_name}/compose", json=payload)
    assert second.status_code == 409


def test_compose_upload_cleanup_on_failure(client, monkeypatch):
    from app.config import get_settings

    temp_root = get_settings().temp_root
    created = client.post("/api/projects", json={"name": "compose-fail"})
    project_name = created.json()["name"]

    monkeypatch.setattr("app.api.compose._concat_files", _failing_concat)

    response = client.post(
        f"/api/projects/{project_name}/compose/upload?output_name=boom.mp4",
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert response.status_code == 500
    assert not any(path.name.startswith("compose_") for path in temp_root.iterdir())


def test_compose_upload_source_urls_include_source_query(client, monkeypatch):
    source_root = Path("/tmp/compose-alt")
    source_root.mkdir(parents=True, exist_ok=True)

    create_source = client.post("/api/sources", json={"name": "alt", "root": str(source_root), "type": "local"})
    assert create_source.status_code == 201
    created = client.post("/api/projects", params={"source": "alt"}, json={"name": "compose-source"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    monkeypatch.setattr("app.api.compose._concat_files", _fake_concat)

    response = client.post(
        f"/api/projects/{project_name}/compose/upload",
        params={"source": "alt", "output_name": "sourced.mp4"},
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert response.status_code == 200
    body = response.json()
    assert "?source=alt" in body["served"]["stream_url"]
    assert "?source=alt" in body["served"]["download_url"]


def test_compose_upload_rejects_temp_root_inside_source(client, monkeypatch, tmp_path):
    from app import config

    projects_root = tmp_path / "projects-root"
    projects_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("MEDIA_SYNC_PROJECTS_ROOT", str(projects_root))
    monkeypatch.setenv("MEDIA_SYNC_TEMP_ROOT", str(projects_root / "_tmp_inside"))
    config.reset_settings_cache()

    module = __import__("app.main", fromlist=["create_app"])
    app = module.create_app()
    from fastapi.testclient import TestClient

    failing_client = TestClient(app)
    created = failing_client.post("/api/projects", json={"name": "compose-temp-unsafe"})
    project_name = created.json()["name"]
    response = failing_client.post(
        f"/api/projects/{project_name}/compose/upload",
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert response.status_code == 503
    assert "MEDIA_SYNC_TEMP_ROOT" in response.json()["detail"]

    existing_response = failing_client.post(
        f"/api/projects/{project_name}/compose",
        json={"inputs": ["ingest/originals/one.mp4"], "output_name": "x.mp4", "target_dir": "exports", "mode": "auto"},
    )
    assert existing_response.status_code == 503
    assert "MEDIA_SYNC_TEMP_ROOT" in existing_response.json()["detail"]


def test_compose_env_validation_falls_back_to_default_source(client, monkeypatch):
    monkeypatch.setattr("app.api.compose.SourceRegistry.list_enabled", lambda self: [])
    monkeypatch.setattr("app.api.compose._concat_files", _fake_concat)

    created = client.post("/api/projects", json={"name": "compose-fallback"})
    project_name = created.json()["name"]
    client.post(f"/api/projects/{project_name}/upload", files={"file": ("a.mp4", b"aaa", "video/mp4")})

    response = client.post(
        f"/api/projects/{project_name}/compose",
        json={"inputs": ["ingest/originals/a.mp4"], "output_name": "fallback.mp4", "target_dir": "exports", "mode": "auto"},
    )
    assert response.status_code == 200


def test_compose_maps_ffmpeg_existing_output_race_to_409(client, monkeypatch):
    monkeypatch.setattr("app.api.compose._inputs_compatible_for_copy", lambda _: True)

    import subprocess

    race_result = subprocess.CompletedProcess(args=["ffmpeg"], returncode=1, stdout="", stderr="Not overwriting - exiting")
    monkeypatch.setattr("app.api.compose.subprocess.run", lambda *args, **kwargs: race_result)

    created = client.post("/api/projects", json={"name": "compose-race"})
    project_name = created.json()["name"]
    client.post(f"/api/projects/{project_name}/upload", files={"file": ("a.mp4", b"aaa", "video/mp4")})

    response = client.post(
        f"/api/projects/{project_name}/compose",
        json={"inputs": ["ingest/originals/a.mp4"], "output_name": "race.mp4", "target_dir": "exports", "mode": "copy"},
    )
    assert response.status_code == 409
