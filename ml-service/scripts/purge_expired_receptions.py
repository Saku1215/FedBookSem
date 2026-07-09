"""Purge :PlatformReception nodes whose `expires_at` has passed.

Enforces YouTube's 30-day retention cap. Run daily via cron / Task Scheduler.
"""

import asyncio
from datetime import datetime, timezone

from fedbook_ml.neo4j_client import Neo4jClient


async def main() -> None:
    now = datetime.now(timezone.utc).isoformat()
    neo = Neo4jClient.from_env()
    result = await neo.write(
        """
        MATCH (r:PlatformReception)
        WHERE r.expires_at IS NOT NULL AND r.expires_at < $now
        DETACH DELETE r
        RETURN count(*) AS purged
        """,
        {"now": now},
    )
    purged = result[0]["purged"] if result else 0
    print(f"Purged {purged} expired PlatformReception nodes")
    await neo.close()


if __name__ == "__main__":
    asyncio.run(main())
