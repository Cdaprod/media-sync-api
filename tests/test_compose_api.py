from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.compose import ComposePreprocessor, ComposeResult, InputAsset, PreparedSegment, _validate_supported_inputs


def _patch_compose_runtime(monkeypatch, *, fail: bool = False) -> None:
    def _fake_prepare(self, assets, work_dir):
        work_dir.mkdir(parents=True, exist_ok=True)
        return [
            PreparedSegment(path=asset.path, source_kind=asset.kind, generated=False)
            for asset in assets
        ]

    def _fake_execute(self, plan):
        if fail:
            raise HTTPException(status_code=500, detail="ffmpeg failure simulated")
        plan.output_path.parent.mkdir(parents=True, exist_ok=True)
        payload = b""
        for input_path in plan.input_paths:
            payload += input_path.read_bytes()
        plan.output_path.write_bytes(payload or b"compiled")
        return ComposeResult(output_path=plan.output_path, mode_used=plan.strategy)

    monkeypatch.setattr("app.api.compose.ComposePreprocessor.prepare", _fake_prepare)
    monkeypatch.setattr("app.api.compose.ComposeExecutor.execute", _fake_execute)


def _await_compose_job(client, project_name: str, job_id: str, *, source: str = "primary") -> dict:
    deadline = time.time() + 5
    last_payload: dict | None = None
    while time.time() < deadline:
        response = client.get(f"/api/projects/{project_name}/compose/jobs/{job_id}", params={"source": source})
        assert response.status_code == 200
        payload = response.json()
        last_payload = payload
        if payload["status"] in {"completed", "failed"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"compose job did not settle in time: {last_payload}")


def test_compose_existing_accepts_job_and_registers_one_asset(client, monkeypatch):
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

    _patch_compose_runtime(monkeypatch)

    response = client.post(
        f"/api/projects/{project_name}/compose",
        json={
            "inputs": [first.json()["path"], second.json()["path"]],
            "output_name": "timeline",
            "target_dir": "exports",
            "mode": "auto",
        },
    )
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "accepted"
    assert body["job_status"] in {"queued", "running"}
    assert body["refresh_scope"] == {"project": project_name, "source": "primary", "paths": ["exports"]}

    status = _await_compose_job(client, project_name, body["job_id"])
    assert status["status"] == "completed"
    result = status["result"]
    assert result["status"] == "stored"
    assert result["path"].startswith("exports/timeline-")
    assert "/media/" in result["served"]["stream_url"]
    assert "/download/" in result["served"]["download_url"]

    media = client.get(f"/api/projects/{project_name}/media")
    assert media.status_code == 200
    rel_paths = {item["relative_path"] for item in media.json()["media"]}
    assert result["path"] in rel_paths



def test_compose_upload_batch_accepts_job_and_cleans_temp_root(client, monkeypatch):
    from app.config import get_settings

    temp_root = get_settings().temp_root
    created = client.post("/api/projects", json={"name": "compose-upload"})
    project_name = created.json()["name"]

    _patch_compose_runtime(monkeypatch)

    response = client.post(
        f"/api/projects/{project_name}/compose/upload?output_name=final-cut&target_dir=exports&mode=auto",
        files=[
            ("files", ("one.mp4", b"111", "video/mp4")),
            ("files", ("two.mp4", b"222", "video/mp4")),
        ],
    )
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "accepted"

    status = _await_compose_job(client, project_name, body["job_id"])
    assert status["status"] == "completed"
    assert status["result"]["path"].startswith("exports/final-cut-")
    assert temp_root.exists()
    assert not any(path.name.startswith("compose_") for path in temp_root.iterdir() if path.name != "compose_jobs")



