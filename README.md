# Narrative-to-Visual Story Agent

Turn a free-form story into a director-style storyboard, and generate a visual asset per scene (via Hugging Face Inference Providers).

## Project flow (architecture)

```mermaid
flowchart TD
  U[User] -->|Enter story and seed| FE[Frontend UI]

  FE -->|POST /generate-story| API[Backend API]

  API -->|Validate request| VAL[Request schema]

  VAL -->|Generate script| LLM[GitHub Models]
  LLM -->|StoryScript JSON| SCRIPT[StoryScript]

  SCRIPT -->|For each scene visual_prompt| HF[Hugging Face text to video]

  HF -->|MP4 bytes| SAVE[Save to backend generated folder]
  SAVE -->|Serve files| STATIC[GET /generated/file]

  STATIC --> RESP[API response: script and assets]
  RESP --> FE

  FE -->|Render timeline| UI[Storyboard timeline]
  UI --> U

  %% optional operational bits
  API --> HEALTH[GET /health endpoint]
  API --> KEEPALIVE[Optional self ping worker]
  KEEPALIVE --> HEALTH
```

- Frontend entry: `frontend/src/App.jsx` (calls backend and renders storyboard)
- Backend entry: `backend/main.py` (FastAPI + generation pipeline)
- Main endpoint: `POST /generate-story`
- Static assets: `GET /generated/<filename>` (served from `backend/generated/`)

## Run the project

See the step-by-step guide here: [`RUN.md`](./RUN.md).

## Local development

- Backend: FastAPI service (generates the script + calls the HF text-to-video endpoint).
- Frontend: Vite + React UI (shows the progress tracker and the per-scene assets).

## Deployment note (Render)

The backend exposes `GET /health` and (optionally) can self-ping to reduce idle sleep during demos.
For extra reliability, you can also use an external uptime monitor to hit:

- `https://<your-render-service>.onrender.com/health`

