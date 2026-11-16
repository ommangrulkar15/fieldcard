"""Request-size limits, enforced before a body is parsed.

JSON endpoints never need more than a few kilobytes; only the photo upload takes a real file.
Without a cap, any caller could make the server buffer and parse an arbitrarily large body.
"""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_JSON_BYTES = 1 * 1024 * 1024
MAX_UPLOAD_BYTES = 9 * 1024 * 1024  # an 8 MB photo plus multipart framing


def _is_upload(scope: Scope) -> bool:
    return scope["method"] == "POST" and scope["path"].endswith("/photos")


class BodySizeLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS", "DELETE"):
            await self.app(scope, receive, send)
            return
        limit = MAX_UPLOAD_BYTES if _is_upload(scope) else MAX_JSON_BYTES
        declared = dict(scope["headers"]).get(b"content-length")
        too_big = JSONResponse({"detail": "Request body is too large"}, status_code=413)
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await too_big(scope, receive, send)
            return

        seen = 0
        refused = False

        async def counted() -> Message:
            nonlocal seen, refused
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    refused = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        started = False

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if refused and not started:
                started = True
                await too_big(scope, receive, send)
                return
            if refused:
                return
            started = True
            await send(message)

        await self.app(scope, counted, guarded_send)
