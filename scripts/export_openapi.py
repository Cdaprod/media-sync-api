"""Export FastAPI OpenAPI schema to docs/architecture/openapi.json.

Example:
    python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    """Export schema and return process exit code."""

    repo_root = Path(__file__).resolve().parents[1]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    try:
        from app.main import app
    except Exception as exc:  # pragma: no cover - defensive import path
        print(f"Failed to import app.main: {exc}", file=sys.stderr)
        return 1

    output = Path("docs/architecture/openapi.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        payload = app.openapi()
    except Exception as exc:  # pragma: no cover - defensive schema path
        print(f"Failed to build OpenAPI schema: {exc}", file=sys.stderr)
        return 2

    output.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
