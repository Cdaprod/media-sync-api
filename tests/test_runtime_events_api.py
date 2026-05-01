from __future__ import annotations

import asyncio


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
    assert "created_at" in event


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
