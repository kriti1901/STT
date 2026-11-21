import { Recorder } from './recorder.js';
import { transcribe, loadModel } from './transcriber.js';

const $ = (id) => document.getElementById(id);

const els = {
  editor: $('editor'),
  recordBtn: $('recordBtn'),
  recordLabel: $('recordLabel'),
  status: $('status'),
  progressWrap: $('progressWrap'),
  progressBar: $('progressBar'),
  languageSelect: $('languageSelect'),
  modelSelect: $('modelSelect'),
  fontSizeSelect: $('fontSizeSelect'),
  newBtn: $('newBtn'),
  openBtn: $('openBtn'),
  saveBtn: $('saveBtn'),
  copyBtn: $('copyBtn'),
  clearBtn: $('clearBtn'),
  fileInput: $('fileInput'),
  wordCount: $('wordCount'),
  offlineBadge: $('offlineBadge'),
};

const recorder = new Recorder();
let busy = false; // true while transcribing

// ---------- status helpers ----------

function setStatus(message, kind = 'info') {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
}

function showProgress(percent) {
  els.progressWrap.hidden = percent == null;
  if (percent != null) els.progressBar.style.width = `${Math.round(percent)}%`;
}

function updateWordCount() {
  const words = els.editor.value.trim().split(/\s+/).filter(Boolean).length;
  els.wordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
}

// ---------- text insertion ----------

/** Insert text at the caret, adding a space when needed, then keep the caret after it. */
function insertAtCursor(text) {
  if (!text) return;
  const editor = els.editor;
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? editor.value.length;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);

  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const insert = (needsSpaceBefore ? ' ' : '') + text;

  editor.value = before + insert + after;
  const caret = (before + insert).length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  updateWordCount();
}

// ---------- recording ----------

async function toggleRecording() {
  if (busy) return;

  if (!recorder.mediaRecorder) {
    try {
      await recorder.start();
      setRecordingUI(true);
      setStatus('Recording… press Stop when you are done.', 'recording');
    } catch (err) {
      setStatus(micErrorMessage(err), 'error');
    }
    return;
  }

  setRecordingUI(false);
  busy = true;
  setStatus('Processing audio…', 'busy');

  try {
    const audio = await recorder.stop();
    if (audio.length === 0) {
      setStatus('No audio was captured. Try again.', 'error');
      return;
    }
    await runTranscription(audio);
  } catch (err) {
    console.error(err);
    setStatus(`Could not transcribe: ${err.message}`, 'error');
  } finally {
    busy = false;
    showProgress(null);
  }
}

async function runTranscription(audio) {
  const modelId = els.modelSelect.value;
  const language = els.languageSelect.value;
  const seconds = (audio.length / 16000).toFixed(1);

  setStatus(`Transcribing ${seconds} s of audio…`, 'busy');

  const text = await transcribe(audio, {
    modelId,
    language,
    onProgress: handleModelProgress,
  });

  if (!text) {
    setStatus('Nothing recognised. Speak closer to the microphone and try again.', 'error');
    return;
  }
  insertAtCursor(text);
  setStatus('Text added. Ready for the next recording.', 'ok');
}

/** Show model download progress (first use of a model only). */
function handleModelProgress(p) {
  if (p.status === 'progress' && typeof p.progress === 'number') {
    showProgress(p.progress);
    setStatus(`Downloading speech model… ${Math.round(p.progress)}%`, 'busy');
  } else if (p.status === 'ready') {
    showProgress(null);
  }
}

function setRecordingUI(recording) {
  els.recordBtn.classList.toggle('recording', recording);
  els.recordBtn.setAttribute('aria-pressed', String(recording));
  els.recordLabel.textContent = recording ? 'Stop' : 'Start recording';
}

function micErrorMessage(err) {
  if (err?.name === 'NotAllowedError') return 'Microphone permission was denied. Allow it in your browser settings.';
  if (err?.name === 'NotFoundError') return 'No microphone was found on this device.';
  return `Microphone error: ${err.message}`;
}

// ---------- model preloading ----------

async function preloadModel() {
  const modelId = els.modelSelect.value;
  setStatus('Loading speech model…', 'busy');
  try {
    await loadModel(modelId, handleModelProgress);
    showProgress(null);
    setStatus('Ready. Press “Start recording”.', 'ok');
    els.offlineBadge.hidden = false;
  } catch (err) {
    console.error(err);
    setStatus(
      `Could not load the speech model (${err.message}). An internet connection is needed the first time.`,
      'error',
    );
  }
}

// ---------- file and editor actions ----------

function newDocument() {
  if (els.editor.value && !confirm('Discard the current text and start a new document?')) return;
  els.editor.value = '';
  updateWordCount();
  setStatus('New document.', 'info');
}

function openFile() {
  els.fileInput.click();
}

async function handleFileChosen(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // allow choosing the same file again later
  if (!file) return;
  els.editor.value = await file.text();
  updateWordCount();
  setStatus(`Opened ${file.name}.`, 'ok');
}

function saveFile() {
  const name = `note-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  const blob = new Blob([els.editor.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Saved as ${name}.`, 'ok');
}

async function copyText() {
  try {
    await navigator.clipboard.writeText(els.editor.value);
    setStatus('Copied to clipboard.', 'ok');
  } catch {
    els.editor.select();
    setStatus('Copy failed. The text has been selected; press Ctrl+C.', 'error');
  }
}

function clearText() {
  if (els.editor.value && !confirm('Clear all text?')) return;
  els.editor.value = '';
  updateWordCount();
  setStatus('Cleared.', 'info');
}

// ---------- wiring ----------

els.recordBtn.addEventListener('click', toggleRecording);
els.newBtn.addEventListener('click', newDocument);
els.openBtn.addEventListener('click', openFile);
els.fileInput.addEventListener('change', handleFileChosen);
els.saveBtn.addEventListener('click', saveFile);
els.copyBtn.addEventListener('click', copyText);
els.clearBtn.addEventListener('click', clearText);
els.editor.addEventListener('input', updateWordCount);
els.fontSizeSelect.addEventListener('change', () => {
  els.editor.style.fontSize = els.fontSizeSelect.value;
});
els.modelSelect.addEventListener('change', preloadModel);

// Keyboard shortcut: Ctrl/Cmd + Space toggles recording.
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && (e.ctrlKey || e.metaKey) && !e.repeat) {
    e.preventDefault();
    toggleRecording();
  }
});

// Release the microphone if the page is closed mid-recording.
window.addEventListener('pagehide', () => recorder.cancel());

// Register the service worker in production so the app works offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW failed', err));
}

updateWordCount();
preloadModel();
