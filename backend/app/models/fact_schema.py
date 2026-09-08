from pydantic import BaseModel, Field
from typing import List, Optional

class Provenance(BaseModel):
    document_name: str = Field(description="Name of the source PDF document")
    page_number: int = Field(description="1-based page number where the fact is stated")
    exact_quote: str = Field(description="Verbatim sentence or table snippet containing the evidence")

class Fact(BaseModel):
    fact_id: str = Field(description="Unique deterministic or generated identifier")
    entity: str = Field(description="Subject entity, e.g., 'Delhivery Limited'")
    attribute: str = Field(description="Canonical metric or property, e.g., 'Offer for Sale size'")
    value_raw: str = Field(description="Literal text representation, e.g., '₹12,350.00 million'")
    value_normalized: Optional[float] = Field(
        default=None, 
        description="Standardized float value for numerical facts (e.g., converted to base units)"
    )
    unit: Optional[str] = Field(default=None, description="Standardized unit (e.g., 'INR', 'Percentage')")
    temporal_scope: Optional[str] = Field(
        default=None, 
        description="Time period or date applicable, e.g., 'FY2022', 'May 14, 2022'"
    )
    context_modifiers: List[str] = Field(
        default_factory=list, 
        description="Crucial qualifying conditions: e.g., 'Restated', 'Fully diluted basis'"
    )
    provenance: Provenance

class ExtractionResponse(BaseModel):
    facts: List[Fact]