from typing import Any

import pymupdf

class PDFParser:
    @staticmethod
    def parse_pdf_pages(pdf_bytes: bytes, max_pages: int | None = None) -> list[dict[str, Any]]:
        """
        Parses bytes of a PDF and returns a list of page dicts with 1-based page numbers.
        """
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        pages_content = []

        total_pages = len(doc) if max_pages is None else min(len(doc), max_pages)
        for page_idx in range(total_pages):
            page = doc.load_page(page_idx)
            text = page.get_text()
            if text.strip():
                pages_content.append({
                    "page_number": page_idx + 1,
                    "text": text
                })
        doc.close()
        return pages_content

    @staticmethod
    def parse_pdf_file(file_path: str, max_pages: int | None = None) -> list[dict[str, Any]]:
        with open(file_path, "rb") as f:
            return PDFParser.parse_pdf_pages(f.read(), max_pages=max_pages)

    @staticmethod
    def chunk_pages(
        pages: list[dict[str, Any]], pages_per_batch: int = 10
    ) -> list[list[dict[str, Any]]]:
        """Group contiguous pages so one model request can cover multiple pages."""
        if pages_per_batch < 1:
            raise ValueError("pages_per_batch must be positive")
        return [pages[index:index + pages_per_batch] for index in range(0, len(pages), pages_per_batch)]