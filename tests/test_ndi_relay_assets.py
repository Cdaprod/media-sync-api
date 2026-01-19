from pathlib import Path


def test_ndi_relay_assets_present():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    assert (relay_dir / "Dockerfile").is_file()
    assert (relay_dir / "entrypoint.sh").is_file()
    assert (relay_dir / "docker-compose.yml").is_file()
    assert (relay_dir / "README.md").is_file()
    assert (relay_dir / "ndi-sdk").is_dir()


def test_entrypoint_has_usage_comment():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    entrypoint = relay_dir / "entrypoint.sh"
    content = entrypoint.read_text(encoding="utf-8")
    assert "Usage:" in content
    assert "Example:" in content


def test_ndi_dockerfile_mentions_sdk_hint():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    dockerfile = relay_dir / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    assert "NDI SDK missing" in content
    assert "Install_NDI_SDK" in content
    assert "DistroAV/FFmpeg" in content
    assert "FFMPEG_NDI_SOURCE_URL" in content
    assert "NDI_SDK_URL_X86_64" in content
    assert "NDI_SDK_URL_AARCH64" in content
