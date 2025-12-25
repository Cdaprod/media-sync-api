from pathlib import Path

from app.storage.sources import SourceRegistry


def test_primary_source_is_persisted(client, env_settings: Path):
    response = client.get("/api/sources")
    assert response.status_code == 200
    sources = response.json()
    assert any(source["name"] == "primary" and source["enabled"] and source["mode"] == "project" for source in sources)

    registry = SourceRegistry(env_settings, env_settings.parent / "sources")
    stored = {source.name for source in registry.list_all()}
    assert "primary" in stored


def test_register_and_toggle_source(client, env_settings: Path):
    sources_root = env_settings.parent / "sources"
    secondary_root = sources_root / "nas"
    secondary_root.mkdir(parents=True, exist_ok=True)

    created = client.post(
        "/api/sources",
        json={
            "name": "nas",
            "root": str(secondary_root),
            "mode": "library",
            "read_only": True,
            "type": "smb",
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["accessible"] is True
    assert payload["mode"] == "library"

    toggled = client.post("/api/sources/nas/toggle", params={"enabled": False})
    assert toggled.status_code == 200
    assert toggled.json()["enabled"] is False

    reenabled = client.post("/api/sources/nas/toggle", params={"enabled": True})
    assert reenabled.status_code == 200
    assert reenabled.json()["enabled"] is True

    registry = SourceRegistry(env_settings, sources_root)
    sources = {source.name: source for source in registry.list_all()}
    assert sources["nas"].enabled is True


def test_register_source_rejects_outside_parent(client, env_settings: Path, tmp_path: Path):
    outside_root = tmp_path / "outside"
    outside_root.mkdir()

    response = client.post(
        "/api/sources",
        json={
            "name": "outside",
            "root": str(outside_root),
            "mode": "library",
            "read_only": True,
        },
    )
    assert response.status_code == 400
