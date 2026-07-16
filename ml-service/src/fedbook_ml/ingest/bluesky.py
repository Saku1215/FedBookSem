"""Bluesky AT Protocol search collector.

Historically `public.api.bsky.app` allowed anonymous read of
`app.bsky.feed.searchPosts`. As of mid-2026 the public AppView requires
authentication for that endpoint - anonymous calls 403. Two paths:

1. Authenticated (recommended): set BSKY_HANDLE + BSKY_APP_PASSWORD in
   `.env`. The collector opens a session via `com.atproto.server.createSession`
   on first use and uses the returned JWT for all subsequent requests.
   App passwords are generated at https://bsky.app/settings/app-passwords.

2. Anonymous (best-effort): if credentials aren't set the collector still
   tries the public AppView first. When that 403s it logs a warning and
   returns zero mentions - the pipeline continues with the other platforms.

Env vars:
    BLUESKY_APPVIEW_URL   default 'https://public.api.bsky.app'
    BSKY_HANDLE           e.g. 'yourhandle.bsky.social' (optional)
    BSKY_APP_PASSWORD     app-password 'xxxx-xxxx-xxxx-xxxx' (optional)
"""

import logging
import os

import httpx

from .base import Collector, Mention

log = logging.getLogger("fedbook_ml.ingest.bluesky")


class BlueskyCollector:
    platform = "bluesky"

    def __init__(self) -> None:
        base = os.environ.get("BLUESKY_APPVIEW_URL", "https://public.api.bsky.app")
        self._client = httpx.AsyncClient(
            base_url=base,
            timeout=15.0,
            headers={"User-Agent": "FedBook-Sem/0.1 (research)"},
        )
        self._handle = os.environ.get("BSKY_HANDLE") or None
        self._password = os.environ.get("BSKY_APP_PASSWORD") or None
        self._access_jwt: str | None = None
        self._auth_attempted = False

    async def _ensure_session(self) -> None:
        """Open an AT Protocol session if credentials are configured.
        No-op if we've already tried or credentials aren't set."""
        if self._auth_attempted or self._access_jwt:
            return
        self._auth_attempted = True
        if not (self._handle and self._password):
            return
        try:
            resp = await self._client.post(
                "/xrpc/com.atproto.server.createSession",
                json={"identifier": self._handle, "password": self._password},
            )
            if resp.status_code == 200:
                data = resp.json()
                self._access_jwt = data.get("accessJwt")
                if self._access_jwt:
                    self._client.headers["Authorization"] = f"Bearer {self._access_jwt}"
                    log.info("Bluesky session established for %s", self._handle)
            else:
                log.warning(
                    "Bluesky createSession failed: %s %s",
                    resp.status_code, resp.text[:200],
                )
        except httpx.HTTPError as exc:
            log.warning("Bluesky createSession error: %s", exc)

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        await self._ensure_session()
        query = f"{title} {author}".strip()
        try:
            resp = await self._client.get(
                "/xrpc/app.bsky.feed.searchPosts",
                params={"q": query, "limit": 50},
            )
        except httpx.HTTPError as exc:
            log.warning("Bluesky request failed for %s: %s", query, exc)
            return []
        if resp.status_code == 403 and not self._access_jwt:
            log.warning(
                "Bluesky 403 (anonymous read no longer supported). "
                "Set BSKY_HANDLE + BSKY_APP_PASSWORD in .env to enable."
            )
            return []
        if resp.status_code != 200:
            log.warning("Bluesky %s for %s: %s", resp.status_code, query, resp.text[:200])
            return []

        posts = resp.json().get("posts", [])
        out: list[Mention] = []
        for p in posts:
            text = p.get("record", {}).get("text", "")
            if not text:
                continue
            out.append(Mention(
                platform=self.platform,
                external_id=p.get("uri", ""),
                text=text,
                author_handle=p.get("author", {}).get("handle", ""),
            ))
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


_check: Collector = BlueskyCollector.__new__(BlueskyCollector)  # noqa: F841
