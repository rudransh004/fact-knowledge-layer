import json
import asyncio
import os
from typing import Any, List

from google import genai
from google.genai import types
from backend.app.models.fact_schema import Fact, ExtractionResponse

class FactExtractor:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing")
        self.client = genai.Client(api_key=api_key)

    def extract_from_page(self, doc_name: str, page_number: int, text: str) -> List[Fact]:
        if not text or len(text.strip()) < 40:
            return []

        prompt = f"""
        You are an expert fact extraction engine.
        Analyze the document page text provided below and extract all verifiable numerical and semantic assertions.

        MANDATORY RULES:
        1. Return only JSON matching the supplied ExtractionResponse schema.
        2. Link every fact to an EXACT, verbatim quote found in the text ('exact_quote').
        3. Normalize numeric values only when the unit and scale are clear; otherwise use null and add an ambiguity_note.
        4. Identify context modifiers and temporal scope. Never infer missing dates or units.
        4. Document Name: '{doc_name}'
        5. Page Number: {page_number}

        TEXT:
        \"\"\"
        {text}
        \"\"\"
        """

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ExtractionResponse,
                    temperature=0.0
                )
            )
            data = json.loads(response.text)
            return ExtractionResponse.model_validate(data).facts
        except Exception as e:
            print(f"Extraction warning on page {page_number}: {e}")
            raise RuntimeError(f"Gemini extraction failed on page {page_number}") from e

    async def extract_pages(
        self,
        doc_name: str,
        pages: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[Fact]:
        """Run blocking SDK calls off the event loop with bounded concurrency."""
        semaphore = asyncio.Semaphore(max_concurrency)

        async def extract_page(page: dict[str, Any]) -> list[Fact]:
            async with semaphore:
                return await asyncio.to_thread(
                    self.extract_from_page,
                    doc_name,
                    int(page["page_number"]),
                    str(page["text"]),
                )

        results = await asyncio.gather(*(extract_page(page) for page in pages))
        return [fact for page_facts in results for fact in page_facts]