#!/usr/bin/env python3
"""Submit a compose repro job and optionally capture correlated lifecycle logs.

Example:
    python scripts/compose_repro.py \
      --project P1-Demo \
      --output-name repro-portrait-set \
      --mode encode \
      --relative-path ingest/originals/clip-a.mov \
      --relative-path ingest/originals/clip-b.mov \
      --docker-service media-sync-api \
      --save-log-block /tmp/compose-job.log
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence
from urllib import error, parse, request

COMPOSE_LIFECYCLE_EVENTS = (
    "compose_request_received",
    "compose_probe_started",
    "compose_probe_input",
    "compose_strategy_selected",
    "compose_strategy_confirmed",
    "compose_normalize_started",
    "compose_normalize_input",
    "compose_normalize_completed",
    "compose_normalized_probe",
    "compose_normalized_validation_failed",
    "compose_concat_started",
    "compose_copy_fallback",
    "compose_output_probe",
    "compose_output_validation_failed",
    "compose_job_completed",
    "compose_job_failed",
    "compose_job_unexpected_failure",
)


def build_existing_compose_payload(
    relative_paths: Sequence[str],
    *,
    output_name: str,
    mode: str,
    target_dir: str,
) -> dict[str, object]:
    """Build the existing-assets compose submission payload."""
    cleaned_paths = [path.strip() for path in relative_paths if path and path.strip()]
    if not cleaned_paths:
        raise ValueError("At least one --relative-path is required")
    if not output_name.strip():
        raise ValueError("--output-name is required")
    if mode not in {"auto", "copy", "encode"}:
        raise ValueError(f"Unsupported mode '{mode}'")
    return {
        "inputs": cleaned_paths,
        "output_name": output_name.strip(),
        "target_dir": target_dir.strip() or "exports",
        "mode": mode,
    }


def compose_job_status_url(base_url: str, project: str, job_id: str, *, source: str) -> str:
    """Return the project-scoped compose job status URL."""
    return (
        f"{base_url.rstrip('/')}/api/projects/{parse.quote(project)}/compose/jobs/{parse.quote(job_id)}"
        f"?source={parse.quote(source)}"
    )


def extract_compose_job_log_lines(lines: Iterable[str], job_id: str) -> list[str]:
    """Filter raw logs down to lines for a single compose job lifecycle."""
    selected: list[str] = []
    for line in lines:
        if job_id not in line:
            continue
        if any(event in line for event in COMPOSE_LIFECYCLE_EVENTS):
            selected.append(line)
    return selected


class ApiError(RuntimeError):
    """Raised when the compose API returns a failing response."""



def _request_json(method: str, url: str, payload: dict[str, object] | None, *, timeout: float) -> dict[str, object]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ApiError(f"HTTP {exc.code} calling {url}: {detail}") from exc
    except error.URLError as exc:
        raise ApiError(f"Failed to reach {url}: {exc.reason}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(f"Non-JSON response from {url}: {raw[:500]}") from exc



def submit_compose_existing(
    *,
    base_url: str,
    project: str,
    source: str,
    payload: dict[str, object],
    timeout: float,
) -> dict[str, object]:
    """Submit an existing-assets compose request and return the job envelope."""
    url = f"{base_url.rstrip('/')}/api/projects/{parse.quote(project)}/compose?source={parse.quote(source)}"
    return _request_json("POST", url, payload, timeout=timeout)



def poll_compose_job(
    *,
    base_url: str,
    project: str,
    job_id: str,
    source: str,
    timeout_seconds: float,
    interval_seconds: float,
    request_timeout: float,
) -> dict[str, object]:
    """Poll compose job status until it settles or times out."""
    deadline = time.monotonic() + timeout_seconds
    status_url = compose_job_status_url(base_url, project, job_id, source=source)
    last_payload: dict[str, object] | None = None
    while time.monotonic() < deadline:
        last_payload = _request_json("GET", status_url, None, timeout=request_timeout)
        status = str(last_payload.get("status", ""))
        if status in {"completed", "failed"}:
            return last_payload
        time.sleep(interval_seconds)
    raise ApiError(f"Compose job {job_id} did not settle within {timeout_seconds:.1f}s: {last_payload}")



def collect_docker_compose_logs(*, compose_file: str, service: str, since: str) -> list[str]:
    """Collect docker compose logs for a service since a given UTC timestamp."""
    command = ["docker", "compose", "-f", compose_file, "logs", service, "--since", since]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"docker compose logs failed: {stderr}")
    return completed.stdout.splitlines()



def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8787", help="API base URL. Default: http://127.0.0.1:8787")
    parser.add_argument("--project", required=True, help="Project name, for example P1-Demo")
    parser.add_argument("--source", default="primary", help="Source registry name. Default: primary")
    parser.add_argument("--output-name", required=True, help="Compose output basename/path, for example repro-portrait-set.mp4")
    parser.add_argument("--target-dir", default="exports", help="Project-relative target dir. Default: exports")
    parser.add_argument("--mode", default="encode", choices=["auto", "copy", "encode"], help="Compose mode. Default: encode")
    parser.add_argument(
        "--relative-path",
        action="append",
        dest="relative_paths",
        default=[],
        help="Project-relative input path. Repeat for each input clip in timeline order.",
    )
    parser.add_argument("--poll-interval", type=float, default=1.0, help="Seconds between status polls. Default: 1.0")
    parser.add_argument("--timeout", type=float, default=180.0, help="Overall settle timeout in seconds. Default: 180")
    parser.add_argument("--request-timeout", type=float, default=30.0, help="Per-request timeout in seconds. Default: 30")
    parser.add_argument(
        "--docker-service",
        help="Optional docker compose service name to scrape logs for this job_id after submission, for example media-sync-api.",
    )
    parser.add_argument(
        "--compose-file",
        default="docker/docker-compose.yaml",
        help="docker compose file used with --docker-service. Default: docker/docker-compose.yaml",
    )
    parser.add_argument(
        "--save-log-block",
        help="Optional path to save the filtered compose lifecycle log block when --docker-service is provided.",
    )
    return parser



def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        payload = build_existing_compose_payload(
            args.relative_paths,
            output_name=args.output_name,
            mode=args.mode,
            target_dir=args.target_dir,
        )
        started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        envelope = submit_compose_existing(
            base_url=args.base_url,
            project=args.project,
            source=args.source,
            payload=payload,
            timeout=args.request_timeout,
        )
        job_id = str(envelope.get("job_id") or "")
        if not job_id:
            raise ApiError(f"Compose submit response did not include job_id: {envelope}")
        print(json.dumps({"submitted": envelope}, indent=2, sort_keys=True))

        settled = poll_compose_job(
            base_url=args.base_url,
            project=args.project,
            job_id=job_id,
            source=args.source,
            timeout_seconds=args.timeout,
            interval_seconds=args.poll_interval,
            request_timeout=args.request_timeout,
        )
        print(json.dumps({"settled": settled}, indent=2, sort_keys=True))

        if args.docker_service:
            lines = collect_docker_compose_logs(
                compose_file=args.compose_file,
                service=args.docker_service,
                since=started_at,
            )
            selected = extract_compose_job_log_lines(lines, job_id)
            print("\n# compose lifecycle log block")
            print("\n".join(selected) if selected else f"No compose lifecycle lines found for job_id={job_id}")
            if args.save_log_block:
                output_path = Path(args.save_log_block)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_text("\n".join(selected) + ("\n" if selected else ""), encoding="utf-8")
                print(f"Saved filtered log block to {output_path}")

        status = str(settled.get("status", ""))
        return 0 if status == "completed" else 1
    except (ApiError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
