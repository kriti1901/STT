"""FastAPI app: serves the notepad page and the transcription API.

Run locally with:
    uvicorn app.main:app --port 8000
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import transcriber

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB is far more than a few minutes of speech

app = FastAPI(title="Speech Notepad")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "models": list(transcriber.MODEL_NAMES),
        "loaded_models": transcriber.loaded_models(),
        "languages": list(transcriber.LANGUAGE_CODES),
    }


@app.post("/api/load")
async def load(model: str = Form("base")) -> JSONResponse:
    """Load a model ahead of time so the first transcription is faster."""
    if model not in transcriber.MODEL_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    try:
        await run_in_threadpool(transcriber.load_model, model)
    except Exception as exc:  # e.g. the model could not be downloaded
        raise HTTPException(status_code=503, detail=f"Could not load model: {exc}") from exc
    return JSONResponse({"model": model, "ready": True})


@app.post("/api/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    model: str = Form("base"),
    language: str = Form("english"),
) -> dict:
    """Accept recorded audio and return the recognised text."""
    if model not in transcriber.MODEL_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    if language not in transcriber.LANGUAGE_CODES:
        raise HTTPException(status_code=400, detail=f"Unknown language: {language}")

    data = await audio.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="No audio was received.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Recording is too large.")

    try:
        await run_in_threadpool(transcriber.load_model, model)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load model: {exc}") from exc

    try:
        text = await run_in_threadpool(transcriber.transcribe_bytes, data, model, language)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not decode or transcribe the audio: {exc}"
        ) from exc

    return {"text": text, "model": model, "language": language}
