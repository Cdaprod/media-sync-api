from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


def _load_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "compose_repro.py"
    spec = importlib.util.spec_from_file_location("compose_repro", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_build_existing_compose_payload_trims_and_preserves_order():
    module = _load_module()

    payload = module.build_existing_compose_payload(
        [" ingest/originals/a.mov ", "", "exports/../ignored", "ingest/originals/b.mov"],
        output_name=" repro-output.mp4 ",
        mode="encode",
        target_dir=" exports ",
    )

    assert payload == {
        "inputs": ["ingest/originals/a.mov", "exports/../ignored", "ingest/originals/b.mov"],
        "output_name": "repro-output.mp4",
        "target_dir": "exports",
        "mode": "encode",
    }


def test_build_existing_compose_payload_requires_inputs():
    module = _load_module()

    with pytest.raises(ValueError, match="At least one --relative-path is required"):
        module.build_existing_compose_payload([], output_name="out.mp4", mode="encode", target_dir="exports")


def test_compose_job_status_url_quotes_project_and_source():
    module = _load_module()

    url = module.compose_job_status_url(
        "http://127.0.0.1:8787/",
        "P1 Demo/Clips",
        "job 123",
        source="alt source",
    )

    assert url == "http://127.0.0.1:8787/api/projects/P1%20Demo/Clips/compose/jobs/job%20123?source=alt%20source"


def test_extract_compose_job_log_lines_filters_to_single_job_and_known_events():
    module = _load_module()

    lines = [
        "media-sync-api | INFO compose_request_received job_id=job-1 project=demo",
        "media-sync-api | INFO unrelated_event job_id=job-1",
        "media-sync-api | INFO compose_output_probe job_id=job-2 path=wrong",
        "media-sync-api | INFO compose_output_probe job_id=job-1 path=correct",
        "media-sync-api | INFO compose_job_completed job_id=job-1 status=completed",
    ]

    assert module.extract_compose_job_log_lines(lines, "job-1") == [
        "media-sync-api | INFO compose_request_received job_id=job-1 project=demo",
        "media-sync-api | INFO compose_output_probe job_id=job-1 path=correct",
        "media-sync-api | INFO compose_job_completed job_id=job-1 status=completed",
    ]
