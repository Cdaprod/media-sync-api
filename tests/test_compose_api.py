from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.compose import (
    ComposeExecutor,
    ComposePlan,
    ComposePlanner,
    ComposePreprocessor,
    ComposeResult,
    ComposeService,
    InputAsset,
    PreparedSegment,
    _analyze_copy_compatibility,
    _normalize_video_segment,
    _validate_encode_probe,
    _validate_supported_inputs,
)


def _patch_compose_runtime(monkeypatch, *, fail: bool = False) -> None:
    def _fake_prepare(self, assets, work_dir, job_id=None):
        work_dir.mkdir(parents=True, exist_ok=True)
        return [
            PreparedSegment(path=asset.path, source_kind=asset.kind, generated=False)
            for asset in assets
        ]

    def _fake_execute(self, plan, job_id=None):
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
    monkeypatch.setattr("app.api.compose._display_geometry_for_asset", lambda _asset: (1920, 1080))
    monkeypatch.setattr(
        "app.api.compose._probe_media_summary",
        lambda path: {
            "path": Path(path).name,
            "video_codec": "h264",
            "video_pix_fmt": "yuv420p",
            "video_width": 1920,
            "video_height": 1080,
            "video_avg_frame_rate": "30000/1001",
            "rotate": 0,
            "audio_codec": "aac",
            "audio_sample_rate": "48000",
            "audio_channels": "2",
            "audio_start_time": "0.0",
            "video_start_time": "0.0",
            "duration_seconds": 1.0,
        },
    )


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
    monkeypatch.setattr(
        "app.api.compose._probe_media_summary",
        lambda path: {
            "path": Path(path).name,
            "video_codec": "h264",
            "video_pix_fmt": "yuv420p",
            "video_width": 1920,
            "video_height": 1080,
            "video_avg_frame_rate": "30000/1001",
            "rotate": 0,
            "audio_codec": "aac",
            "audio_sample_rate": "48000",
            "audio_channels": "2",
            "audio_start_time": "0.0",
            "video_start_time": "0.0",
            "duration_seconds": 1.0,
        },
    )

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


def test_auto_mode_rejects_conservative_copy_mismatch_reasons():
    assets = [
        InputAsset(
            path=Path('one.mov'),
            kind='video',
            signature={
                'format_name': 'mov,mp4,m4a,3gp,3g2,mj2',
                'video_codec': 'h264',
                'video_profile': 'High',
                'video_pix_fmt': 'yuv420p',
                'video_width': '1920',
                'video_height': '1080',
                'video_sar': '1:1',
                'video_dar': '16:9',
                'video_avg_frame_rate': '30000/1001',
                'video_r_frame_rate': '30000/1001',
                'video_time_base': '1/600',
                'video_codec_tag': 'avc1',
                'video_field_order': 'progressive',
                'video_has_b_frames': '2',
                'video_level': '40',
                'video_start_time': '0.000000',
                'audio_codec': 'aac',
                'audio_profile': 'LC',
                'audio_sample_rate': '48000',
                'audio_channels': '2',
                'audio_channel_layout': 'stereo',
                'audio_time_base': '1/48000',
                'audio_start_time': '0.000000',
            },
        ),
        InputAsset(
            path=Path('two.mov'),
            kind='video',
            signature={
                'format_name': 'mov,mp4,m4a,3gp,3g2,mj2',
                'video_codec': 'h264',
                'video_profile': 'High',
                'video_pix_fmt': 'yuv420p',
                'video_width': '1920',
                'video_height': '1080',
                'video_sar': '1:1',
                'video_dar': '16:9',
                'video_avg_frame_rate': '60000/1001',
                'video_r_frame_rate': '60000/1001',
                'video_time_base': '1/1200',
                'video_codec_tag': 'avc1',
                'video_field_order': 'progressive',
                'video_has_b_frames': '2',
                'video_level': '40',
                'video_start_time': '0.033367',
                'audio_codec': 'aac',
                'audio_profile': 'LC',
                'audio_sample_rate': '48000',
                'audio_channels': '2',
                'audio_channel_layout': 'stereo',
                'audio_time_base': '1/48000',
                'audio_start_time': '0.000000',
            },
        ),
    ]

    compatible, reasons = _analyze_copy_compatibility(assets)

    assert compatible is False
    assert reasons == ['signature_mismatch:video_avg_frame_rate,video_r_frame_rate,video_start_time,video_time_base']


