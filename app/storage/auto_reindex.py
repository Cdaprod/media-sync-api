"""Background auto-reindexer for media-sync-api projects.

Usage:
    reindexer = AutoReindexer(project_root, interval_seconds=60)
    reindexer.start()
    # ... later ...
    reindexer.stop()
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

from app.storage.reindex import reindex_project
from app.storage.sources import SourceRegistry


logger = logging.getLogger("media_sync_api.auto_reindex")


ProjectSignature = Tuple[float, int, int]


@dataclass
class AutoReindexer:
    project_root: Path
    interval_seconds: int = 60
    enabled: bool = True

    def __post_init__(self) -> None:
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._signatures: Dict[Tuple[str, str], ProjectSignature] = {}

    def start(self) -> None:
        """Start the background reindex loop (idempotent)."""

        if not self.enabled:
            logger.info("auto_reindex_disabled")
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="auto-reindex", daemon=True)
        self._thread.start()
        logger.info("auto_reindex_started", extra={"interval": self.interval_seconds})

    def stop(self) -> None:
        """Stop the background reindex loop."""

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            self._scan_sources()
            self._stop_event.wait(self.interval_seconds)

    def _scan_sources(self) -> None:
        registry = SourceRegistry(self.project_root)
        sources = registry.list_enabled()
        for source in sources:
            if not source.accessible:
                continue
            for project_path in source.root.iterdir() if source.root.exists() else []:
                if not project_path.is_dir() or project_path.name.startswith("_"):
                    continue
                self._scan_project(source.name, project_path)

    def _scan_project(self, source_name: str, project_path: Path) -> None:
        signature = _project_signature(project_path)
        key = (source_name, project_path.name)
        previous = self._signatures.get(key)
        if previous is None:
            self._signatures[key] = signature
            return
        if signature != previous:
            try:
                logger.info(
                    "auto_reindex_triggered",
                    extra={"project": project_path.name, "source": source_name},
                )
                reindex_project(project_path)
                self._signatures[key] = _project_signature(project_path)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning(
                    "auto_reindex_failed",
                    extra={"project": project_path.name, "source": source_name, "error": str(exc)},
                )


def _project_signature(project_path: Path) -> ProjectSignature:
    """Return a lightweight signature for project media changes."""

    ingest_root = project_path / "ingest" / "originals"
    latest_mtime = 0.0
    total_size = 0
    file_count = 0
    for file_path in ingest_root.rglob("*") if ingest_root.exists() else []:
        if file_path.is_dir():
            continue
        stat = file_path.stat()
        latest_mtime = max(latest_mtime, stat.st_mtime)
        total_size += stat.st_size
        file_count += 1
    return (latest_mtime, file_count, total_size)
