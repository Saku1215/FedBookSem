"""Collector protocol + Mention dataclass shared by all platform collectors.

The collectors deliberately DO NOT persist raw platform text - only derived
aggregates (positive/neutral/negative counts, mention count). This is a ToS
compliance requirement (Reddit deletion, YouTube 30-day retention).
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol


@dataclass
class Mention:
    """A single platform post/comment mentioning a book.

    Held only in memory during a collection run - scored, aggregated, then
    dropped. Never written to Neo4j as-is.
    """

    platform: str            # 'reddit' | 'youtube' | 'bluesky' | 'mastodon'
    external_id: str         # platform-specific ID for the source item
    text: str                # raw text for sentiment scoring; NEVER persisted
    author_handle: str = ""  # username/handle, kept only for deletion-sweep
    collected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ReceptionAggregate:
    """Per-(book, platform) aggregate that IS persisted to Neo4j."""

    isbn: str
    platform: str
    positive: int
    neutral: int
    negative: int
    mentions: int
    external_ids: list[str] = field(default_factory=list)  # for deletion sweep only
    ingested_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None                     # set for YouTube


class Collector(Protocol):
    platform: str

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        """Fetch mentions of the book from this platform.

        Implementations MUST respect the platform's rate limits and honour
        auth requirements. Return an empty list on API failure - the caller
        will retry on the next cron tick.
        """
        ...
