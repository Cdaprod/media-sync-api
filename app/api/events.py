"""Server-sent event stream for runtime state hints.

Example:
    curl -N http://localhost:8787/api/events
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(tags=['events'])


@router.get('/api/events')
async def stream_events(request: Request) -> StreamingResponse:
    runtime = request.app.state.runtime

    async def event_generator():
        yield ": connected\n\n"
        async for event in runtime.events.subscribe():
            if await request.is_disconnected():
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type='text/event-stream')
