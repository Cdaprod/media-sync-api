from __future__ import annotations

import asyncio
import json


async def _single_event() -> dict[str, object]:
    yield {
        'type': 'test.event',
        'ts': '2026-01-01T00:00:00+00:00',
        'payload': {'ok': True},
    }


def test_events_endpoint_returns_sse_stream(client):
    runtime = client.app.state.runtime
    runtime.events.subscribe = _single_event  # type: ignore[assignment]

    response = client.get('/api/events')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/event-stream')
    assert ': connected' in response.text
    assert 'data: ' in response.text


def test_runtime_event_bus_manual_emit_pushes_event(client):
    runtime = client.app.state.runtime

    async def _collect_one() -> dict[str, object]:
        async for event in runtime.events.subscribe():
            return event
        raise RuntimeError('subscription ended unexpectedly')

    async def _run() -> dict[str, object]:
        task = asyncio.create_task(_collect_one())
        await asyncio.sleep(0)
        runtime.events.emit('recording.complete', {'recording_id': 'rec-evt-1'})
        return await asyncio.wait_for(task, timeout=1)

    event = asyncio.run(_run())
    assert event['type'] == 'recording.complete'
    payload = event['payload']
    assert isinstance(payload, dict)
    assert payload['recording_id'] == 'rec-evt-1'
    assert 'ts' in event
