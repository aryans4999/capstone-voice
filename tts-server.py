from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from kokoro import KModel, KPipeline
import io
import soundfile as sf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipelines for English and Hindi
# Note: This assumes the user has the model files or they will be downloaded on first run
pipeline_en = KPipeline(lang_code='a') # English
pipeline_hi = KPipeline(lang_code='h') # Hindi

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    lang: str = "en"

@app.post("/tts")
async def generate_tts(request: TTSRequest):
    try:
        pipeline = pipeline_hi if request.lang == "hi" else pipeline_en
        
        # Generate audio
        # generator returns (graphemes, phonemes, audio)
        generator = pipeline(request.text, voice=request.voice, speed=1, split_pattern=r'\n+')
        
        # Collect all audio chunks
        audio_chunks = []
        for _, _, audio in generator:
            audio_chunks.append(audio)
        
        if not audio_chunks:
            raise HTTPException(status_code=500, detail="No audio generated")
            
        # Concatenate audio chunks
        import numpy as np
        full_audio = np.concatenate(audio_chunks)
        
        # Convert to WAV in memory
        buffer = io.BytesIO()
        sf.write(buffer, full_audio, 24000, format='WAV')
        buffer.seek(0)
        
        return Response(content=buffer.read(), media_type="audio/wav")
        
    except Exception as e:
        print(f"Error generating TTS: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
