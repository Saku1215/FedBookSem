"""YouTube Data API v3 collector.

Env vars:
    YOUTUBE_API_KEY

Retention:
    Aggregates derived from YouTube data carry `expires_at = ingested + 30d`.
    The purge cron (scripts/purge_expired_receptions.py) enforces this.
"""

import os
from datetime import datetime, timedelta, timezone

import httpx

from .base import Collector, Mention


YOUTUBE_DATA_API = "https://www.googleapis.com/youtube/v3"


class YouTubeCollector:
    platform = "youtube"

    def __init__(self) -> None:
        self._key = os.environ["YOUTUBE_API_KEY"]
        self._client = httpx.AsyncClient(timeout=15.0)

    @staticmethod
    def expiry_for_now() -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=30)

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        # Step 1: find videos reviewing this book
        search = await self._client.get(
            f"{YOUTUBE_DATA_API}/search",
            params={
                "part": "id",
                "q": f"{title} {author} review",
                "type": "video",
                "maxResults": 10,
                "key": self._key,
            },
        )
        if search.status_code != 200:
            return []
        video_ids = [item["id"]["videoId"] for item in search.json().get("items", [])]

        # Step 2: fetch top-level comments for each video
        mentions: list[Mention] = []
        for vid in video_ids:
            resp = await self._client.get(
                f"{YOUTUBE_DATA_API}/commentThreads",
                params={
                    "part": "snippet",
                    "videoId": vid,
                    "maxResults": 30,
                    "textFormat": "plainText",
                    "key": self._key,
                },
            )
            if resp.status_code != 200:
                continue
            for item in resp.json().get("items", []):
                s = item["snippet"]["topLevelComment"]["snippet"]
                mentions.append(Mention(
                    platform=self.platform,
                    external_id=item["id"],
                    text=s.get("textOriginal", ""),
                    author_handle=s.get("authorChannelId", {}).get("value", ""),
                ))
        return mentions

    async def aclose(self) -> None:
        await self._client.aclose()


_check: Collector = YouTubeCollector.__new__(YouTubeCollector)  # noqa: F841
