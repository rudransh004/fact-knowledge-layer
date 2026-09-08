from backend.app.models.fact_schema import ExtractionResult


def extract_facts(document_name: str, pages: list[dict[str, int | str]]) -> ExtractionResult:
    """Return the strict extraction shape; Gemini integration belongs here."""
    return ExtractionResult(document=document_name, facts=[])
