import os
import time
from difflib import SequenceMatcher

from google import genai
from google.genai import types
from google.genai.errors import APIError

from backend.app.models.fact_schema import Fact, FactRelationship, ReconciliationResponse

class FactReconciler:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing")
        self.model = "gemini-3.5-flash-lite"
        self.client = genai.Client(api_key=api_key)

    @staticmethod
    def _candidate_pairs(facts: list[Fact]) -> list[tuple[Fact, Fact]]:
        candidates = []
        for index, left in enumerate(facts):
            for right in facts[index + 1:]:
                if left.provenance.document_name == right.provenance.document_name:
                    continue
                entity_score = SequenceMatcher(None, left.entity.lower(), right.entity.lower()).ratio()
                attribute_score = SequenceMatcher(None, left.attribute.lower(), right.attribute.lower()).ratio()
                same_numeric_unit = left.unit and left.unit == right.unit
                if entity_score >= 0.72 and (attribute_score >= 0.62 or same_numeric_unit):
                    candidates.append((left, right))
        return candidates

    def reconcile_facts(self, facts: list[Fact]) -> list[FactRelationship]:
        candidate_pairs = self._candidate_pairs(facts)
        if not candidate_pairs:
            return []

        facts_summary = [
            {"fact_a": left.model_dump(), "fact_b": right.model_dump()}
            for left, right in candidate_pairs[:40]
        ]

        import json
        schema_json = json.dumps(ReconciliationResponse.model_json_schema())
        
        prompt = f"""
You are an advanced Cross-Document Fact Reconciliation Engine.
You are given a list of atomic facts extracted from different documents or different pages.

Analyze the facts and identify relationships between facts from DIFFERENT sources or contexts.
You MUST classify each candidate comparison into one of these types:
1. 'CORROBORATION': Facts from two documents agree on the same metric, scope, and time, even if phrased differently.
2. 'GENUINE_CONTRADICTION': Facts refer to the exact same entity, metric, and time period, but state irreconcilable numbers/claims.
3. 'RECONCILED_CONTRADICTION': Surface-level contradiction where the numbers differ, BUT can be explained by context (e.g., Standalone vs Consolidated, Restated vs Original, Gross vs Net, or different reporting dates).
4. 'REASONING_FAILURE_CASE': Identify an extraction or reasoning ambiguity (e.g. multi-row table footnote dependency, missing qualifier, or ambiguous date period) and explain how the system detects or corrects it.
You MUST return a JSON object with this exact schema: {schema_json}. Do not include markdown formatting or explanations outside the JSON.

Give a concise, evidence-based rationale that names the relevant values, scopes, dates, units,
context modifiers, and provenance. Do not provide hidden chain-of-thought; return only the final rationale.
Do not invent relationships outside the candidate comparisons.

INPUT FACTS:
{json.dumps(facts_summary, indent=2)}
"""

        max_retries = 3
        attempt = 0
        while True:
            attempt += 1
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json"
                    )
                )
                
                if response.text:
                    import json
                    data = json.loads(response.text)
                    return ReconciliationResponse.model_validate(data).relationships
                else:
                    return []
                    
            except APIError as e:
                if e.code == 429 or e.code >= 500:
                    if attempt <= max_retries:
                        print(f"Gemini API limit/error during reconciliation, sleeping {10 * attempt}s...")
                        time.sleep(10 * attempt)
                        continue
                raise RuntimeError(f"Gemini reconciliation failed: {e}") from e
            except Exception as e:
                if attempt <= max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Gemini reconciliation failed: {e}") from e