from __future__ import annotations


def test_player_overlay_controls(client):
    response = client.get("/public/player.html")
    assert response.status_code == 200
    body = response.text
    assert "obs-player-control" in body
    assert "obs-player-registry" in body
    assert "obs-player::" in body
    assert "BroadcastChannel" in body
    assert "pointerdown" in body
    assert "paused" in body
    assert "grayscale" in body
    assert "postMessage" in body
    assert "hashchange" in body
    assert "player_controller.html" in body
    assert "curtain" in body
    assert "boot" in body


def test_player_controller_page(client):
    response = client.get("/public/player_controller.html")
    assert response.status_code == 200
    body = response.text
    assert "obs-player-registry" in body
    assert "obs-player::" in body
    assert "BroadcastChannel" in body
    assert "setPaused" in body
    assert "touch-action: none" in body
