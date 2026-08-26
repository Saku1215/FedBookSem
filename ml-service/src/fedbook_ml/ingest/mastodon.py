"""Mastodon hashtag-timeline collector.

Full-text `/api/v2/search` on Mastodon requires authentication AND opt-in
by individual users to have their posts indexed - so unauthenticated
search consistently returns zero statuses even for popular titles.

Instead we poll the public **hashtag timeline** endpoints (which are
open, per the ActivityPub / Mastodon spec) for the tags in `HASHTAGS`,
cache the result for the whole ingestion cycle, then for each book
title we filter the cached statuses for posts whose plain-text content
mentions the title (case-insensitive substring).

Env vars:
    MASTODON_INSTANCES    comma-separated bases, e.g. `mastodon.social,ohai.social`
                          (scheme is added automatically if missing)
    MASTODON_ACCESS_TOKEN optional per-instance token if you want higher
                          rate limits; anonymous polling works fine at
                          low volume (~5 books/run)
"""

import os
import re

import httpx

from .base import Collector, Mention

_TAG_STRIP = re.compile(r"<[^>]+>")
_HASHTAGS = ("bookstodon", "booksky", "booktok", "bookreview")


class MastodonCollector:
    platform = "mastodon"

    def __init__(self) -> None:
        instances = os.environ.get(
            "MASTODON_INSTANCES",
            "https://mastodon.social,https://ohai.social",
        )
        # Accept bare hostnames and prefix https:// if absent.
        self._instances = []
        for raw in instances.split(","):
            raw = raw.strip().rstrip("/")
            if not raw:
                continue
            if not raw.startswith(("http://", "https://")):
                raw = f"https://{raw}"
            self._instances.append(raw)

        token = os.environ.get("MASTODON_ACCESS_TOKEN")
        headers = {"User-Agent": "FedBook-Sem/0.1"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(headers=headers, timeout=15.0)

        # Cached per-collector-lifetime hashtag timeline dump. Populated on
        # first call, reused for every subsequent book in the same run.
        self._cache: list[dict] | None = None

    async def _load_bookish_timeline(self) -> list[dict]:
        """One-shot pull of the bookish hashtag timelines across every
        configured instance. Deduplicates by status URI."""
        if self._cache is not None:
            return self._cache
        seen: set[str] = set()
        collected: list[dict] = []
        for base in self._instances:
            for tag in _HASHTAGS:
                try:
                    resp = await self._client.get(
                        f"{base}/api/v1/timelines/tag/{tag}",
                        params={"limit": 40},
                    )
                except httpx.HTTPError:
                    continue
                if resp.status_code != 200:
                    continue
                for status in resp.json():
                    uri = status.get("uri") or status.get("url") or status.get("id")
                    if not uri or uri in seen:
                        continue
                    seen.add(uri)
                    html = status.get("content", "") or ""
                    text = _TAG_STRIP.sub("", html).strip()
                    if not text:
                        continue
                    collected.append({
                        "uri": uri,
                        "text": text,
                        "acct": status.get("account", {}).get("acct", ""),
                    })
        self._cache = collected
        return collected

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        posts = await self._load_bookish_timeline()
        if not posts:
            return []

        title_lc = title.lower().strip()
        if len(title_lc) < 4:
            return []   # short titles are unreliable

        # Multi-word titles ("Assassin's Apprentice") are strong matches on
        # their own. Single-word titles ("Gold", "Beauty") need the author's
        # surname to co-occur, otherwise they false-match generic bookstodon
        # posts that happen to use the word.
        needs_author = " " not in title_lc

        # Pull the last surname from the first-listed author, semicolon-separated.
        surname = ""
        first_author = author.split(";")[0].strip()
        if first_author:
            parts = [p for p in first_author.split() if len(p) >= 3]
            if parts:
                surname = parts[-1].lower()

        out: list[Mention] = []
        for p in posts:
            text_lc = p["text"].lower()
            if title_lc not in text_lc:
                continue
            if needs_author and (not surname or surname not in text_lc):
                continue
            out.append(Mention(
                platform=self.platform,
                external_id=p["uri"],
                text=p["text"],
                author_handle=p["acct"],
            ))
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


_check: Collector = MastodonCollector.__new__(MastodonCollector)  # noqa: F841
