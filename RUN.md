# Run Guide (Windows PowerShell)

This project has:
- `backend` (FastAPI): generates script + visuals
- `frontend` (Vite + React): UI with progress bar and storyboard timeline

## 1) Start Backend

```powershell
cd "c:\Users\ajais\Desktop\stair project\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend\.env` and set real keys:

```env
GITHUB_TOKEN=your_github_token
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
GITHUB_MODELS_CHAT_MODEL=openai/gpt-4.1

HF_TOKEN=your_hf_token
HF_PROVIDER=zai-org
HF_TEXT_TO_VIDEO_MODEL=zai-org/CogVideoX-5b

FRONTEND_ORIGIN=http://localhost:5173
```

Run backend:

```powershell
uvicorn main:app --reload --port 8000
```

Backend URL: `http://127.0.0.1:8000`

---

## 2) Start Frontend

Open a new terminal:

```powershell
cd "c:\Users\ajais\Desktop\stair project\frontend"
npm install
copy .env.example .env
```

Check `frontend\.env`:

```env
VITE_BACKEND_URL=http://127.0.0.1:8000
```

Run frontend:

```powershell
npm run dev
```

Frontend URL: `http://localhost:5173`

---

## 3) Use the App

1. Paste a story.
2. Click **Generate Visual Story**.
3. Watch live progress:
   - percent bar
   - current step
   - error stage (if failed)

---

## 4) Common Issues

- **403 from Hugging Face**
  - Your `HF_TOKEN` likely lacks inference provider permissions.
  - Create/update token on Hugging Face and retry.

- **Model loading / cold start delay**
  - First request can take time while provider warms up.
  - Keep request running and watch progress states in UI.

- **CORS error in browser**
  - Ensure `FRONTEND_ORIGIN=http://localhost:5173` in `backend\.env`.
  - Restart backend after editing `.env`.

- **Connection refused**
  - Confirm backend is running on port `8000`.
  - Confirm `VITE_BACKEND_URL` matches backend URL.

---

## 5) Optional Verification

Backend syntax check:

```powershell
cd "c:\Users\ajais\Desktop\stair project\backend"
python -m py_compile main.py
```

Frontend build check:

```powershell
cd "c:\Users\ajais\Desktop\stair project\frontend"
npm run build
```
