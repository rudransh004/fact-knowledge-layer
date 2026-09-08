import json
import os
from typing import Any

from google import genai
from google.genai import types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from backend.app.models.fact_schema import Fact, ExtractionResponse, gemini_response_schema


class QuotaExhaustedError(RuntimeError):
    """The provider rejected the request because the project quota is exhausted."""


class TransientGeminiError(RuntimeError):
    """A provider outage that is safe to retry."""


def _is_transient_error(error: BaseException) -> bool:
    message = str(error).lower()
    return "503" in message or "unavailable" in message


class FactExtractor:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing")
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=90_000),
        )

    @retry(
        retry=retry_if_exception(_is_transient_error),
        wait=wait_exponential(multiplier=2, min=2, max=16),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def _generate(self, prompt: str) -> Any:
        try:
            return await self.client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=gemini_response_schema(ExtractionResponse),
                    temperature=0.0,
                ),
            )
        except Exception as exc:
            message = str(exc).lower()
            if "429" in message or "resource exhausted" in message or "quota" in message:
                raise QuotaExhaustedError(str(exc)) from exc
            if _is_transient_error(exc):
                raise TransientGeminiError(str(exc)) from exc
            raise

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
        prompt = f"""
You are an evidence-grounded fact extraction engine.
Extract atomic, verifiable numerical and semantic facts from this contiguous PDF page batch.

Return only JSON matching ExtractionResponse.
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

        try:
            response = await self._generate(prompt)
            data = json.loads(response.text)
            return ExtractionResponse.model_validate(data).facts
        except QuotaExhaustedError:
            raise
        except Exception as exc:
            raise RuntimeError(
                f"Gemini extraction failed for pages {first_page}-{last_page}: {exc}"
            ) from exc

    async def extract_pages(
        self,
        doc_name: str,
        pages: list[dict[str, Any]],
        max_concurrency: int = 1,
    ) -> list[Fact]:
        """Compatibility helper; callers should prefer extract_batch for job commits."""
        return await self.extract_batch(doc_name, pages)
