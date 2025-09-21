import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel
import uvicorn

# Windows 避免 HuggingFace 建软链接的问题
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

app = FastAPI()

model = WhisperModel("small", device="cpu", compute_type="int8")

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
  try:
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
      tmp.write(await file.read())
      tmp_path = tmp.name

    # 低资源配置（根据你机器调参）
    segments, info = model.transcribe(
      tmp_path,
      beam_size=1,
      vad_filter=True,
      vad_parameters=dict(min_silence_duration_ms=500),
    )
    text = " ".join(seg.text for seg in segments).strip()
    return {"text": text}
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
  finally:
    try:
      os.remove(tmp_path)
    except Exception:
      pass

if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=8001)
