#!/usr/bin/env bash
# NDI relay service entrypoint.
# Usage: Configure environment variables and run the container.
# Example: NDI_INPUT_NAME="My iPhone" docker compose up -d

set -euo pipefail

NDI_INPUT_NAME="${NDI_INPUT_NAME:-}"
NDI_OUTPUT_NAME="${NDI_OUTPUT_NAME:-iPhone Screen}"
NDI_EXTRA_IPS="${NDI_EXTRA_IPS:-}"
NDI_GROUPS="${NDI_GROUPS:-}"
NDI_DISCOVERY_REQUIRED="${NDI_DISCOVERY_REQUIRED:-false}"
NDI_DISCOVERY_SERVER="${NDI_DISCOVERY_SERVER:-}"
NDI_SOURCE_MATCH="${NDI_SOURCE_MATCH:-}"
RETRY_SECONDS="${RETRY_SECONDS:-2}"

log() { echo "[$(date -Is)] $*"; }

if ! command -v ffmpeg >/dev/null 2>&1; then
  log "ffmpeg not found in PATH. Exiting with code 127."
  exit 127
fi

if [[ -n "${NDI_DISCOVERY_SERVER}" ]]; then
  mkdir -p /root/.ndi
  cat > /root/.ndi/ndi-config.v1.json <<JSON
{"networks":{"discovery":"${NDI_DISCOVERY_SERVER}"}}
JSON
  log "Configured NDI discovery server: ${NDI_DISCOVERY_SERVER}"
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
  discovery_output="$(ffmpeg -hide_banner -f libndi_newtek -find_sources 1 -i dummy 2>&1 || true)"
  sources="$(echo "${discovery_output}" | sed -n -e 's/^[[:space:]]*[0-9][0-9]*[.:)][[:space:]]*//p' -e 's/^[[:space:]]*-[[:space:]]*//p')"

  input_name="${NDI_INPUT_NAME}"
  if [[ -z "${input_name}" && -n "${sources}" ]]; then
    if [[ -n "${NDI_SOURCE_MATCH}" ]]; then
      input_name="$(echo "${sources}" | grep -Ei "${NDI_SOURCE_MATCH}" | head -n 1 || true)"
    else
      input_name="$(echo "${sources}" | head -n 1 || true)"
    fi
  fi

  if [[ -z "${input_name}" ]]; then
    log "No NDI source selected. Set NDI_INPUT_NAME or NDI_SOURCE_MATCH. Retry in ${RETRY_SECONDS}s."
    if [[ -n "${sources}" ]]; then
      log "Discovered sources:"
      echo "${sources}" | sed 's/^/  - /'
    fi
    sleep "${RETRY_SECONDS}"
    continue
  fi

  if [[ -n "${discovery_output}" ]] && ! grep -Fq "${input_name}" <<< "${discovery_output}"; then
    log "NDI source not found in discovery pass: ${input_name}"
    log "Discovery hints: confirm the iPhone is broadcasting, disable NDI Groups or set NDI_GROUPS if supported."
    echo "${discovery_output}" | grep -i "ndi" || true
    if [[ "${NDI_DISCOVERY_REQUIRED}" == "true" ]]; then
      sleep "${RETRY_SECONDS}"
      continue
    fi
  fi

  log "Starting NDI relay"
  log "  IN : ${input_name}"
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
    -f libndi_newtek -i "${input_name}" \
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
