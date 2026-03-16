#!/usr/bin/env bash
# explorer_screenshot_smoke.sh validates explorer screenshot routes before capture.
# Usage: scripts/explorer_screenshot_smoke.sh <static|package> [url]
# Example: scripts/explorer_screenshot_smoke.sh static "http://127.0.0.1:8000/public/explorer.html?mock=1"
# Example: scripts/explorer_screenshot_smoke.sh package "http://127.0.0.1:8790/?mock=1"

set -euo pipefail

MODE="${1:-}"
URL_OVERRIDE="${2:-}"

if [[ -z "${MODE}" ]]; then
  echo "error: mode is required (static|package)" >&2
  exit 64
fi

case "${MODE}" in
  static)
    URL="${URL_OVERRIDE:-http://127.0.0.1:8000/public/explorer.html?mock=1}"
    CONTENT_PROBE='id="brandTitle"'
    ;;
  package)
    URL="${URL_OVERRIDE:-http://127.0.0.1:8790/?mock=1}"
    CONTENT_PROBE='data-ui-hook="explorer-app-shell"'
    ;;
  *)
    echo "error: unsupported mode '${MODE}' (expected static|package)" >&2
    exit 64
    ;;
esac

STATUS_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${URL}" || true)"
if [[ "${STATUS_CODE}" != "200" ]]; then
  echo "error: ${MODE} route returned status ${STATUS_CODE} for ${URL}" >&2
  exit 65
fi

BODY="$(curl -fsS "${URL}")"
if ! rg -q --fixed-strings "${CONTENT_PROBE}" <<<"${BODY}"; then
  echo "error: ${MODE} route failed content probe (${CONTENT_PROBE}) at ${URL}" >&2
  exit 66
fi

echo "${MODE} route-content-ok (${URL})"
