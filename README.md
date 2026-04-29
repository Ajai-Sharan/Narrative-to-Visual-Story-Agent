# Narrative-to-Visual Story Agent

Turn a free-form story into a director-style storyboard, and generate a visual asset per scene (via Hugging Face Inference Providers).

## Project flow (architecture)

```mermaid
flowchart TD
  U[User] -->|Enter story + seed<br/>Click Generate Visual Story| FE[Frontend (React + Vite)<br/>frontend/src/App.jsx]

  FE -->|POST /generate-story<br/>(story_text, seed, generate_visuals=true)| API[Backend API (FastAPI)<br/>backend/main.py]

  API -->|Validate + normalize request| VAL[Pydantic models<br/>GenerateStoryRequest]

  VAL -->|Generate scene script| LLM[GitHub Models (Azure AI Inference)<br/>ChatCompletionsClient<br/>Model: openai/gpt-4.1 (env override)]
  LLM -->|Script JSON (title, scenes[])<br/>setting, dialogue, action, visual_prompt| SCRIPT[StoryScript<br/>(5–10 scenes)]

  SCRIPT -->|If generate_visuals == true<br/>For each scene.visual_prompt| HF[Hugging Face Inference Provider<br/>InferenceClient<br/>text_to_video (CogVideoX-5b default)]

  HF -->|MP4 bytes (with retries / cold-start handling)| SAVE[Save asset to disk<br/>backend/generated/uuid.mp4]
  SAVE -->|Return URL| STATIC[StaticFiles mount<br/>GET /generated/{file}]

  STATIC --> RESP[API Response<br/>script + assets[]]
  RESP --> FE

  FE -->|Render timeline cards| UI[Storyboard UI<br/>Scenes + prompts + video player]
  UI --> U

  %% optional operational bits
  API --> HEALTH[GET /health]
  API --> KEEPALIVE[Background self-ping thread<br/>(Optional: Render keep-warm)]
  KEEPALIVE --> HEALTH
```

## Run the project

See the step-by-step guide here: [`RUN.md`](./RUN.md).

## Local development

- Backend: FastAPI service (generates the script + calls the HF text-to-video endpoint).
- Frontend: Vite + React UI (shows the progress tracker and the per-scene assets).

## Deployment note (Render)

The backend exposes `GET /health` and (optionally) can self-ping to reduce idle sleep during demos.
For extra reliability, you can also use an external uptime monitor to hit:

- `https://<your-render-service>.onrender.com/health`

