// Microphone capture. Records with MediaRecorder, then decodes the clip and
// resamples it to 16 kHz mono Float32 — the format Whisper expects.

export const TARGET_SAMPLE_RATE = 16000;

export class Recorder {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  /** Ask for the microphone and start recording. Throws if permission is denied. */
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250); // collect data every 250 ms
  }

  /** Stop recording and return the audio as 16 kHz mono Float32Array. */
  async stop() {
    const recorder = this.mediaRecorder;
    if (!recorder) throw new Error('Recording has not started.');

    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    this.releaseMic();

    const type = recorder.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    this.mediaRecorder = null;

    if (blob.size === 0) return new Float32Array(0);
    return decodeToMono16k(await blob.arrayBuffer());
  }

  /** Stop the mic without producing audio (used on cancel/unload). */
  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.releaseMic();
  }

  releaseMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/** Decode any browser-supported audio container into 16 kHz mono samples. */
async function decodeToMono16k(arrayBuffer) {
  // An AudioContext at 16 kHz makes the browser resample for us.
  const ctx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: TARGET_SAMPLE_RATE,
  });
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const { numberOfChannels, length } = buffer;
    if (numberOfChannels === 1) return buffer.getChannelData(0).slice();

    // Downmix multi-channel audio to mono by averaging.
    const mono = new Float32Array(length);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
    }
    return mono;
  } finally {
    ctx.close();
  }
}
