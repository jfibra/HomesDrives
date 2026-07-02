"""
Face + building vision API for HomesDrives.
Faces: buffalo_l ONNX via onnxruntime.
Buildings: CLIP ViT-B/32 via sentence-transformers.

Setup:
  cd services/insightface-api
  python -m venv .venv
  .venv\\Scripts\\activate
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from building_engine import BUILDING_MODEL_NAME, embed_building_image, get_building_engine, serialize_building_embedding
from face_engine import get_face_engine, serialize_face

WARM_BUILDING_MODEL = os.getenv("WARM_BUILDING_MODEL", "true").strip().lower() in {"1", "true", "yes"}

app = FastAPI(title="HomesDrives Vision API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def decode_image(data: bytes) -> np.ndarray:
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Unable to decode image.")
    return image


@app.on_event("startup")
def warm_models() -> None:
    get_face_engine()
    if WARM_BUILDING_MODEL:
        get_building_engine()


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "face_model": "buffalo_l-scrfd",
        "building_model": BUILDING_MODEL_NAME,
    }


async def read_image_bytes(file: UploadFile | None, request: Request) -> bytes:
    if file is not None:
        data = await file.read()
    else:
        data = await request.body()

    if not data:
        raise HTTPException(status_code=400, detail="Empty image.")
    return data


@app.post("/detect")
async def detect(
    request: Request,
    file: UploadFile | None = File(None),
) -> dict[str, Any]:
    data = await read_image_bytes(file, request)
    image = decode_image(data)
    faces = get_face_engine().detect_and_embed(image)
    return {"faces": [serialize_face(face) for face in faces]}


@app.post("/embed")
async def embed(
    request: Request,
    file: UploadFile | None = File(None),
) -> dict[str, Any]:
    data = await read_image_bytes(file, request)
    image = decode_image(data)
    faces = get_face_engine().detect_and_embed(image)
    if not faces:
        raise HTTPException(status_code=422, detail="No face detected.")

    best = max(faces, key=lambda face: face.score)
    serialized = serialize_face(best)
    return {
        "faces": [serialized],
        "embedding": serialized["embedding"],
        "bbox": serialized["bbox"],
        "bounding_box": serialized["bounding_box"],
    }


@app.post("/buildings/embed")
async def buildings_embed(
    request: Request,
    file: UploadFile | None = File(None),
) -> dict[str, Any]:
    data = await read_image_bytes(file, request)
    image = decode_image(data)
    try:
        return serialize_building_embedding(image)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Building embed failed: {error}") from error
