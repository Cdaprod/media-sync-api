from __future__ import annotations


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

    explorer = client.get("/public/explorer.html")
    assert explorer.status_code == 200
    assert "toAbsoluteUrl" in explorer.text
    assert "window.location.origin" in explorer.text


def test_explorer_logo_toggles_sidebar(client):
    response = client.get("/public/explorer.html")
    assert response.status_code == 200
    assert 'id="sidebarToggleBtn"' in response.text
    assert "logo-button" in response.text
    assert "Toggle projects sidebar" in response.text


def test_explorer_upload_controls_support_multi_select(client):
    response = client.get("/public/explorer.html")
    assert response.status_code == 200
    body = response.text
    assert 'id="uploadFile"' in body
    assert "multiple" in body
    assert "autoUpload" in body
    assert "Reindexing in background" in body
    assert "handleUploadSelection" in body
    assert 'id="uploadQueue"' in body
