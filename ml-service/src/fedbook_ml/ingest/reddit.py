"""Reddit collector using PRAW - OAuth required.

Env vars:
    REDDIT_CLIENT_ID
    REDDIT_CLIENT_SECRET
    REDDIT_USER_AGENT      e.g. 'FedBook-Sem/0.1 by u/your_username'
    REDDIT_SUBREDDITS      comma-separated allowlist, default: books,booksuggestions
"""

import asyncio
import os

from .base import Collector, Mention

_DEFAULT_SUBREDDITS = "books,booksuggestions,52book,literature,suggestmeabook"


class RedditCollector:
    platform = "reddit"

    def __init__(self) -> None:
        import praw  # imported lazily so tests can run without praw configured
        self._praw = praw.Reddit(
            client_id=os.environ["REDDIT_CLIENT_ID"],
            client_secret=os.environ["REDDIT_CLIENT_SECRET"],
            user_agent=os.environ.get(
                "REDDIT_USER_AGENT", "FedBook-Sem/0.1"
            ),
        )
        self._subs = [
            s.strip()
            for s in os.environ.get("REDDIT_SUBREDDITS", _DEFAULT_SUBREDDITS).split(",")
            if s.strip()
        ]

    async def collect_for_book(self, title: str, author: str) -> list[Mention]:
        query = f'"{title}" {author}'.strip()

        def _search() -> list[Mention]:
            out: list[Mention] = []
            for sub in self._subs:
                for post in self._praw.subreddit(sub).search(query, limit=20):
                    text = f"{post.title}. {getattr(post, 'selftext', '')}".strip()
                    if not text:
                        continue
                    out.append(Mention(
                        platform=self.platform,
                        external_id=post.id,
                        text=text,
                        author_handle=str(post.author) if post.author else "",
                    ))
            return out

        return await asyncio.get_event_loop().run_in_executor(None, _search)


# Type-check nudge: ensure the concrete class implements the protocol
_check: Collector = RedditCollector.__new__(RedditCollector)  # noqa: F841
