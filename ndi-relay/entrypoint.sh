#!/usr/bin/env bash
# NDI relay service entrypoint.
# Usage: Configure environment variables and run the container.
# Example: NDI_INPUT_NAME="My iPhone" docker compose up -d

set -euo pipefail

NDI_INPUT_NAME="${NDI_INPUT_NAME:-}"
NDI_OUTPUT_NAME="${NDI_OUTPUT_NAME:-iPhone Screen}"
NDI_EXTRA_IPS="${NDI_EXTRA_IPS:-}"
NDI_GROUPS="${NDI_GROUPS:-}"
RETRY_SECONDS="${RETRY_SECONDS:-2}"

log() { echo "[$(date -Is)] $*"; }

if ! command -v ffmpeg >/dev/null 2>&1; then
  log "ffmpeg not found in PATH. Exiting with code 127."
  exit 127
fi

ndi_group_supported=false
if [[ -n "${NDI_GROUPS}" ]]; then
  if ffmpeg -hide_banner -h full 2>/dev/null | grep -q "ndi_group"; then
    ndi_group_supported=true
  else
    log "NDI groups requested (${NDI_GROUPS}) but ffmpeg does not support -ndi_group. Skipping groups."
  fi
fi

while true; do
  if [[ -z "${NDI_INPUT_NAME}" ]]; then
    log "Waiting for NDI_INPUT_NAME to be set. Retry in ${RETRY_SECONDS}s."
    sleep "${RETRY_SECONDS}"
    continue
  fi

  log "Starting NDI relay"
  log "  IN : ${NDI_INPUT_NAME}"
  log "  OUT: ${NDI_OUTPUT_NAME}"

  ndi_group_args=()
  if [[ -n "${NDI_GROUPS}" && "${ndi_group_supported}" == "true" ]]; then
    ndi_group_args=(-ndi_group "${NDI_GROUPS}")
  fi

  set +e
  ffmpeg \
    -hide_banner -loglevel info \
    "${ndi_group_args[@]}" \
    ${NDI_EXTRA_IPS:+-extra_ips "$NDI_EXTRA_IPS"} \
    -f libndi_newtek -i "${NDI_INPUT_NAME}" \
    -map 0:v -map 0:a? \
    -c:v copy \
    -c:a copy \
    -f libndi_newtek \
    "${NDI_OUTPUT_NAME}"
  rc=$?
  set -e

  log "Relay stopped (rc=${rc}). Waiting ${RETRY_SECONDS}s..."
  sleep "${RETRY_SECONDS}"
done