def test_auto_mode_logs_selected_encode_when_copy_is_not_safe(caplog):
    planner = ComposePlanner()
    assets = [
        InputAsset(path=Path('one.mov'), kind='video', signature={'format_name': 'mov,mp4,m4a,3gp,3g2,mj2'}),
        InputAsset(path=Path('two.mp4'), kind='video', signature={'format_name': 'mov,mp4,m4a,3gp,3g2,mj2'}),
    ]

    with caplog.at_level('INFO', logger='media_sync_api.compose'):
        selected, reasons = planner._select_strategy('auto', assets)

    assert selected == 'encode'
    assert reasons == ['mixed_container_suffixes']
    assert 'compose_strategy_selected requested_mode=auto selected_strategy=encode' in caplog.text
    assert 'mixed_container_suffixes' in caplog.text


def test_copy_mode_rejection_includes_reason_details():
    planner = ComposePlanner()

    with pytest.raises(HTTPException) as exc:
        planner._select_strategy(
            'copy',
            [
                InputAsset(path=Path('one.mp4'), kind='video', signature={'format_name': 'mov,mp4'}),
                InputAsset(path=Path('two.png'), kind='image', signature={'format_name': 'image2'}),
            ],
        )

    assert exc.value.status_code == 400
    assert 'non_video_inputs:image' in exc.value.detail


def test_copy_executor_uses_concat_demuxer_and_logs_command(tmp_path: Path, monkeypatch, caplog):
    first = tmp_path / "a.mp4"
    second = tmp_path / "b.mp4"
    output = tmp_path / "out.mp4"
    first.write_bytes(b"a")
    second.write_bytes(b"b")

    calls: list[list[str]] = []

    def _fake_run(command, capture_output=True, text=True):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.api.compose.subprocess.run", _fake_run)

    plan = ComposePlan(
        input_paths=[first, second],
        output_path=output,
        strategy="copy",
        requested_mode="copy",
        strategy_reasons=["copy_safe"],
        input_assets=[
            InputAsset(path=first, kind="video", signature={"format_name": "mov,mp4"}),
            InputAsset(path=second, kind="video", signature={"format_name": "mov,mp4"}),
        ],
        prepared_segments=[
            PreparedSegment(path=first, source_kind="video", generated=False),
            PreparedSegment(path=second, source_kind="video", generated=False),
        ],
    )

    with caplog.at_level("INFO", logger="media_sync_api.compose"):
        result = ComposeExecutor().execute(plan, job_id="job-copy")

    assert result.mode_used == "copy"
    assert calls
    assert calls[0][:5] == ["ffmpeg", "-n", "-f", "concat", "-safe"]
    assert "compose_concat_started" in caplog.text
    assert "mechanism=concat_demuxer_copy" in caplog.text
    assert "job_id=job-copy" in caplog.text


def test_encode_executor_prefers_concat_demuxer_copy_for_normalized_segments(tmp_path: Path, monkeypatch, caplog):
    first = tmp_path / "segment_0000.mp4"
    second = tmp_path / "segment_0001.mp4"
    output = tmp_path / "out.mp4"
    first.write_bytes(b"a")
    second.write_bytes(b"b")

    calls: list[list[str]] = []

    def _fake_run(command, capture_output=True, text=True):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.api.compose.subprocess.run", _fake_run)

    plan = ComposePlan(
        input_paths=[first, second],
        output_path=output,
        strategy="encode",
        requested_mode="encode",
        strategy_reasons=["requested_encode"],
        input_assets=[
            InputAsset(path=first, kind="video", signature={"format_name": "mov,mp4"}),
            InputAsset(path=second, kind="video", signature={"format_name": "mov,mp4"}),
        ],
        prepared_segments=[
            PreparedSegment(path=first, source_kind="video", generated=True),
            PreparedSegment(path=second, source_kind="video", generated=True),
        ],
    )

    with caplog.at_level("INFO", logger="media_sync_api.compose"):
        result = ComposeExecutor().execute(plan, job_id="job-encode")

    assert result.mode_used == "encode"
    assert calls
    command = calls[0]
    assert command[:8] == ["ffmpeg", "-n", "-fflags", "+genpts", "-avoid_negative_ts", "make_zero", "-f", "concat"]
    assert "-c" in command
    assert command[command.index("-c") + 1] == "copy"
    assert "-filter_complex" not in command
    assert "compose_concat_started" in caplog.text
    assert "mechanism=concat_demuxer_copy_normalized" in caplog.text


