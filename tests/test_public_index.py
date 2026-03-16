from __future__ import annotations

from pathlib import Path


def test_root_serves_adapter(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    body = response.text
    assert "media-sync-api" in body
    assert "Playbook" in body
    assert "upload media" in body.lower()
    assert "upload-picker" in body


def test_public_path_alias(client):
    response = client.get("/public/index.html")
    assert response.status_code == 200
    assert "media-sync-api adapter" in response.text


def test_stream_url_copy_includes_origin_helper(client):
    response = client.get("/public/index.html")
    assert response.status_code == 200
    assert "toAbsoluteUrl" in response.text
    assert "window.location.origin" in response.text
    assert "copyTextWithFallback" in response.text
    assert "document.execCommand('copy')" in response.text

    explorer = client.get("/public/explorer.html")
    assert explorer.status_code == 200
    assert "toAbsoluteUrl" in explorer.text
    assert "window.location.origin" in explorer.text
    assert "copyTextWithFallback" in explorer.text
    assert "document.execCommand('copy')" in explorer.text
    assert "drawerSendOBS" in explorer.text
    assert "obsReplaceAssetMediaUrl" in explorer.text
    assert "obsPassword = '123456'" in explorer.text


def test_explorer_screenshot_smoke_script_contract():
    script = Path("scripts/explorer_screenshot_smoke.sh").read_text(encoding="utf-8")
    assert "Usage: scripts/explorer_screenshot_smoke.sh <static|package> [url]" in script
    assert "scripts/explorer_screenshot_smoke.sh static" in script
    assert "scripts/explorer_screenshot_smoke.sh package" in script
    assert "id=\"brandTitle\"" in script
    assert "data-ui-hook=\"explorer-app-shell\"" in script
    assert "exit 64" in script
    assert "exit 65" in script
    assert "exit 66" in script
