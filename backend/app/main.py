from fastapi import FastAPI

app = FastAPI(title="Fact Knowledge Layer")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
