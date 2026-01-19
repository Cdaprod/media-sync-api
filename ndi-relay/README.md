# NDI iPhone Broadcast Relay

A LAN-only, long-running relay that listens to one NDI source and re-broadcasts it as a stable NDI output named "iPhone Screen" by default.

## Usage

> Requires the NewTek NDI SDK (not redistributed here). Populate `ndi-relay/ndi-sdk/` before building (a placeholder directory is tracked in git), or pass a download URL for your CPU architecture at build time.

```bash
cd ndi-relay
cp -R /path/to/ndi-sdk ./ndi-sdk

docker compose up -d
```

To download the SDK during the Docker build, pass a per-architecture URL for the SDK tarball. (The official NDI download portal may require authentication; use the direct URL you receive there.)

```bash
docker compose build \
  --build-arg NDI_SDK_URL_X86_64="https://get.ndi.video/e/1092312/nstall-NDI-SDK-v6-Linux-tar-gz/lygzhz/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk" \
  --build-arg NDI_SDK_URL_AARCH64="https://example.com/ndi-sdk-aarch64.tgz"
```

The relay build patches FFmpeg with NDI support using the upstream FFmpeg tarball plus the `lplassman/FFMPEG-NDI` patch. Override the sources if needed:

```bash
docker compose build \
  --build-arg FFMPEG_SOURCE_URL="https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/refs/tags/n5.1" \
  --build-arg FFMPEG_NDI_PATCH_URL="https://codeload.github.com/lplassman/FFMPEG-NDI/tar.gz/refs/heads/master"
```

Reference URLs from the NDI download email (store these locally; they may expire):

- Windows: `https://get.ndi.video/e/1092312/SDK-NDI-SDK-NDI20620SDK-exe/lygzhs/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk`
- macOS/iOS: `https://get.ndi.video/e/1092312/c-Install-NDI-SDK-v6-Apple-pkg/lygzhw/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk`
- Linux: `https://get.ndi.video/e/1092312/nstall-NDI-SDK-v6-Linux-tar-gz/lygzhz/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk`
- Android (Linux): `https://get.ndi.video/e/1092312/tall-NDI-SDK-v6-Android-tar-gz/lygzj3/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk`
- Android (Windows): `https://get.ndi.video/e/1092312/d-NDI20620SDK2028Android29-exe/lygzj6/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk`

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
