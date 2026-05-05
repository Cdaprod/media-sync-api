"""Runtime event bus primitives for SSE distribution.

Example:
    bus = RuntimeEventBus(history_size=500)
    bus.publish("live_session.updated", {"session_id": "sess-1"})
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator


@dataclass(slots=True)
class RuntimeEvent:
    id: int
    type: str
    payload: dict[str, Any]
    ts: str


class RuntimeEventBus:
    def __init__(self, history_size: int = 500) -> None:
        self._history: deque[RuntimeEvent] = deque(maxlen=max(1, history_size))
        self._next_id = 1
        self._subscribers: set[asyncio.Queue[RuntimeEvent]] = set()

    def publish(self, event_type: str, payload: dict[str, Any]) -> RuntimeEvent:
        event = RuntimeEvent(
            id=self._next_id,
            type=event_type,
            payload=dict(payload),
            ts=datetime.now(timezone.utc).isoformat(),
        )
        self._next_id += 1
        self._history.append(event)
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except Exception:
                continue
        return event

    def emit(self, event_type: str, payload: dict[str, Any]) -> RuntimeEvent:
        return self.publish(event_type, payload)

    async def subscribe(self, last_event_id: int | None = None) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[RuntimeEvent] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            for event in list(self._history):
                if last_event_id is None or event.id > last_event_id:
                    yield asdict(event)
            while True:
                event = await queue.get()
                yield asdict(event)
        finally:
            self._subscribers.discard(queue)
