# InsightFace API — Windows setup

The People feature needs this Python service for face detection and embeddings.

## 1. Install Python (if `python` is not found)

**Option A — winget (recommended)**

```powershell
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
```

Close and reopen your terminal after install.

**Option B — installer**

1. Download https://www.python.org/downloads/windows/
2. Run the installer
3. Check **“Add python.exe to PATH”**
4. Restart the terminal

Verify:

```powershell
python --version
```

You should see `Python 3.12.x` (not the Microsoft Store message).

## 2. Create virtual environment

```powershell
cd services\insightface-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If activation is blocked:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 3. Install dependencies

```powershell
pip install -r requirements.txt
```

No Visual C++ Build Tools required — this service uses **ONNX Runtime** with buffalo_l models (not the compiled `insightface` Python package).

First server start downloads models (~300 MB) automatically.

## 4. Start the server

```powershell
uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check: http://127.0.0.1:8000/health

## 5. Configure Next.js

In project `.env`:

```
INSIGHTFACE_API_URL=http://127.0.0.1:8000
```

Restart `npm run dev`.

## Docker (optional, no local Python)

```powershell
cd services\insightface-api
docker build -t homesdrives-insightface .
docker run --rm -p 8000:8000 homesdrives-insightface
```
