# STT — Speech Notepad (Python)

A notepad-style web app that turns your speech into text. Press **Start recording**, speak, press **Stop**, and the words appear in the editor.

- **Python backend:** FastAPI server with [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (OpenAI Whisper) for speech recognition.
- **Offline:** after the speech model is downloaded once, no audio or internet access is needed.
- **English and Hindi**, plus auto-detect.
- **Notepad features:** New, Open `.txt`, Save `.txt`, Copy, Clear, font size, and typing alongside dictation.

The browser page uses a small amount of JavaScript to record from the microphone. All speech recognition runs in Python on the server.

## Requirements

- Python 3.10 or newer
- A browser with microphone access (Chrome, Edge, or Firefox)
- About 150 MB of free disk space for the default `base` model, downloaded on first use

## Setup and run

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Open http://localhost:8000 and allow microphone access when the browser asks.

The first time a model is used, the server downloads it from Hugging Face. This needs internet once. After that the model is cached on disk, and the app works without a connection.

## Choosing a model

| Model | Speed | Accuracy (esp. Hindi) | Download |
|---|---|---|---|
| Tiny | fastest | lower | smallest |
| Base (default) | balanced | good | medium |
| Small | slowest | best | largest |

Change it in the **Model** dropdown. The selected model is loaded on the server when you choose it. A GPU is used automatically when CUDA is available.

## Usage

1. Choose a **Language** (English, Hindi, or Auto-detect).
2. Press **Start recording** (or **Ctrl/Cmd + Space**) and speak.
3. Press **Stop**. The audio is sent to the server, transcribed, and inserted at the cursor.
4. Edit the text freely. Use **Save** to download it as a `.txt` file.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | the notepad page |
| GET | `/api/health` | status, available and loaded models, languages |
| POST | `/api/load` | load a model ahead of time (form field `model`) |
| POST | `/api/transcribe` | upload audio (form fields `audio`, `model`, `language`) and get `{"text": ...}` |

Example:

```bash
curl -X POST -F "audio=@recording.wav" -F model=base -F language=english http://localhost:8000/api/transcribe
```

## Tests

```bash
pytest tests/test_api.py                 # API tests, model mocked, no download needed
uvicorn app.main:app --port 8000 &       # start the server first for the UI tests
CHROMIUM_PATH=/path/to/chromium pytest tests/test_ui.py
```

`test_ui.py` uses Playwright with a fake microphone. Run `playwright install chromium` once if you do not have a Chromium binary, or set `CHROMIUM_PATH`. The UI tests are skipped if the server is not running.

## Project layout

```
app/main.py            FastAPI routes: page, health, load, transcribe
app/transcriber.py     faster-whisper model cache and transcription
static/index.html      page layout
static/app.js          recording, upload, editor actions
static/style.css       styles (light and dark mode)
tests/test_api.py      API tests (mocked model)
tests/test_ui.py       browser tests (fake microphone)
requirements.txt       Python dependencies
```

## Known limits

- Accuracy depends on the model and on microphone quality. Hindi is weaker on the `tiny` model.
- Recording is batch-based: the text appears after you press Stop, not live while you speak.
- Uploads are limited to 25 MB per recording.
- The server runs one transcription at a time per model, so simultaneous recordings from several users will queue.
