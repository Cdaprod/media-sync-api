"""Runtime event bus primitives for server-sent event distribution.

Example:
    bus = RuntimeEventBus()
    bus.emit('recording.complete', {'recording_id': 'rec-1'})
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator


@dataclass(slots=True)
class RuntimeEvent:
    type: str
    ts: datetime
    payload: dict[str, Any]


class RuntimeEventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            self._subscribers.discard(queue)

    def emit(self, type: str, payload: dict[str, Any]) -> None:
        event = {
            'type': type,
            'ts': datetime.now(timezone.utc).isoformat(),
            'payload': payload,
        }
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except Exception:
                continue
