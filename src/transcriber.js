// Loads a Whisper model with Transformers.js and turns audio into text.
// Everything runs in the browser; audio never leaves the device.

import { pipeline, env } from '@huggingface/transformers';

// Model files are cached by the browser (Cache API) after the first download,
// so later sessions can load them without a network connection.
env.useBrowserCache = true;

const pipelines = new Map(); // modelId -> Promise<pipeline>

/**
 * Load (or reuse) a Whisper pipeline.
 * @param {string} modelId
 * @param {(p: {status: string, progress?: number, file?: string}) => void} onProgress
 */
export function loadModel(modelId, onProgress = () => {}) {
  if (!pipelines.has(modelId)) {
    const promise = pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      progress_callback: onProgress,
    }).catch((err) => {
      pipelines.delete(modelId); // allow a retry after a failure
      throw err;
    });
    pipelines.set(modelId, promise);
  }
  return pipelines.get(modelId);
}

/**
 * Transcribe 16 kHz mono audio.
 * @param {Float32Array} audio
 * @param {{modelId: string, language: 'english'|'hindi'|'auto', onProgress?: Function}} opts
 * @returns {Promise<string>}
 */
export async function transcribe(audio, { modelId, language, onProgress }) {
  if (!audio || audio.length === 0) return '';

  const asr = await loadModel(modelId, onProgress);

  const options = {
    task: 'transcribe',
    chunk_length_s: 30, // Whisper works on 30-second windows
    stride_length_s: 5,  // overlap so words at chunk edges are not lost
    return_timestamps: false,
  };
  if (language !== 'auto') options.language = language; // omit to auto-detect

  const result = await asr(audio, options);
  const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text;
  return text.trim();
}
