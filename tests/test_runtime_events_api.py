from __future__ import annotations

import asyncio
from pathlib import Path


def test_runtime_event_bus_publish_and_subscribe_replay(client):
    runtime = client.app.state.runtime
    runtime.events.publish("node.updated", {"node_id": "n1"})

    async def _run():
      async for event in runtime.events.subscribe(last_event_id=0):
          return event
      raise RuntimeError("no events")

    event = asyncio.run(_run())
    assert event["type"] == "node.updated"
    assert event["id"] >= 1
    assert event["payload"]["node_id"] == "n1"
    assert "ts" in event


def test_runtime_events_endpoint_sse_format(client):
    response = client.get("/api/runtime/events")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache, no-transform"
    assert response.headers["connection"] == "keep-alive"
    assert response.headers["x-accel-buffering"] == "no"
    assert ": connected" in response.text
    assert ": heartbeat" in response.text


def test_live_offer_publish_emits_runtime_event(client):
    runtime = client.app.state.runtime
    before = len(list(runtime.events._history))  # type: ignore[attr-defined]
    response = client.post(
        "/api/live/session-events-1/offer",
        json={"node_id": "runner-events", "offer": {"type": "offer", "sdp": "v=0"}},
    )
    assert response.status_code == 200
    after = len(list(runtime.events._history))  # type: ignore[attr-defined]
    assert after > before


def test_runtime_events_heartbeat_interval_is_short():
    content = Path("app/api/runtime_events.py").read_text(encoding="utf-8")
    assert "SSE_HEARTBEAT_INTERVAL_SECONDS = 5.0" in content


def test_connect_register_persists_node_and_source_and_emits_events(client):
    runtime = client.app.state.runtime
    before = len(list(runtime.events._history))  # type: ignore[attr-defined]
    node_id = "iphone-browser-runtime-01"
    response = client.post(
        "/connect/register",
        json={
            "node_id": node_id,
            "label": "iPhone Browser Runtime",
            "base_url": None,
            "roles": ["runner", "capture"],
            "capabilities": ["can_proxy_streams"],
            "source_name": "camera-primary",
            "source_kind": "capture",
            "source_authority": "runner-local",
            "advertised_source_kinds": ["capture"],
            "ephemeral": True,
            "metadata": {"session_node": "true", "browser_push": "true", "origin": "browser"},
        },
    )
    assert response.status_code == 200

    nodes = client.get("/api/nodes")
    assert nodes.status_code == 200
    assert any(entry.get("node_id") == node_id for entry in nodes.json())

    sources = client.get("/api/sources")
    assert sources.status_code == 200
    assert any(entry.get("owner_node_id") == node_id for entry in sources.json())

    after_history = list(runtime.events._history)  # type: ignore[attr-defined]
    node_events = [
        event
        for event in after_history[before:]
        if event.type == "node.updated"
        and str(event.payload.get("node_id") or "") == node_id
    ]
    source_events = [
        event
        for event in after_history[before:]
        if event.type == "source.updated"
        and str(event.payload.get("owner_node_id") or "") == node_id
    ]
    assert node_events
    assert source_events
