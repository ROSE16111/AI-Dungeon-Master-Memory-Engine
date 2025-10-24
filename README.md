# AI-Dungeon-Master-Memory-Engine

## Overview

**AI-Dungeon-Master-Memory-Engine** is an intelligent DM assistant that:

- Records and transcribes **real-time speech** (via Whisper)
- Generates **incremental summaries** with Ollama (local LLM)
- Manages **campaigns**, **resources**, and **history**
- Extracts text from **uploaded documents** (PDF, Word, PNG)
- Stores results in a **SQLite + Prisma** database

---

## 1. Project Structure

```
AI-Dungeon-Master-Memory-Engine/
├─ requirements.txt                     # Backend dependencies
├─ server.py                            # Main backend service
│
├─ LLM/                                 # LLM experiments and scripts
│  ├─ narrative_driver.py
│  ├─ D&D_transcription*.txt
│  ├─ Output/ ...                       # Generator scripts
│  ├─ Train/ ...                        # Processing tools
│  └─ realtime_summary*/ ...
│
└─ dungeon-scribe/                      # Frontend
   ├─ README.md
   ├─ package.json                      # Frontend dependencies
   │
   ├─ prisma/                           # Database layer
   │  ├─ schema.prisma                  # Data models definition
   │  └─ migrations/ ...                # Migration history
   │
   ├─ public/                           # Static assets
   │  └─ worklets/pcm16-frames.js       # Audio processing
   |  └─ ...
   │
   └─ src/
      ├─ app/                           # Next.js App Router
      │  ├─ (all)/                      # Shared layout group
      │  │  ├─ dashboard/ ...           # Dashboard & recording pages
      │  │  ├─ resources/ ...           # Resource page
      │  │  ├─ campaigns/[id]/ ...      # Campaign space
      │  │  └─ history/ ...             # History page
      │  │
      │  └─ api/                        # Node runtime API routes
      │     ├─ upload/route.ts          # File upload and parsing
      │     ├─ analyze/route.ts         # Text analysis
      │     ├─ readFile/route.ts        # File reading
      │     ├─ chroma/ ...              # Chroma ingestion
      │     ├─ resources/ ...           # Resource CRUD
      │     └─ transcribe/route.ts      # Frontend transcription
      │
      └─ components/                    # UI components
         ├─ MaskedMap.tsx               # Map masking
         ├─ layout/topbar.tsx           # Top bar layout
         └─ ui/ ...                     # shadcn/ui component set


```

---

## 2. Frontend Setup (Next.js + Prisma)

### Step 1 – Install Node.js 20

```bash
winget install -e --id CoreyButler.NVMforWindows
nvm install 20
nvm use 20
node -v
npm -v
```

### Step 2 – Install dependencies

```bash
cd dungeon-scribe
npm install
```

### Step 3 – Initialize database

```bash
npx prisma init --datasource-provider sqlite
npx prisma generate
npx prisma migrate dev --name init
```

This creates a local SQLite database (`dev.db`) under `prisma/`.

### Step 4 – Run frontend

```bash
npm run dev
```

Open: **http://localhost:3000/dashboard**

Stop: `Ctrl + C`

---

## 3. Backend Setup (FastAPI + Whisper + Ollama)

### Step 1 – Create & activate virtual environment

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
```

### Step 2 – Install backend dependencies

```bash
pip install -r requirements.txt
```

Alternatively, can run `conda env create -f environment.yml` if using conda.

**requirements.txt summary**

```
# Web framework + ASGI server
fastapi>=0.110,<1.0
uvicorn[standard]>=0.29,<0.32

# Data validation
pydantic>=2.5,<3.0

# Core deps used directly
numpy>=1.24,<3.0
requests>=2.31,<3.0

# Vector DB
chromadb>=0.5.5,<0.6

# Audio / ASR
webrtcvad==2.0.10
faster-whisper>=1.0,<2.0

# Needed by FastAPI for UploadFile/File (multipart form parsing)
python-multipart>=0.0.9,<0.1
```

### Step 3 – Install and configure Ollama

Ollama provides local LLMs for summarization.

1. Download → https://ollama.com/download
2. Install two models:
   ```bash
   ollama pull phi3:medium
   ollama pull nomic-embed-text
   ```
3. Check:
   ```bash
   ollama list
   ```

### Step 4 – Run backend

```bash
python server.py
# or
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. Optional Dependencies

| Function             | Library                              | Command                                                | Notes                            |
| -------------------- | ------------------------------------ | ------------------------------------------------------ | -------------------------------- |
| Word (.docx) parsing | `mammoth`                            | `npm i mammoth`                                        | Extracts text                    |
| PDF parsing          | `pdf-parse`                          | `npm i pdf-parse`                                      | Parses text layer                |
| Image OCR            | `tesseract.js`, `node-tesseract-ocr` | `npm i tesseract.js node-tesseract-ocr`                | Requires local Tesseract install |
| PDF → Image          | Poppler                              | Download: https://blog.alivate.com.au/poppler-windows/ | Add `pdftoppm` to PATH           |

---

## 5. Run the Full System

step 1️. Start **backend**

```bash
python server.py
```

step 2️. Start **frontend**

```bash
cd dungeon-scribe
npm run dev
```

step 3️. Open browser:

> http://localhost:3000/dashboard

You can now record speech, see incremental summaries, upload resources, and manage campaigns.

See Test Materials folder so materials can that be used for testing.
---

## 6. Key Technologies

| Layer              | Technology                                   | Description          |
| ------------------ | -------------------------------------------- | -------------------- |
| Frontend           | Next.js (App Router), TailwindCSS, shadcn/ui | Modern web UI        |
| Backend            | FastAPI + Uvicorn                            | REST / WebSocket API |
| Speech Recognition | faster-whisper + webrtcvad                   | Real-time ASR        |
| LLM Summarization  | Ollama (phi3, nomic-embed-text)              | Local inference      |
| Database           | SQLite + Prisma                              | Lightweight local DB |
| File Extraction    | pdf-parse / mammoth / OCR                    | Text extraction      |

---

## 7. Common Issues

| Problem                 | Solution                                               |
| ----------------------- | ------------------------------------------------------ |
| `DATABASE_URL` missing  | Add `.env` → `DATABASE_URL="file:./prisma/dev.db"`     |
| Prisma error            | Run `npx prisma generate` and `npx prisma migrate dev` |
| WS error                | Ensure `server.py` is running (port 8000)              |
| Ollama connection error | Start Ollama manually: `ollama serve`                  |

---

## 8. Stop & Cleanup

```bash
# Stop frontend
Ctrl + C
# Stop backend
Ctrl + C
# Deactivate Python venv
deactivate
```

---
