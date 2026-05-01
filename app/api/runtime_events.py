"""Runtime SSE event stream endpoint.

Example:
    curl -N http://localhost:8787/api/runtime/events
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["runtime-events"])


@router.get("/api/runtime/events")
async def stream_runtime_events(request: Request) -> StreamingResponse:
    runtime = request.app.state.runtime
    last_event_id_raw = request.headers.get("Last-Event-ID")
    try:
        last_event_id = int(last_event_id_raw) if last_event_id_raw else None
    except ValueError:
        last_event_id = None

    async def _iter_sse():
        yield ": connected\n\n"
        subscription = runtime.events.subscribe(last_event_id=last_event_id)
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(subscription.__anext__(), timeout=20.0)
                payload = json.dumps(event.get("payload", {}))
                yield f"id: {event.get('id')}\n"
                yield f"event: {event.get('type')}\n"
                yield f"data: {payload}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
            except StopAsyncIteration:
                break

    return StreamingResponse(_iter_sse(), media_type="text/event-stream")
