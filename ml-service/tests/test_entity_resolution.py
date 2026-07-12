import csv
from pathlib import Path

import pytest

from fedbook_ml.entity_resolution import EntityResolver


FIXTURE = Path(__file__).parent.parent / "data" / "fixtures" / "entity_resolution_labels.csv"


@pytest.mark.integration
async def test_resolution_accuracy_on_labelled_sample(neo4j_client):
    if not FIXTURE.exists():
        pytest.skip(f"fixture not present: {FIXTURE}")

    resolver = EntityResolver(neo4j_client)
    await resolver.warm_cache()

    correct = 0
    total = 0
    misses = []
    with FIXTURE.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            match = await resolver.resolve(row["mention_title"], row["mention_author"])
            got = match.isbn if match else None
            expected = row["expected_isbn"] or None
            if got == expected:
                correct += 1
            else:
                misses.append({
                    "title": row["mention_title"],
                    "expected": expected,
                    "got": got,
                })

    accuracy = correct / total if total else 0.0
    assert accuracy >= 0.90, (
        f"Only {accuracy:.0%} accurate ({correct}/{total}). Misses: {misses[:5]}"
    )