def test_compose_upload_incremental_queues_last_clip_and_cleans_session(client, monkeypatch):
    from app.config import get_settings

    temp_root = get_settings().temp_root
    created = client.post("/api/projects", json={"name": "compose-incremental"})
    project_name = created.json()["name"]

    _patch_compose_runtime(monkeypatch)

    first = client.post(
        f"/api/projects/{project_name}/compose/upload?output_name=shortcut-cut&target_dir=exports",
        headers={"X-Compose-Time": "1710000000000", "X-Compose-Index": "1", "X-Compose-Count": "2"},
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert first.status_code == 202
    assert first.json()["status"] == "staged"

    second = client.post(
        f"/api/projects/{project_name}/compose/upload?output_name=shortcut-cut&target_dir=exports",
        headers={"X-Compose-Time": "1710000000000", "X-Compose-Index": "2", "X-Compose-Count": "2"},
        files=[("files", ("two.mp4", b"222", "video/mp4"))],
    )
    assert second.status_code == 202
    body = second.json()
    assert body["status"] == "accepted"
    assert body["flow"] == "upload_incremental"

    status = _await_compose_job(client, project_name, body["job_id"])
    assert status["status"] == "completed"
    assert not any(path.name.startswith("compose_session_") for path in temp_root.iterdir())



def test_compose_status_reports_background_failure(client, monkeypatch):
    created = client.post("/api/projects", json={"name": "compose-fail"})
    project_name = created.json()["name"]
    upload = client.post(
        f"/api/projects/{project_name}/upload",
        files={"file": ("a.mp4", b"aaa", "video/mp4")},
    )
    assert upload.status_code == 200

    _patch_compose_runtime(monkeypatch, fail=True)

    response = client.post(
        f"/api/projects/{project_name}/compose",
        json={
            "inputs": [upload.json()["path"]],
            "output_name": "boom",
            "target_dir": "exports",
            "mode": "auto",
        },
    )
    assert response.status_code == 202

    status = _await_compose_job(client, project_name, response.json()["job_id"])
    assert status["status"] == "failed"
    assert status["error_status_code"] == 500
    assert "ffmpeg failure simulated" in status["error"]



def test_compose_upload_source_urls_include_source_query(client, monkeypatch, tmp_path: Path):
    source_root = tmp_path / "compose-alt"
    source_root.mkdir(parents=True, exist_ok=True)

    create_source = client.post("/api/sources", json={"name": "alt", "root": str(source_root), "type": "local"})
    assert create_source.status_code == 201
    created = client.post("/api/projects", params={"source": "alt"}, json={"name": "compose-source"})
    assert created.status_code == 201
    project_name = created.json()["name"]

    _patch_compose_runtime(monkeypatch)

    response = client.post(
        f"/api/projects/{project_name}/compose/upload",
        params={"source": "alt", "output_name": "sourced.mp4"},
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert response.status_code == 202
    status = _await_compose_job(client, project_name, response.json()["job_id"], source="alt")
    body = status["result"]
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



def test_compose_upload_invalid_output_name_returns_400(client):
    created = client.post("/api/projects", json={"name": "compose-invalid-output"})
    project_name = created.json()["name"]

    response = client.post(
        f"/api/projects/{project_name}/compose/upload",
        params={"output_name": "../evil.mp4"},
        files=[("files", ("one.mp4", b"111", "video/mp4"))],
    )
    assert response.status_code == 400



def test_preprocessor_preserves_mixed_media_order(monkeypatch, tmp_path: Path):
    preprocessor = ComposePreprocessor()
    a_video = tmp_path / "a.mp4"
    an_image = tmp_path / "b.png"
    b_video = tmp_path / "c.mov"
    a_video.write_bytes(b"video-a")
    an_image.write_bytes(b"image-b")
    b_video.write_bytes(b"video-c")

    monkeypatch.setattr("app.api.compose._display_geometry_for_asset", lambda _asset: (1920, 1080))

    def _fake_normalize_video(input_path: Path, output_path: Path, **_kwargs) -> Path:
        output_path.write_text(f"video:{input_path.name}", encoding="utf-8")
        return output_path

    def _fake_normalize_image(input_path: Path, output_path: Path, **_kwargs) -> Path:
        output_path.write_text(f"image:{input_path.name}", encoding="utf-8")
        return output_path

    monkeypatch.setattr("app.api.compose._normalize_video_segment", _fake_normalize_video)
    monkeypatch.setattr("app.api.compose._normalize_image_segment", _fake_normalize_image)

    prepared = preprocessor.prepare(
        [
            InputAsset(path=a_video, kind="video"),
            InputAsset(path=an_image, kind="image"),
            InputAsset(path=b_video, kind="video"),
        ],
        tmp_path,
    )

    assert [segment.source_kind for segment in prepared] == ["video", "image", "video"]
    assert [segment.path.name for segment in prepared] == ["segment_0000.mp4", "segment_0001.mp4", "segment_0002.mp4"]
    assert [segment.generated for segment in prepared] == [True, True, True]



def test_supported_inputs_still_reject_audio(tmp_path: Path):
    audio = InputAsset(path=tmp_path / "tone.wav", kind="audio")
    with pytest.raises(HTTPException) as exc:
        _validate_supported_inputs([audio])
    assert "Unsupported inputs" in exc.value.detail
