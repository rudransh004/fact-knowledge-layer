from pathlib import Path

from pypdf import PdfReader


def extract_pages(pdf_path: str | Path) -> list[dict[str, int | str]]:
    """Extract text while retaining the one-based source page number."""
    reader = PdfReader(str(pdf_path))
    return [
        {"page_number": page_number, "text": page.extract_text() or ""}
        for page_number, page in enumerate(reader.pages, start=1)
    ]