def test_encode_executor_falls_back_to_filter_concat_when_normalized_copy_join_fails(tmp_path: Path, monkeypatch, caplog):
    first = tmp_path / "segment_0000.mp4"
    second = tmp_path / "segment_0001.mp4"
    output = tmp_path / "out.mp4"
    first.write_bytes(b"a")
    second.write_bytes(b"b")

    calls: list[list[str]] = []

    def _fake_run(command, capture_output=True, text=True):
        calls.append(command)
        if len(calls) == 1:
            return subprocess.CompletedProcess(command, 1, "", "copy join failed")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.api.compose.subprocess.run", _fake_run)

    plan = ComposePlan(
        input_paths=[first, second],
        output_path=output,
        strategy="encode",
        requested_mode="encode",
        strategy_reasons=["requested_encode"],
        input_assets=[
            InputAsset(path=first, kind="video", signature={"format_name": "mov,mp4"}),
            InputAsset(path=second, kind="video", signature={"format_name": "mov,mp4"}),
        ],
        prepared_segments=[
            PreparedSegment(path=first, source_kind="video", generated=True),
            PreparedSegment(path=second, source_kind="video", generated=True),
        ],
    )

    with caplog.at_level("INFO", logger="media_sync_api.compose"):
        result = ComposeExecutor().execute(plan, job_id="job-encode-fallback")

    assert result.mode_used == "encode"
    assert len(calls) == 2
    assert "-filter_complex" in calls[1]
    filter_index = calls[1].index("-filter_complex")
    filter_graph = calls[1][filter_index + 1]
    assert "concat=n=2:v=1:a=1" in filter_graph
    assert "compose_normalized_concat_fallback" in caplog.text
    assert "mechanism=filter_concat_encode" in caplog.text


def test_normalize_video_segment_without_audio_adds_silent_track(tmp_path: Path, monkeypatch):
    input_path = tmp_path / "clip.mov"
    output_path = tmp_path / "normalized.mp4"
    input_path.write_bytes(b"video")

    commands: list[list[str]] = []

    monkeypatch.setattr("app.api.compose._probe_video_geometry", lambda _path: {"width": 1920, "height": 1080, "rotate": 0})

    def _fake_run(command, capture_output=True, text=True):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.api.compose.subprocess.run", _fake_run)

    normalized = _normalize_video_segment(
        input_path,
        output_path,
        has_audio=False,
        target_width=1920,
        target_height=1080,
    )

    assert normalized == output_path
    assert commands
    command = commands[0]
    assert "anullsrc=channel_layout=stereo:sample_rate=48000" in command
    vf_arg = command[command.index("-vf") + 1]
    assert "fps=30000/1001:round=near" in vf_arg
    assert "settb=1001/30000" in vf_arg
    assert "setpts=N/(30000/1001*TB)" in vf_arg
    af_arg = command[command.index("-af") + 1]
    assert "asettb=1/48000" in af_arg
    assert command[command.index("-fps_mode") + 1] == "cfr"


