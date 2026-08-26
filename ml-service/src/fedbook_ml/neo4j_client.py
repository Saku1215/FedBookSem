from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from .config import get_settings


class Neo4jClient:
    def __init__(self, driver: AsyncDriver):
        self._driver = driver

    @classmethod
    def from_env(cls) -> "Neo4jClient":
        s = get_settings()
        driver = AsyncGraphDatabase.driver(
            s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password)
        )
        return cls(driver)

    async def read(self, cypher: str, params: dict[str, Any] | None = None) -> list[dict]:
        async with self._driver.session() as session:
            result = await session.run(cypher, params or {})
            return [dict(record) async for record in result]

    async def write(self, cypher: str, params: dict[str, Any] | None = None) -> list[dict]:
        async def _tx(tx, c, p):
            result = await tx.run(c, p)
            return [dict(record) async for record in result]

        async with self._driver.session() as session:
            return await session.execute_write(_tx, cypher, params or {})

    async def close(self) -> None:
        await self._driver.close()
