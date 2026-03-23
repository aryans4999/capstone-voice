# VoicePowered: AI-Powered Insurance Assistant

VoicePowered is a cutting-edge, voice-enabled AI assistant designed specifically for the insurance industry. It streamlines the process of managing users, filing insurance claims, and performing automated damage analysis using a combination of LLMs, Speech-to-Text (STT), Text-to-Speech (TTS), and Computer Vision.

## 🚀 Key Features

- **Voice-First Interface**: Interact with the assistant using natural speech.
- **Real-time Transcription**: Powered by OpenAI's Whisper (via `faster-whisper`) for accurate STT.
- **Natural Voice Synthesis**: High-quality TTS using the `Kokoro` model for lifelike responses in English and Hindi.
- **Automated Claim Management**: 
  - Create and update insurance claims through conversation.
  - Link users to policy numbers and vehicle details.
- **AI Damage Detection**: Integrated computer vision to identify vehicle damages from uploaded images.
- **Intelligent Tool Calling**: Powered by Vercel AI SDK and Groq (Moonshot AI) to autonomously execute database operations and analysis.
- **Database Integration**: Robust data management using Supabase.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS, Shadcn/ui, Framer Motion
- **AI Integration**: Vercel AI SDK (@ai-sdk/react, @ai-sdk/groq)
- **State Management**: React Hooks & Context API

### Backend / AI Services
- **LLM**: Groq (Moonshot Kimi-k2-instruct)
- **STT**: Faster-Whisper (Python FastAPI Server)
- **TTS**: Kokoro-82M (Python FastAPI Server)
- **Database**: Supabase (PostgreSQL + Storage)

---

## 📂 Project Structure

```text
voicepowered/
├── app/                        # Next.js App Router
│   ├── api/
│   │   └── chat/               # Main AI Chat API Route (LLM logic + Tool Calling)
│   ├── favicon.ico
│   ├── globals.css             # Global Tailwind styles
│   ├── layout.tsx              # Root layout with providers
│   └── page.tsx                # Main Chat Interface
├── components/
│   ├── ai-elements/            # Specialized AI/Chat UI components
│   │   ├── agent.tsx           # AI Agent avatar/status
│   │   ├── conversation.tsx    # Chat message list
│   │   ├── mic-selector.tsx    # Microphone selection & status
│   │   ├── speech-input.tsx    # Voice recording logic & UI
│   │   ├── transcription.tsx   # Live transcription display
│   │   ├── voice-selector.tsx  # TTS voice selection
│   │   └── ...                 # Other AI-specific UI components (code-block, plan, etc.)
│   ├── ui/                     # Reusable Shadcn/ui components (buttons, inputs, etc.)
│   └── theme-provider.tsx      # Dark/Light mode provider
├── hooks/                      # Custom React hooks
├── lib/
│   ├── kokoro-worker.ts        # Client-side worker for TTS processing
│   ├── supabase.ts             # Supabase client initialization
│   ├── tools.ts                # AI Tool definitions (CRUD for users, claims, cars)
│   └── utils.ts                # Utility functions
├── public/                     # Static assets
├── tts-server.py               # FastAPI server for Kokoro TTS (Port 8002)
├── whisper-server.py           # FastAPI server for Faster-Whisper STT (Port 8001/v1)
├── components.json             # Shadcn/ui configuration
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── .env.local                  # Environment variables (API Keys, Supabase URL)
```

---

## ⚙️ Detailed File Explanations

### Core Logic
- **`app/api/chat/route.ts`**: The heartbeat of the application. It receives messages, sends them to Groq, and handles "maxSteps" for complex tool-calling chains (e.g., getting a user -> getting their car -> creating a claim).
- **`lib/tools.ts`**: Defines the capabilities of the AI. Tools include:
  - `get_user`: Fetch user data by ID or policy number.
  - `create_claim`: A multi-step tool that saves claim data, damage summaries, and image URLs to Supabase.
  - `damage_tool`: Communicates with an external detection service to analyze images.
  - `get_car` / `get_car_parts`: Lookup vehicle specs and repair costs.

### AI Servers (Python)
- **`whisper-server.py`**: A lightweight FastAPI wrapper around `faster-whisper`. It exposes an OpenAI-compatible `/v1/audio/transcriptions` endpoint.
- **`tts-server.py`**: Uses the `Kokoro-82M` model to generate high-quality audio. It supports speed adjustment and multiple languages (English/Hindi).

### UI Components
- **`components/ai-elements/`**: Contains "intelligent" components that handle complex states like streaming text, tool-calling visualizations, and audio playback.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- Supabase Account
- Groq API Key

### 1. Frontend Setup
```bash
npm install
cp .env.example .env.local # Add your API keys here
npm run dev
```

### 2. Python Servers Setup
It is recommended to use a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install fastapi uvicorn faster-whisper kokoro soundfile torch numpy
```

Run the STT server:
```bash
python whisper-server.py
```

Run the TTS server:
```bash
python tts-server.py
```

---

## 🔄 Project Architecture

1.  **Input**: User speaks into the `speech-input.tsx` component.
2.  **Transcription**: Audio is sent to `whisper-server.py`, which returns text.
3.  **Brain**: Text is sent to `app/api/chat/route.ts`. The LLM (Groq) decides if it needs to call a tool (from `lib/tools.ts`).
4.  **Action**: If a tool is called (e.g., `get_user`), it interacts with **Supabase**.
5.  **Output**: The LLM's text response is sent back to the frontend and passed to `tts-server.py` (via `kokoro-worker.ts`) to be played back as audio.

---

## 📝 License
This project is private and intended for internal use.