def test_validate_encode_probe_rejects_audio_video_duration_drift():
    summary = {
        "video_codec": "h264",
        "video_pix_fmt": "yuv420p",
        "video_width": 1080,
        "video_height": 1920,
        "video_avg_frame_rate": "30000/1001",
        "rotate": 0,
        "audio_codec": "aac",
        "audio_sample_rate": "48000",
        "audio_channels": "2",
        "video_start_time": "0.0",
        "audio_start_time": "0.0",
        "video_duration_seconds": 4.0,
        "audio_duration_seconds": 4.3,
        "av_duration_delta_seconds": 0.3,
        "duration_seconds": 4.3,
    }

    issues = _validate_encode_probe(summary, target_width=1080, target_height=1920)

    assert "av_duration_delta_seconds:0.3" in issues


def test_preprocessor_logs_normalized_probe_and_validates(monkeypatch, tmp_path: Path, caplog):
    preprocessor = ComposePreprocessor()
    clip = tmp_path / "clip.mov"
    clip.write_bytes(b"clip")

    monkeypatch.setattr("app.api.compose._display_geometry_for_asset", lambda _asset: (1920, 1080))

    def _fake_normalize_video(input_path: Path, output_path: Path, **_kwargs) -> Path:
        output_path.write_bytes(f"normalized:{input_path.name}".encode("utf-8"))
        return output_path

    monkeypatch.setattr("app.api.compose._normalize_video_segment", _fake_normalize_video)
    monkeypatch.setattr(
        "app.api.compose._probe_media_summary",
        lambda path: {
            "path": Path(path).name,
            "video_codec": "h264",
            "video_pix_fmt": "yuv420p",
            "video_width": 1920,
            "video_height": 1080,
            "video_avg_frame_rate": "30000/1001",
            "rotate": 0,
            "audio_codec": "aac",
            "audio_sample_rate": "48000",
            "audio_channels": "2",
            "audio_start_time": "0.0",
            "video_start_time": "0.0",
            "duration_seconds": 1.0,
        },
    )

    with caplog.at_level("INFO", logger="media_sync_api.compose"):
        prepared = preprocessor.prepare(
            [InputAsset(path=clip, kind="video", signature={"audio_codec": "aac"})],
            tmp_path,
            job_id="job-norm",
        )

    assert len(prepared) == 1
    assert prepared[0].generated is True
    assert "compose_normalized_probe" in caplog.text
    assert "job_id=job-norm" in caplog.text


def test_compose_service_logs_probe_strategy_and_output_validation(monkeypatch, tmp_path: Path, caplog):
    first = tmp_path / "a.mov"
    second = tmp_path / "b.mov"
    output = tmp_path / "compiled-0001.mp4"
    first.write_bytes(b"a")
    second.write_bytes(b"b")
    output.write_bytes(b"out")

    service = ComposeService()
    ctx = type("Ctx", (), {
        "project_name": "demo",
        "source_name": "primary",
        "project_root": tmp_path,
    })()
    spec = type("Spec", (), {"mode": "auto"})()
    plan = ComposePlan(
        input_paths=[first, second],
        output_path=output,
        strategy="encode",
        requested_mode="auto",
        strategy_reasons=["signature_mismatch:video_time_base"],
        input_assets=[
            InputAsset(path=first, kind="video", signature={"format_name": "mov,mp4"}),
            InputAsset(path=second, kind="video", signature={"format_name": "mov,mp4"}),
        ],
    )

    monkeypatch.setattr(service.planner, "build_staged_plan", lambda _ctx, _paths, _spec: plan)
    monkeypatch.setattr(service.preprocessor, "prepare", lambda assets, work_dir, job_id=None: [
        PreparedSegment(path=first, source_kind="video", generated=True),
        PreparedSegment(path=second, source_kind="video", generated=True),
    ])
    monkeypatch.setattr(service.executor, "execute", lambda plan, job_id=None: ComposeResult(output_path=output, mode_used=plan.strategy))
    monkeypatch.setattr(service.registrar, "register", lambda _ctx, result, _base_url: {"path": result.output_path.name})
    monkeypatch.setattr(
        "app.api.compose._probe_media_summary",
        lambda path: {
            "path": Path(path).name,
            "video_codec": "h264",
            "video_pix_fmt": "yuv420p",
            "video_width": 1920,
            "video_height": 1080,
            "video_avg_frame_rate": "30000/1001",
            "rotate": 0,
            "audio_codec": "aac",
            "audio_sample_rate": "48000",
            "audio_channels": "2",
            "audio_start_time": "0.0",
            "video_start_time": "0.0",
            "duration_seconds": 2.0,
        },
    )
    monkeypatch.setattr("app.api.compose._display_geometry_for_asset", lambda _asset: (1920, 1080))

    with caplog.at_level("INFO", logger="media_sync_api.compose"):
        result = service.compose_staged_paths(ctx, spec, [first, second], "http://localhost:8787", work_dir=tmp_path, job_id="job-observe")

    assert result == {"path": output.name}
    assert "compose_probe_started" in caplog.text
    assert "compose_probe_input" in caplog.text
    assert "compose_strategy_confirmed" in caplog.text
    assert "compose_output_probe" in caplog.text
    assert "job_id=job-observe" in caplog.text


