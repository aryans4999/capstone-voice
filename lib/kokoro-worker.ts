import { KokoroTTS } from "kokoro-js";

let tts: KokoroTTS | null = null;

self.addEventListener("message", async (event) => {
  const { text, voice, lang } = event.data;

  try {
    if (!tts) {
      // Initialize the model with fp32 for better quality and stability
      // static/noise issues are often related to quantization (q8/q4) in WASM
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "fp32", 
        device: "webgpu",
      });
    }

    // Map language codes
    const langCode = lang === 'hi' ? 'h' : 'a';

    const audio = await tts.generate(text, { 
      voice,
      lang: langCode
    });
    
    const blob = await audio.toBlob();
    self.postMessage({ type: "complete", blob });
  } catch (error) {
    console.error("Worker TTS Error:", error);
    self.postMessage({ type: "error", error: (error as Error).message });
  }
});
