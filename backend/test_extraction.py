import json
import os
from pathlib import Path

import pymupdf
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.models.fact_schema import ExtractionResponse

# Load environment variables
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY is missing from .env")

# Initialize the official Google GenAI client
client = genai.Client(api_key=API_KEY)

def extract_page_text(pdf_path: str, page_num: int) -> str:
    """Extracts raw text from a 1-based page number using PyMuPDF."""
    doc = pymupdf.open(pdf_path)
    page = doc.load_page(page_num - 1)
    text = page.get_text()
    doc.close()
    return text

def test_extract_facts():
    pdf_file = PROJECT_ROOT / "backend" / "data" / "starter_docs" / "delhivery" / "01-delhivery-prospectus-2022-excerpt.pdf"
    target_page = 22  # Page 22 contains the Offer Size and Fresh Issue details
    
    if not os.path.exists(pdf_file):
        print(f"Error: File '{pdf_file}' not found. Please verify the path.")
        return

    print(f"[1/3] Parsing text from {pdf_file} (Page {target_page})...")
    raw_text = extract_page_text(pdf_file, target_page)

    prompt = f"""
    You are an expert financial analyst and data extraction system.
    Extract all distinct, verifiable facts (both numerical metrics and qualitative structural assertions) 
    from the text provided below.

    RULES:
    1. Every fact MUST link directly to an exact, unaltered quote in the source text.
    2. Normalize currency to base units where applicable.
    3. Identify any contextual modifiers such as 'Offer for Sale', 'Fresh Issue', etc.
    4. Document Name: '{os.path.basename(pdf_file)}'
    5. Page Number: {target_page}

    DOCUMENT TEXT:
    \"\"\"
    {raw_text}
    \"\"\"
    """

    print("[2/3] Calling Gemini API with Structured Output Schema...")
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractionResponse,
            temperature=0.0
        )
    )

    print("[3/3] Successfully extracted and validated facts:\n")
    structured_data = json.loads(response.text)
    print(json.dumps(structured_data, indent=2))

if __name__ == "__main__":
    test_extract_facts()