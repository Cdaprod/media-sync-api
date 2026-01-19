from pathlib import Path


def test_ndi_relay_assets_present():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    assert (relay_dir / "Dockerfile").is_file()
    assert (relay_dir / "entrypoint.sh").is_file()
    assert (relay_dir / "docker-compose.yml").is_file()
    assert (relay_dir / "README.md").is_file()


def test_entrypoint_has_usage_comment():
    relay_dir = Path(__file__).resolve().parents[1] / "ndi-relay"
    entrypoint = relay_dir / "entrypoint.sh"
    content = entrypoint.read_text(encoding="utf-8")
    assert "Usage:" in content
    assert "Example:" in content
