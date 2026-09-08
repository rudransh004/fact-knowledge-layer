# Fact Knowledge Layer

Evidence-grounded extraction and cross-document reconciliation for the Superjoin 2026 engineering assignment.

## Setup and Run

Requirements: Python 3.12+, `uv`, and Node.js 20+.

```powershell
uv sync
Copy-Item .env.example .env
# Set GEMINI_API_KEY in .env for extraction and reconciliation.

# Terminal 1: backend
uv run uvicorn backend.app.main:app --reload

# Terminal 2: frontend
Set-Location frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard loads four grounded demo cases immediately. Upload a PDF to `/api/upload` or use the Upload PDF control. Set `NEXT_PUBLIC_API_URL` when the API is not running at `http://127.0.0.1:8000`.

## API

- `GET /api/demo-cases`: four evaluator-facing, evidence-grounded examples.
- `POST /api/upload`: accepts a PDF, extracts page-aware facts, and updates the in-memory knowledge layer.
- `POST /api/reconcile`: compares candidate facts across documents.
- `GET /api/facts` and `GET /api/relationships`: inspect the current session state.

## Approach

1. PyMuPDF extracts text page by page and preserves one-based page numbers.
2. Gemini 2.5 Flash receives one page at a time with a strict Pydantic response schema. Every fact requires a document name, page, and verbatim quote. Missing units or temporal scopes remain null and are recorded as ambiguity notes instead of being guessed.
3. Page extraction runs through bounded `asyncio.to_thread` workers so blocking SDK calls do not stall FastAPI's event loop.
4. Reconciliation first applies deterministic entity/attribute/unit similarity filtering. Only plausible cross-document candidates are sent to Gemini, reducing irrelevant comparisons and token cost.
5. The relationship output uses four explicit buckets: `CORROBORATION`, `GENUINE_CONTRADICTION`, `RECONCILED_CONTRADICTION`, and `REASONING_FAILURE_CASE`. Explanations are concise, evidence-based rationales, not hidden chain-of-thought.
6. The frontend keeps both facts, their exact quotes, source documents, and page numbers visible in a side-by-side comparison.

## Required Cases

The `/api/demo-cases` response and dashboard show:

- corroboration of Delhivery's 2011 incorporation/founding date;
- an unresolved PIN-code coverage disparity;
- a revenue difference explained by standalone versus pro forma consolidated scope;
- an EBITDA/adjusted-EBITDA footnote dependency representing an extraction failure mode.

## Limitations and Next Steps

The prototype stores the current session in memory, processes up to 40 pages per upload, and requires Gemini for live extraction. A production deployment would add durable storage, job IDs and a queue, retries with backoff for rate limits, document hashing and deduplication, OCR for scanned PDFs, and human review for low-confidence or ambiguous facts. Demo cases are intentionally fixed examples; uploaded documents use the general extraction and candidate-reconciliation path.

## Additional Notes

Credentials belong only in `.env`, which is ignored by Git. The system never asks the model to expose private chain-of-thought; it stores final, auditable rationales tied to the two cited facts.
