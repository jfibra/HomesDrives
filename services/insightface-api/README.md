# HomesDrives Vision API

Face + building vision service for HomesDrives.

- **Faces** — People feature (`/detect`, `/embed`)
- **Buildings** — Building recognition (`/buildings/embed`)

**Partner integration guide:**  
See [docs/BUILDING-RECOGNITION.md](../../docs/BUILDING-RECOGNITION.md) — partner sites call `drive.homes.ph/api/buildings` only (no separate AI stack).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service status |
| POST | `/detect` | Face detection (multiple faces) |
| POST | `/embed` | Best face embedding |
| POST | `/buildings/embed` | Building/place CLIP embedding |

Building model: `clip-vit-base-patch32-onnx` (ONNX, ~30s first download, then fast CPU inference).
Optional: set `WARM_BUILDING_MODEL=true` (default) to load it at API startup.

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
