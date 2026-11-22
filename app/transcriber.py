"""Whisper model cache and transcription, using faster-whisper (CTranslate2).

Models are downloaded from Hugging Face the first time they are used and then
cached on disk, so later runs work without an internet connection.
"""

from __future__ import annotations

import io
import threading
from typing import Optional

from faster_whisper import WhisperModel

# Model names shown in the UI -> faster-whisper model identifiers.
MODEL_NAMES = {"tiny": "tiny", "base": "base", "small": "small"}

# UI language choice -> Whisper language code (None = auto-detect).
LANGUAGE_CODES = {"english": "en", "hindi": "hi", "auto": None}

_models: dict[str, WhisperModel] = {}
_lock = threading.Lock()


def _device_and_compute_type() -> tuple[str, str]:
    """Use the GPU with float16 when CUDA is available, otherwise the CPU with int8."""
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:  # ctranslate2 missing CUDA support, or no driver
        pass
    return "cpu", "int8"


def load_model(model_name: str) -> WhisperModel:
    """Return a loaded model, loading and caching it on first use."""
    if model_name not in MODEL_NAMES:
        raise ValueError(f"Unknown model: {model_name}")
    with _lock:
        if model_name not in _models:
            device, compute_type = _device_and_compute_type()
            _models[model_name] = WhisperModel(
                MODEL_NAMES[model_name], device=device, compute_type=compute_type
            )
        return _models[model_name]


def loaded_models() -> list[str]:
    """Names of the models that are currently loaded in memory."""
    with _lock:
        return sorted(_models)


def transcribe_bytes(audio: bytes, model_name: str, language: str) -> str:
    """Transcribe an uploaded audio file (WebM, WAV, MP3, ...) and return the text.

    `language` is one of the keys in LANGUAGE_CODES. This call blocks, so run it
    in a worker thread from async code.
    """
    if language not in LANGUAGE_CODES:
        raise ValueError(f"Unknown language: {language}")

    model = load_model(model_name)
    segments, _info = model.transcribe(
        io.BytesIO(audio),
        language=LANGUAGE_CODES[language],
        task="transcribe",
        beam_size=5,
        vad_filter=True,  # skip silence so it is not transcribed as noise
    )
    text = " ".join(segment.text.strip() for segment in segments)
    return text.strip()
