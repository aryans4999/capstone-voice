from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = WhisperModel("base", device="cpu", compute_type="int8")

@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        segments, _ = model.transcribe(tmp_path)
        text = " ".join(segment.text for segment in segments)
    finally:
        os.unlink(tmp_path)

    print(text)

    return {"text": text}
