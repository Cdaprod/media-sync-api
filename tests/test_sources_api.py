from pathlib import Path

from app.storage.sources import SourceRegistry


def test_primary_source_is_persisted(client, env_settings: Path):
    response = client.get("/api/sources")
    assert response.status_code == 200
    sources = response.json()
    assert any(source["name"] == "primary" and source["enabled"] for source in sources)

    registry = SourceRegistry(env_settings)
    stored = {source.name for source in registry.list_all()}
    assert "primary" in stored


def test_register_and_toggle_source(client, env_settings: Path, tmp_path: Path):
    secondary_root = tmp_path / "nas"
    secondary_root.mkdir()

    created = client.post(
        "/api/sources",
        json={"name": "nas", "root": str(secondary_root), "type": "smb"},
    )
    assert created.status_code == 201
    assert created.json()["accessible"] is True

    toggled = client.post("/api/sources/nas/toggle", params={"enabled": False})
    assert toggled.status_code == 200
    assert toggled.json()["enabled"] is False

    registry = SourceRegistry(env_settings)
    sources = {source.name: source for source in registry.list_all()}
    assert sources["nas"].enabled is False
