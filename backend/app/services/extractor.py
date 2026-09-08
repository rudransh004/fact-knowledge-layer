import os
import asyncio
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError

from backend.app.models.fact_schema import Fact, ExtractionResponse

class QuotaExhaustedError(RuntimeError):
    """The provider rejected the request because the project quota is exhausted."""

class FactExtractor:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing")
        self.model = "gemini-3.5-flash-lite"
        self.client = genai.Client(api_key=api_key)

    async def extract_batch(
        self,
        doc_name: str,
        pages: list[dict[str, Any]],
    ) -> list[Fact]:
        if not pages:
            return []

        page_text = "\n\n".join(
            f"--- SOURCE PAGE {page['page_number']} ---\n{page['text']}"
            for page in pages
        )
        first_page = pages[0]["page_number"]
        last_page = pages[-1]["page_number"]
        
        import json
        schema_json = json.dumps(ExtractionResponse.model_json_schema())
        
        prompt = f"""
You are an evidence-grounded fact extraction engine.
Extract atomic, verifiable numerical and semantic facts from this contiguous PDF page batch.
You MUST return a JSON object with this exact schema: {schema_json}. Do not include markdown formatting or explanations outside the JSON.

Every fact MUST:
1. Use an exact verbatim quote from the supplied text.
2. Use the exact source document name '{doc_name}'.
3. Use the one-based page number printed in the SOURCE PAGE marker containing the quote.
4. Keep units and temporal scope null when they are absent or ambiguous, and explain ambiguity briefly.
5. Never merge claims from different pages into one quote or invent facts not grounded in the text.

The batch covers source pages {first_page} through {last_page}.

DOCUMENT TEXT:
{page_text}
"""
        max_retries = 3
        attempt = 0
        while True:
            attempt += 1
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json"
                    )
                )
                
                if response.text:
                    import json
                    data = json.loads(response.text)
                    return ExtractionResponse.model_validate(data).facts
                else:
                    raise ValueError("Empty response from Gemini")
                    
            except APIError as e:
                # 429 indicates rate limiting. 503 indicates transient server error.
                if e.code == 429 or e.code >= 500:
                    if attempt <= max_retries:
                        print(f"Gemini API limit/error (code {e.code}) for pages {first_page}-{last_page}, sleeping {10 * attempt}s...")
                        await asyncio.sleep(10 * attempt)
                        continue
                raise RuntimeError(f"Gemini extraction failed for pages {first_page}-{last_page}: {e}") from e
            except Exception as e:
                if attempt <= max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Gemini extraction failed: {e}") from e
