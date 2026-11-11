/**
 * Source of the TTS Web Worker, kept as a string and started from a Blob URL so that nothing is added to the bundle
 * (no worker chunk, works in the single-file build too). The worker `import()`s kokoro-js from a public CDN at run
 * time. Messages in:  { type:'init', lib, model, dtype, device }  { type:'gen', id, text, voice, speed }
 * Messages out: { type:'progress', loaded, total } { type:'ready', device, dtype } { type:'clip', id, sr, samples, ms }
 *               { type:'error', id?, message }
 */
export const TTS_WORKER_SOURCE = `
let tts = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const lib = await import(m.lib);
      const files = new Map();
      const progress_callback = (p) => {
        if (p && p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded || 0, total: p.total });
          let loaded = 0, total = 0;
          for (const v of files.values()) { loaded += v.loaded; total += v.total; }
          self.postMessage({ type: 'progress', loaded, total });
        }
      };
      let device = m.device;
      try {
        tts = await lib.KokoroTTS.from_pretrained(m.model, { dtype: m.dtype, device, progress_callback });
      } catch (err) {
        if (device !== 'wasm') { device = 'wasm'; tts = await lib.KokoroTTS.from_pretrained(m.model, { dtype: 'q8', device, progress_callback }); }
        else throw err;
      }
      self.postMessage({ type: 'ready', device });
    } else if (m.type === 'gen') {
      if (!tts) throw new Error('not ready');
      const t0 = performance.now();
      const out = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const samples = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
      self.postMessage({ type: 'clip', id: m.id, sr: out.sampling_rate, samples, ms: performance.now() - t0 }, [samples.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
`;
