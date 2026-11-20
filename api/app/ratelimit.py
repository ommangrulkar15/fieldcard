"""Small in-process rate limiter for the sign-in endpoints.

It is per process, which is right for the single free-tier instance this app runs on. If the API
is ever scaled to several instances, swap `Limiter` for a shared store (Redis or a table) without
touching the callers.
"""

import logging
import time
from collections import defaultdict, deque

from fastapi import Request

from app.errors import AppError


class TooManyRequests(AppError):
    status_code = 429
    what = "Too many attempts. Wait a few minutes and try again"

    def __init__(self, retry_after: int):
        super().__init__(self.what)
        self.retry_after = retry_after


SWEEP_EVERY = 500


class Limiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self._records = 0

    def _recent(self, key: str, now: float) -> deque[float]:
        hits = self.hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if not hits:
            self.hits.pop(key, None)  # keep memory bounded: idle keys disappear
            return deque()
        return hits

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._recent(key, now)
        if len(hits) >= self.limit:
            raise TooManyRequests(int(self.window - (now - hits[0])) + 1)

    def record(self, key: str) -> None:
        now = time.monotonic()
        self._recent(key, now)
        self.hits[key].append(now)
        self._records += 1
        if self._records % SWEEP_EVERY == 0:
            self._sweep(now)

    def _sweep(self, now: float) -> None:
        """Drop keys whose every hit has expired. Without this, one-off keys (an attacker rotating
        emails) are never revisited and would pile up forever."""
        for key in [k for k, hits in self.hits.items() if not hits or now - hits[-1] > self.window]:
            del self.hits[key]

    def clear(self) -> None:
        self.hits.clear()


# Any request to a sign-in endpoint from one address; and failed passwords for one address + email.
PER_ADDRESS = Limiter(30, 300)
PER_ACCOUNT_FAILURES = Limiter(5, 300)
LIMITERS = (PER_ADDRESS, PER_ACCOUNT_FAILURES)


_logged_chain = False


def client_address(request: Request) -> str:
    """The address the platform's proxy saw. Only trust X-Forwarded-For when told to."""
    from app.config import settings

    global _logged_chain
    if settings.trust_proxy_hops > 0:
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if not _logged_chain:  # once per process: lets the operator check TRUST_PROXY_HOPS against reality
            _logged_chain = True
            logging.getLogger("fieldcard").warning("proxy chain: %d entries %s, using index -%d",
                                                  len(forwarded), forwarded, settings.trust_proxy_hops)
        if len(forwarded) >= settings.trust_proxy_hops:
            return forwarded[-settings.trust_proxy_hops]  # the hop our own proxy appended, not a client-supplied one
    return request.client.host if request.client else "unknown"
