## Project Structure

```
Narrative-to-Visual Story Agent/
  backend/
    main.py
    requirements.txt
    .env.example
    generated/
      .gitkeep
  frontend/
    index.html
    package.json
    vite.config.js
    postcss.config.js
    tailwind.config.js
    src/
      main.jsx
      App.jsx
      index.css
```

## Quickstart

### Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

