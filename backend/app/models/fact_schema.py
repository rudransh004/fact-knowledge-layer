from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


_GEMINI_SCHEMA_KEYS = {
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "enum",
    "maxItems",
    "minItems",
    "properties",
    "required",
    "minProperties",
    "maxProperties",
    "items",
    "propertyOrdering",
}


def gemini_response_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Convert Pydantic JSON Schema to the subset accepted by Gemini."""
    raw_schema = model.model_json_schema()
    definitions = raw_schema.get("$defs", {})

    def convert(node: Any) -> Any:
        if isinstance(node, list):
            return [convert(item) for item in node]
        if not isinstance(node, dict):
            return node

        reference = node.get("$ref")
        if reference:
            definition_name = reference.rsplit("/", 1)[-1]
            return convert(definitions[definition_name])

        nullable = False
        variants = node.get("anyOf")
        if variants:
            non_null_variants = [variant for variant in variants if variant.get("type") != "null"]
            if len(non_null_variants) == 1 and len(non_null_variants) != len(variants):
                node = {**non_null_variants[0], "nullable": True}
                nullable = True

        converted = {
            key: convert(value)
            for key, value in node.items()
            if key in _GEMINI_SCHEMA_KEYS and key != "nullable"
        }
        if nullable or node.get("nullable"):
            converted["nullable"] = True
        return converted

    return convert(raw_schema)

class Provenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_name: str = Field(min_length=1, description="Name of the source PDF document")
    page_number: int = Field(ge=1, description="1-based page number where the fact is stated")
    exact_quote: str = Field(min_length=1, description="Verbatim evidence from the source page")

    @field_validator("document_name", "exact_quote")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

class Fact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_id: str = Field(min_length=1, description="Stable identifier for the extracted fact")
    entity: str = Field(min_length=1, description="Canonical subject entity")
    attribute: str = Field(min_length=1, description="Canonical metric or property")
    value_raw: str = Field(min_length=1, description="Literal value as written in the source")
    value_normalized: float | None = Field(
        default=None,
        description="Normalized numeric value in the declared unit, when safely determinable",
    )
    unit: str | None = Field(default=None, description="Normalized unit; null when absent or ambiguous")
    temporal_scope: str | None = Field(default=None, description="Period or as-of date; null when absent")
    context_modifiers: list[str] = Field(default_factory=list, description="Scope and qualification modifiers")
    ambiguity_notes: list[str] = Field(
        default_factory=list,
        description="Short notes for missing units, unclear periods, or unresolved qualifiers",
    )
    provenance: Provenance

    @field_validator("fact_id", "entity", "attribute", "value_raw")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

class ExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    facts: list[Fact] = Field(default_factory=list)

class FactRelationship(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relationship_id: str = Field(min_length=1, description="Stable relationship identifier")
    relationship_type: Literal[
        "CORROBORATION",
        "GENUINE_CONTRADICTION",
        "RECONCILED_CONTRADICTION",
        "REASONING_FAILURE_CASE"
    ] = Field(description="Classification of the relationship between facts")
    fact_a: Fact
    fact_b: Fact
    explanation: str = Field(
        min_length=1,
        description="Concise evidence-based rationale; do not reveal private chain-of-thought",
    )
    reconciliation_dimension: str | None = Field(default=None, description="Dimension explaining the relationship")

class ReconciliationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relationships: list[FactRelationship] = Field(default_factory=list)