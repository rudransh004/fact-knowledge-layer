import json
import os
from difflib import SequenceMatcher
from google import genai
from google.genai import types
from backend.app.models.fact_schema import Fact, FactRelationship, ReconciliationResponse

class FactReconciler:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing")
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
        """
        Groups facts and uses Gemini to analyze pairwise relationships across documents.
        """
        candidate_pairs = self._candidate_pairs(facts)
        if not candidate_pairs:
            return []

        facts_summary = [
            {"fact_a": left.model_dump(), "fact_b": right.model_dump()}
            for left, right in candidate_pairs[:40]
        ]

        prompt = f"""
        You are an advanced Cross-Document Fact Reconciliation Engine.
        You are given a list of atomic facts extracted from different documents or different pages.

        Analyze the facts and identify relationships between facts from DIFFERENT sources or contexts.
        You MUST classify each candidate comparison into one of these types:
        1. 'CORROBORATION': Facts from two documents agree on the same metric, scope, and time, even if phrased differently.
        2. 'GENUINE_CONTRADICTION': Facts refer to the exact same entity, metric, and time period, but state irreconcilable numbers/claims.
        3. 'RECONCILED_CONTRADICTION': Surface-level contradiction where the numbers differ, BUT can be explained by context (e.g., Standalone vs Consolidated, Restated vs Original, Gross vs Net, or different reporting dates).
        4. 'REASONING_FAILURE_CASE': Identify an extraction or reasoning ambiguity (e.g. multi-row table footnote dependency, missing qualifier, or ambiguous date period) and explain how the system detects or corrects it.

        Give a concise, evidence-based rationale that names the relevant values, scopes, dates, units,
        context modifiers, and provenance. Do not provide hidden chain-of-thought; return only the final rationale.
        Do not invent relationships outside the candidate comparisons.

        INPUT FACTS:
        {json.dumps(facts_summary[:60], indent=2)}
        """

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReconciliationResponse,
                    temperature=0.0
                )
            )
            data = json.loads(response.text)
            return [FactRelationship(**item) for item in data.get("relationships", [])]
        except Exception as e:
            print(f"Reconciliation error: {e}")
            raise RuntimeError("Gemini reconciliation failed") from e