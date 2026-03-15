import json
import logging
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.config import settings
from app.services.auth_service import decode_token

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections per campaign."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, campaign_id: str, websocket: WebSocket):
        await websocket.accept()
        if campaign_id not in self.active_connections:
            self.active_connections[campaign_id] = []
        self.active_connections[campaign_id].append(websocket)
        logger.info(f"WebSocket connected for campaign {campaign_id}")

    def disconnect(self, campaign_id: str, websocket: WebSocket):
        if campaign_id in self.active_connections:
            self.active_connections[campaign_id] = [
                conn for conn in self.active_connections[campaign_id]
                if conn != websocket
            ]
            if not self.active_connections[campaign_id]:
                del self.active_connections[campaign_id]
        logger.info(f"WebSocket disconnected for campaign {campaign_id}")

    async def broadcast(self, campaign_id: str, message: dict):
        if campaign_id not in self.active_connections:
            return
        disconnected = []
        for connection in self.active_connections[campaign_id]:
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                disconnected.append(connection)
            except Exception:
                disconnected.append(connection)
        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(campaign_id, conn)


manager = ConnectionManager()


@router.websocket("/ws/campaigns/{campaign_id}")
async def campaign_websocket(
    websocket: WebSocket,
    campaign_id: str,
):
    """
    WebSocket endpoint for real-time campaign events.
    Auth via first message: {"type": "auth", "token": "<jwt>"}
    This keeps the JWT out of URLs, server logs, and browser history.
    Subscribes to Redis pub/sub channel for campaign events.
    """
    # Accept connection first, then authenticate via first message
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_msg = json.loads(raw)
    except asyncio.TimeoutError:
        await websocket.close(code=4001, reason="Auth timeout")
        return
    except (json.JSONDecodeError, Exception):
        await websocket.close(code=4001, reason="Invalid auth message")
        return

    if auth_msg.get("type") != "auth" or not auth_msg.get("token"):
        await websocket.close(code=4001, reason="Missing auth token")
        return

    try:
        payload = decode_token(auth_msg["token"])
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token type")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    # Auth passed — register connection (skip accept, already accepted above)
    if campaign_id not in manager.active_connections:
        manager.active_connections[campaign_id] = []
    manager.active_connections[campaign_id].append(websocket)
    logger.info("WebSocket authenticated for campaign %s", campaign_id)

    # Subscribe to Redis channel
    redis_sub = aioredis.from_url(settings.REDIS_URL)
    pubsub = redis_sub.pubsub()
    channel = f"campaign:{campaign_id}:events"
    await pubsub.subscribe(channel)

    try:
        # Listen for Redis messages and forward to WebSocket
        async def redis_listener():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await manager.broadcast(campaign_id, data)
                    except (json.JSONDecodeError, Exception) as e:
                        logger.error(f"Error broadcasting message: {e}")

        # Also listen for client messages (ping/pong keepalive)
        async def ws_listener():
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                pass

        # Run both listeners concurrently
        await asyncio.gather(
            redis_listener(),
            ws_listener(),
            return_exceptions=True,
        )

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(campaign_id, websocket)
        await pubsub.unsubscribe(channel)
        await redis_sub.close()