def test_compose_service_blocks_registration_when_output_probe_invalid(monkeypatch, tmp_path: Path):
    first = tmp_path / "a.mov"
    second = tmp_path / "b.mov"
    output = tmp_path / "compiled-0001.mp4"
    first.write_bytes(b"a")
    second.write_bytes(b"b")
    output.write_bytes(b"broken")

    service = ComposeService()
    ctx = type("Ctx", (), {
        "project_name": "demo",
        "source_name": "primary",
        "project_root": tmp_path,
    })()
    spec = type("Spec", (), {"mode": "encode"})()
    plan = ComposePlan(
        input_paths=[first, second],
        output_path=output,
        strategy="encode",
        requested_mode="encode",
        strategy_reasons=["requested_encode"],
        input_assets=[
            InputAsset(path=first, kind="video", signature={"format_name": "mov,mp4"}),
            InputAsset(path=second, kind="video", signature={"format_name": "mov,mp4"}),
        ],
    )

    monkeypatch.setattr(service.planner, "build_staged_plan", lambda _ctx, _paths, _spec: plan)
    monkeypatch.setattr(service.preprocessor, "prepare", lambda assets, work_dir, job_id=None: [
        PreparedSegment(path=first, source_kind="video", generated=True),
        PreparedSegment(path=second, source_kind="video", generated=True),
    ])
    monkeypatch.setattr(service.executor, "execute", lambda plan, job_id=None: ComposeResult(output_path=output, mode_used=plan.strategy))
    register_calls: list[str] = []
    monkeypatch.setattr(service.registrar, "register", lambda _ctx, result, _base_url: register_calls.append(result.output_path.name))
    monkeypatch.setattr("app.api.compose._display_geometry_for_asset", lambda _asset: (1920, 1080))

    def _fake_probe(path: Path):
        if Path(path) == output:
            return {
                "path": output.name,
                "video_codec": "",
                "video_pix_fmt": "",
                "video_width": 0,
                "video_height": 0,
                "video_avg_frame_rate": "",
                "rotate": 0,
                "audio_codec": "",
                "audio_sample_rate": "",
                "audio_channels": "",
                "audio_start_time": "",
                "video_start_time": "",
                "duration_seconds": 0,
            }
        return {
            "path": Path(path).name,
            "video_codec": "h264",
            "video_pix_fmt": "yuv420p",
            "video_width": 1920,
            "video_height": 1080,
            "video_avg_frame_rate": "30000/1001",
            "rotate": 0,
            "audio_codec": "aac",
            "audio_sample_rate": "48000",
            "audio_channels": "2",
            "audio_start_time": "0.0",
            "video_start_time": "0.0",
            "duration_seconds": 1.0,
        }

    monkeypatch.setattr("app.api.compose._probe_media_summary", _fake_probe)

    with pytest.raises(HTTPException) as exc:
        service.compose_staged_paths(ctx, spec, [first, second], "http://localhost:8787", work_dir=tmp_path, job_id="job-invalid")

    assert "Compose output validation failed" in exc.value.detail
    assert register_calls == []
    assert output.exists() is False
