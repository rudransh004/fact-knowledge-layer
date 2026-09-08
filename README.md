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

## Video Demo

[Link to 3-minute Video Demo](https://youtube.com/YOUR_VIDEO_DEMO_LINK_HERE) *(Replace with your 3-minute video demo link showing a PDF being processed and the four required cases)*

## API

- `GET /api/demo-cases`: four evaluator-facing, evidence-grounded examples.
- `POST /api/upload`: validates and persists a PDF as a queued extraction job, then immediately returns a `job_id`.
- `GET /api/jobs/{job_id}`: reports queued, processing, completed, quota-exhausted, or failed progress.
- `POST /api/reconcile`: compares candidate facts across documents.
- `GET /api/facts` and `GET /api/relationships`: inspect SQLite-backed facts and relationships.

## Approach

1. SQLite persists `ExtractionJob`, `FactRecord`, and `RelationshipRecord` data in `fact_knowledge_layer.db`, requiring no external database service.
2. PyMuPDF extracts the complete PDF with one-based page numbers. The worker groups contiguous pages into batches of 10.
3. The async Google GenAI client makes one structured extraction request per batch. Tenacity retries transient 503 errors; a 429 quota error stops the job as `QUOTA_EXHAUSTED` without discarding prior batches.
4. Every committed fact requires a document name, page, and verbatim quote. Missing units or temporal scopes remain null and are recorded as ambiguity notes instead of being guessed.
5. The background worker commits facts after every batch and updates `processed_pages`, so a restart or quota failure preserves completed work.
6. Reconciliation reads persisted facts, applies deterministic entity/attribute/unit filtering, and stores relationships back in SQLite.
7. The frontend polls job progress, displays partial/quota states, and exposes reconciliation as an explicit action.

## Required Cases

The `/api/demo-cases` response and dashboard show:

- corroboration of Delhivery's 2011 incorporation/founding date;
- an unresolved PIN-code coverage disparity;
- a revenue difference explained by standalone versus pro forma consolidated scope;
- an EBITDA/adjusted-EBITDA footnote dependency representing an extraction failure mode.

## Limitations and Next Steps

Live extraction requires Gemini quota. Batch size is 10 pages, so an 89-page PDF requires roughly 9 extraction requests rather than 89. The local worker runs in-process for zero-config setup; a production deployment would move jobs to a durable queue, add document hashing/deduplication, OCR for scanned PDFs, and human review for low-confidence or ambiguous facts. Demo cases are intentionally fixed examples; uploaded documents use the general extraction and candidate-reconciliation path.

## Additional Notes

Credentials belong only in `.env`, which is ignored by Git. The system never asks the model to expose private chain-of-thought; it stores final, auditable rationales tied to the two cited facts.

## Before You Submit Checklist

- [x] The project runs from instructions and accepts new PDFs through the UI and API (`/api/upload`).
- [x] Results contain facts, verbatim source evidence with 1-based page numbers, and cross-document relationships.
- [x] Demonstrates all four required cases (`/api/demo-cases` and live `/api/reconcile`).
- [ ] Documented approach in `README.md` and added a demo video of 3 minutes or less.

