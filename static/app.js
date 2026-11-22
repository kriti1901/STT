// Speech notepad front end.
// Records from the microphone, sends the audio to the Python server (/api/transcribe)
// and inserts the returned text into the editor. All speech recognition happens on the server.

(() => {
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

  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let busy = false; // true while uploading or transcribing

  // ---------- status helpers ----------

  function setStatus(message, kind = 'info') {
    els.status.textContent = message;
    els.status.dataset.kind = kind;
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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start(250);
  }

  /** Stop recording and resolve with the recorded Blob and its MIME type. */
  function stopRecording() {
    return new Promise((resolve) => {
      const recorder = mediaRecorder;
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        releaseMic();
        mediaRecorder = null;
        chunks = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }

  function releaseMic() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function toggleRecording() {
    if (busy) return;

    if (!mediaRecorder) {
      try {
        await startRecording();
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
      const blob = await stopRecording();
      if (blob.size === 0) {
        setStatus('No audio was captured. Try again.', 'error');
        return;
      }
      await transcribeBlob(blob);
    } catch (err) {
      console.error(err);
      setStatus(`Could not transcribe: ${err.message}`, 'error');
    } finally {
      busy = false;
    }
  }

  /** Upload recorded audio to the server and insert the recognised text. */
  async function transcribeBlob(blob) {
    const form = new FormData();
    form.append('audio', blob, `recording.${extensionFor(blob.type)}`);
    form.append('model', els.modelSelect.value);
    form.append('language', els.languageSelect.value);

    setStatus('Transcribing on the server… (the first time a model is used may take longer)', 'busy');

    const data = await postForm('/api/transcribe', form);
    if (!data.text) {
      setStatus('Nothing recognised. Speak closer to the microphone and try again.', 'error');
      return;
    }
    insertAtCursor(data.text);
    setStatus('Text added. Ready for the next recording.', 'ok');
  }

  function extensionFor(mime) {
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('wav')) return 'wav';
    return 'webm';
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

  // ---------- server calls ----------

  /** POST a form and return the JSON body, or throw with the server's message. */
  async function postForm(url, form) {
    let response;
    try {
      response = await fetch(url, { method: 'POST', body: form });
    } catch {
      throw new Error('cannot reach the speech server. Is it running?');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body.detail === 'string' ? body.detail : response.statusText;
      throw new Error(detail);
    }
    return body;
  }

  /** Ask the server to load the selected model so the first recording is quicker. */
  async function preloadModel() {
    const model = els.modelSelect.value;
    setStatus(`Loading the “${model}” model on the server…`, 'busy');
    try {
      const form = new FormData();
      form.append('model', model);
      await postForm('/api/load', form);
      setStatus('Ready. Press “Start recording”.', 'ok');
      els.offlineBadge.hidden = false;
    } catch (err) {
      console.error(err);
      setStatus(`Could not load the speech model: ${err.message}`, 'error');
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

  // Ctrl/Cmd + Space toggles recording.
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.ctrlKey || e.metaKey) && !e.repeat) {
      e.preventDefault();
      toggleRecording();
    }
  });

  // Release the microphone if the page is closed mid-recording.
  window.addEventListener('pagehide', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    releaseMic();
  });

  // Hide the (unused in this version) progress bar.
  els.progressWrap.hidden = true;

  updateWordCount();
  preloadModel();
})();
