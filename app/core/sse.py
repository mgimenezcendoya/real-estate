"""
SSE Connection Manager — manages active Server-Sent Event connections per tenant.

Architecture note: this manager keeps connections in-process memory. It works
correctly with a single Uvicorn worker (Realia's current Render deploy). If the
service is ever scaled to multiple workers/instances, this must be replaced with
a Redis Pub/Sub broker so all instances share the same event bus.
"""

import asyncio
import json
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class SSEConnectionManager:
    """Maintains a registry of active SSE queues keyed by tenant (organization_id).

    Each connected browser tab gets its own asyncio.Queue. Broadcasting to a
    tenant pushes the same event to all queues for that tenant, so multiple
    admins (or the same admin in multiple tabs) all receive updates.
    """

    def __init__(self) -> None:
        # tenant_id -> list of queues, one per active SSE connection
        self._connections: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def connect(self, tenant_id: str) -> asyncio.Queue:
        """Register a new SSE connection and return its dedicated queue."""
        q: asyncio.Queue = asyncio.Queue()
        self._connections[tenant_id].append(q)
        logger.info("SSE connect: tenant=%s total=%d", tenant_id, len(self._connections[tenant_id]))
        return q

    def disconnect(self, tenant_id: str, queue: asyncio.Queue) -> None:
        """Remove a queue when its client disconnects."""
        queues = self._connections.get(tenant_id, [])
        try:
            queues.remove(queue)
        except ValueError:
            pass
        if not queues:
            self._connections.pop(tenant_id, None)
        logger.info("SSE disconnect: tenant=%s remaining=%d", tenant_id, len(queues))

    async def broadcast(self, tenant_id: str, event: str, data: dict) -> None:
        """Push an event to all active connections for a tenant.

        This is a non-blocking fire-and-forget: if a queue is full (client is
        slow) we drop the event for that connection rather than blocking the
        caller (e.g. the WhatsApp webhook, which must return 200 quickly).
        """
        payload = json.dumps(data, default=str)
        message = f"event: {event}\ndata: {payload}\n\n"
        queues = self._connections.get(tenant_id, [])
        for q in list(queues):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                logger.warning("SSE queue full for tenant=%s, dropping event=%s", tenant_id, event)


# Singleton — imported by the admin router and the WhatsApp webhook handler
connection_manager = SSEConnectionManager()
