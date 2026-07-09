"""Mastodon full-text search collector across a curated instance allowlist.

Env vars:
    MASTODON_INSTANCES    comma-separated bases, e.g. 'https://mastodon.social,https://bookwyrm.social'
    MASTODON_ACCESS_TOKEN optional per-instance token if instance-restricted search
"""

import os
import re

import httpx

from .base import Collector, Mention


_TAG_STRIP = re.compile(r"<[^>]+>")


class MastodonCollector:
    platform = "mastodon"

    def __init__(self) -> None:
        instances = os.environ.get(
            "MASTODON_INSTANCES",
            "https://mastodon.social,https://bookwyrm.social",
        )
        self._instances = [i.strip() for i in instances.split(",") if i.strip()]
        token = os.environ.get("MASTODON_ACCESS_TOKEN")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._client = httpx.AsyncClient(headers=headers, timeout=15.0)

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        query = f"{title} {author}".strip()
        out: list[Mention] = []
        for base in self._instances:
            resp = await self._client.get(
                f"{base}/api/v2/search",
                params={"q": query, "type": "statuses", "resolve": "false", "limit": 40},
            )
            if resp.status_code != 200:
                continue
            for s in resp.json().get("statuses", []):
                html = s.get("content", "")
                text = _TAG_STRIP.sub("", html).strip()
                if not text:
                    continue
                out.append(Mention(
                    platform=self.platform,
                    external_id=s.get("uri", s.get("id", "")),
                    text=text,
                    author_handle=s.get("account", {}).get("acct", ""),
                ))
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


_check: Collector = MastodonCollector.__new__(MastodonCollector)  # noqa: F841
