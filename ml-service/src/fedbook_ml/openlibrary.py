import asyncio
from dataclasses import dataclass

import httpx

from .config import get_settings


@dataclass
class OpenLibraryWork:
    work_id: str
    title: str
    description: str
    subjects: list[str]


class OpenLibraryClient:
    BASE = "https://openlibrary.org"
    RATE_LIMIT_SEC = 1 / 3  # 3 req/s with descriptive User-Agent

    def __init__(self) -> None:
        s = get_settings()
        self._client = httpx.AsyncClient(
            headers={"User-Agent": s.openlibrary_user_agent},
            timeout=10.0,
        )
        self._last_call = 0.0

    async def __aenter__(self) -> "OpenLibraryClient":
        return self

    async def __aexit__(self, *_exc) -> None:
        await self._client.aclose()

    async def _throttle(self) -> None:
        loop = asyncio.get_event_loop()
        now = loop.time()
        wait = self._last_call + self.RATE_LIMIT_SEC - now
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_call = loop.time()

    async def fetch_work_by_isbn(self, isbn: str) -> OpenLibraryWork | None:
        await self._throttle()
        book_resp = await self._client.get(f"{self.BASE}/isbn/{isbn}.json")
        if book_resp.status_code != 200:
            return None
        book = book_resp.json()
        works = book.get("works") or []
        if not works:
            return None
        work_key = works[0]["key"].split("/")[-1]

        await self._throttle()
        work_resp = await self._client.get(f"{self.BASE}/works/{work_key}.json")
        if work_resp.status_code != 200:
            return None
        data = work_resp.json()

        desc = data.get("description", "") or ""
        if isinstance(desc, dict):
            desc = desc.get("value", "")

        return OpenLibraryWork(
            work_id=work_key,
            title=data.get("title") or book.get("title", ""),
            description=desc,
            subjects=data.get("subjects", []) or [],
        )
