# NDI iPhone Broadcast Relay

A LAN-only, long-running relay that listens to one NDI source and re-broadcasts it as a stable NDI output named "iPhone Screen" by default.

## Usage

> Requires the NewTek NDI SDK (not redistributed here). Populate `ndi-relay/ndi-sdk/` before building (a placeholder directory is tracked in git), or pass a download URL for your CPU architecture at build time.

```bash
cd ndi-relay
cp -R /path/to/ndi-sdk ./ndi-sdk

docker compose up -d
```

To download the SDK during the Docker build, pass one of the build args below (architecture is detected automatically):

```bash
docker compose build \
  --build-arg NDI_SDK_URL_X86_64="https://example.com/ndi-sdk-x86_64.tgz" \
  --build-arg NDI_SDK_URL_AARCH64="https://example.com/ndi-sdk-aarch64.tgz"
```

## Configuration

Environment variables:

- `NDI_INPUT_NAME`: The exact incoming NDI source name. (Required)
- `NDI_OUTPUT_NAME`: The outgoing relay name. Defaults to `iPhone Screen`.
- `NDI_EXTRA_IPS`: Optional comma-separated extra discovery IPs.
- `RETRY_SECONDS`: Wait time before retrying when the source disappears. Defaults to `2`.

Example override:

```bash
NDI_INPUT_NAME="My iPhone" NDI_OUTPUT_NAME="iPhone Screen" docker compose up -d
```

## Testing

```bash
pytest tests/test_ndi_relay_assets.py
```
