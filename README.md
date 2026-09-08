# Fact Knowledge Layer

A starter project for extracting, validating, and reconciling facts from PDF documents.

## Structure

- `backend/app`: FastAPI application and extraction services
- `backend/data/starter_docs`: Place source PDFs here
- `frontend`: Reserved for the Next.js application

## Backend setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

$env:GEMINI_API_KEY = "your-api-key"
uvicorn backend.app.main:app --reload
```

Run the verification script with:

```powershell
python backend\test_extraction.py
```
