from collections import defaultdict

from backend.app.models.fact_schema import Fact


def group_by_subject(facts: list[Fact]) -> dict[str, list[Fact]]:
    """Group facts to support cross-document comparison."""
    grouped: dict[str, list[Fact]] = defaultdict(list)
    for fact in facts:
        grouped[fact.subject].append(fact)
    return dict(grouped)
