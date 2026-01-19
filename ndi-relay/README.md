# NDI iPhone Broadcast Relay

A LAN-only, long-running relay that listens to one NDI source and re-broadcasts it as a stable NDI output named "iPhone Screen" by default.

## Usage

> Requires the NewTek NDI SDK (not redistributed here). Place the SDK contents at `ndi-relay/ndi-sdk/` before building.

```bash
cd ndi-relay
cp -R /path/to/ndi-sdk ./ndi-sdk

docker compose up -d
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
