from pathlib import Path

import yaml


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
    assert "\r" not in content
    assert "-find_sources 1" in content


def test_ndi_dockerfile_mentions_sdk_hint():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    dockerfile = relay_dir / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    assert "sed -i 's/\\r$//' /entrypoint.sh" in content
    assert "NDI SDK missing" in content
    assert "libx264-164" in content
    assert "Install_NDI_SDK" in content
    assert "NDI libs found but none match architecture" in content
    assert "libndi.so" in content
    assert "FFMPEG_SOURCE_URL" in content
    assert "FFMPEG_NDI_PATCH_URL" in content
    assert "FFmpeg/FFmpeg" in content
    assert "lplassman/FFMPEG-NDI" in content
    assert "NDI_SDK_URL_X86_64" in content
    assert "NDI_SDK_URL_AARCH64" in content


def test_ndi_relay_compose_defaults():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    compose_path = relay_dir / "docker-compose.yml"
    content = yaml.safe_load(compose_path.read_text(encoding="utf-8"))
    service = content.get("services", {}).get("ndi-relay", {})
    discovery = content.get("services", {}).get("ndi-discovery", {})

    assert service.get("restart") == "always"
    assert discovery.get("restart") == "always"
    assert discovery.get("network_mode") == "host"

    env = service.get("environment", {})
    assert env.get("NDI_INPUT_NAME") == "iPhone Screen"
    assert env.get("NDI_OUTPUT_NAME") == "iPhone Screen"
    assert env.get("NDI_GROUPS") == ""
    assert env.get("NDI_DISCOVERY_REQUIRED") == "false"
    assert env.get("NDI_DISCOVERY_SERVER") == "127.0.0.1:5959"
