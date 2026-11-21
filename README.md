# STT — Speech Notepad

A notepad-style web app that turns your speech into text. Press **Start recording**, speak, press **Stop**, and the words appear in the editor.

- **Offline recognition** using OpenAI Whisper, running in your browser (Transformers.js + ONNX Runtime Web). Audio never leaves your device.
- **English and Hindi**, plus auto-detect.
- **Notepad features:** New, Open `.txt`, Save `.txt`, Copy, Clear, font size, and typing alongside dictation.
- **Works offline** after the first visit (service worker caches the app and the model files).

## Requirements

- Node.js 18+ and npm
- A modern browser with microphone access (Chrome, Edge, or Firefox; Safari works with limits)
- About 150 MB of free space for the default `base` model, downloaded on first use

## Setup and run

```bash
npm install
npm run dev        # development server at http://localhost:5173
```

For the production build:

```bash
npm run build
npm run preview    # serves dist/ at http://localhost:4173
```

The first run downloads the speech model (internet needed once). After that the model is cached by the browser and the app works without a connection. Service workers only run on `localhost` or HTTPS, so use one of those.

## Choosing a model

| Model | Speed | Accuracy (esp. Hindi) | Download |
|---|---|---|---|
| Tiny | fastest | lower | smallest |
| Base (default) | balanced | good | medium |
| Small | slowest | best | largest |

Change it in the **Model** dropdown. The new model downloads the first time it is selected.

## Usage

1. Choose a **Language** (English, Hindi, or Auto-detect).
2. Press **Start recording** (or **Ctrl/Cmd + Space**) and speak.
3. Press **Stop**. The audio is transcribed and inserted at the cursor.
4. Edit the text freely. Use **Save** to download it as a `.txt` file.

Allow microphone access when the browser asks. If it was denied, enable it in the site settings.

## Tests

```bash
npx playwright install chromium   # first time only, or set CHROMIUM_PATH
npm test
```

Tests use a fake microphone and check the UI, recording toggle, word count, and phone-width layout.

## Project layout

```
index.html          page layout
src/main.js         UI wiring and actions
src/recorder.js     microphone capture, resampled to 16 kHz mono
src/transcriber.js  Whisper model loading and transcription
src/style.css       styles (light and dark mode)
public/sw.js        service worker for offline use
tests/e2e.spec.js   Playwright UI tests
```

## Known limits

- Accuracy depends on the model and on microphone quality. Hindi is weaker on the `tiny` model.
- Recording is batch-based (transcribed after Stop), not live as you speak.
- Very long recordings take proportionally longer to transcribe.
