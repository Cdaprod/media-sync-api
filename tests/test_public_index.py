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

def test_public_explorer_path(client):
    response = client.get("/public/explorer.html")
    assert response.status_code == 200
    body = response.text
    assert "media-sync-api — Explorer" in body
    assert 'id="sidebar"' in body
    assert 'id="sidebarScroll"' in body
    assert 'data-section-toggle="projects"' in body
    assert 'data-section-toggle="libraries"' in body
    assert 'data-section-toggle="buckets"' in body
    assert 'data-section-toggle="sources"' in body
    assert 'data-section-toggle="bridge"' in body
    assert 'data-section-toggle="resolve"' in body
    assert 'data-section-toggle="upload"' in body
    assert 'id="uploadFile"' in body
    assert 'type="file"' in body
    assert "multiple" in body
    assert 'id="projects"' in body
    assert 'id="libraries"' in body
    assert 'id="buckets"' in body
    assert 'id="sources"' in body
    assert 'id="bridgeStageTree"' in body
    assert "drawerPreview" in body
    assert "drawerBackdrop" in body
    assert "@media (max-width: 1180px)" in body
    assert "@media (max-width: 860px)" in body
