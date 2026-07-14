"""Bluesky AT Protocol search collector.

Uses the public unauthenticated search endpoint (`app.bsky.feed.searchPosts`).
No auth or key required for read-only search as of the AT Protocol spec.

Env vars:
    BLUESKY_APPVIEW_URL   default 'https://public.api.bsky.app'
"""

import os

import httpx

from .base import Collector, Mention


class BlueskyCollector:
    platform = "bluesky"

    def __init__(self) -> None:
        base = os.environ.get("BLUESKY_APPVIEW_URL", "https://public.api.bsky.app")
        # A descriptive User-Agent is required for the public AppView -
        # unauthenticated requests without one 403 as of mid-2026.
        self._client = httpx.AsyncClient(
            base_url=base,
            timeout=15.0,
            headers={"User-Agent": "FedBook-Sem/0.1 (research)"},
        )

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        query = f"{title} {author}".strip()
        resp = await self._client.get(
            "/xrpc/app.bsky.feed.searchPosts",
            params={"q": query, "limit": 50},
        )
        if resp.status_code != 200:
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
