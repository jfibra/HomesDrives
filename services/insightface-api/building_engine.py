"""
Building / place image embeddings via CLIP ViT-B/32 ONNX (Xenova export).
Fast CPU inference through onnxruntime — no PyTorch download on first request.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import cv2
import numpy as np
import onnxruntime as ort

CLIP_VISION_MODEL_URL = os.getenv(
    "BUILDING_MODEL_URL",
    "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx",
)
BUILDING_MODEL_NAME = "clip-vit-base-patch32-onnx"
BUILDING_EMBEDDING_DIMENSIONS = 512
MODEL_DIR = Path(os.getenv("BUILDING_MODEL_DIR", Path(__file__).parent / "models" / "clip"))
VISION_MODEL_FILE = "vision_model.onnx"
IMAGE_SIZE = 224
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
MAX_INPUT_EDGE = int(os.getenv("BUILDING_MAX_INPUT_EDGE", "1280"))
MIN_SHARPNESS = float(os.getenv("BUILDING_MIN_SHARPNESS", "45"))
MIN_BRIGHTNESS = float(os.getenv("BUILDING_MIN_BRIGHTNESS", "28"))
MAX_BRIGHTNESS = float(os.getenv("BUILDING_MAX_BRIGHTNESS", "242"))
# Center-crop ratios used for multi-view matching (full frame + tighter crops).
VIEW_CROP_RATIOS = (1.0, 0.85, 0.7)

_session: ort.InferenceSession | None = None


def _ensure_clip_vision_model() -> Path:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / VISION_MODEL_FILE
    if model_path.exists() and model_path.stat().st_size > 1_000_000:
        return model_path

    print(f"Downloading CLIP vision model to {model_path} ...")
    temp_path = model_path.with_suffix(".onnx.part")
    if temp_path.exists():
        temp_path.unlink()
    urlretrieve(CLIP_VISION_MODEL_URL, temp_path)
    temp_path.replace(model_path)
    print("CLIP vision model downloaded.")
    return model_path


def get_building_engine() -> ort.InferenceSession:
    global _session
    if _session is None:
        model_path = _ensure_clip_vision_model()
        print(f"Loading building model from {model_path} ...")
        _session = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"],
        )
        print("Building model ready.")
    return _session


def _resize_for_clip(image_bgr: np.ndarray) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    longest = max(height, width)
    if longest > MAX_INPUT_EDGE:
        scale = MAX_INPUT_EDGE / longest
        image_bgr = cv2.resize(
            image_bgr,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    return image_bgr


def _center_crop(image_bgr: np.ndarray, ratio: float) -> np.ndarray:
    if ratio >= 0.999:
        return image_bgr

    height, width = image_bgr.shape[:2]
    crop_height = max(1, int(height * ratio))
    crop_width = max(1, int(width * ratio))
    top = max(0, (height - crop_height) // 2)
    left = max(0, (width - crop_width) // 2)
    return image_bgr[top : top + crop_height, left : left + crop_width]


def _preprocess_clip(image_bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]

    if height < width:
        resized_height = IMAGE_SIZE
        resized_width = int(width * IMAGE_SIZE / height)
    else:
        resized_width = IMAGE_SIZE
        resized_height = int(height * IMAGE_SIZE / width)

    resized = cv2.resize(rgb, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
    top = max(0, (resized_height - IMAGE_SIZE) // 2)
    left = max(0, (resized_width - IMAGE_SIZE) // 2)
    cropped = resized[top : top + IMAGE_SIZE, left : left + IMAGE_SIZE]

    normalized = cropped.astype(np.float32) / 255.0
    normalized = (normalized - CLIP_MEAN) / CLIP_STD
    chw = np.transpose(normalized, (2, 0, 1))
    return np.expand_dims(chw, axis=0).astype(np.float32)


def _normalize_vector(vector: np.ndarray) -> np.ndarray:
    flat = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(flat))
    if norm > 0:
        flat = flat / norm
    return flat


def _run_clip_embedding(image_bgr: np.ndarray) -> np.ndarray:
    session = get_building_engine()
    tensor = _preprocess_clip(image_bgr)
    outputs = session.run(None, {"pixel_values": tensor})
    if not outputs:
        raise ValueError("Building model returned no output.")

    vector = _normalize_vector(np.asarray(outputs[0], dtype=np.float32))
    if vector.shape[0] != BUILDING_EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Unexpected embedding size {vector.shape[0]} (expected {BUILDING_EMBEDDING_DIMENSIONS}).",
        )
    return vector


def analyze_building_image(image_bgr: np.ndarray) -> dict[str, Any]:
    if image_bgr is None or image_bgr.size == 0:
        return {
            "ok": False,
            "sharpness": 0.0,
            "brightness": 0.0,
            "message": "Empty image.",
        }

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    issues: list[str] = []

    if sharpness < MIN_SHARPNESS:
        issues.append("Image looks blurry. Hold steady and move closer to the facade.")
    if brightness < MIN_BRIGHTNESS:
        issues.append("Image is too dark. Try better lighting or move to a brighter angle.")
    if brightness > MAX_BRIGHTNESS:
        issues.append("Image is overexposed. Reduce glare or change angle.")

    return {
        "ok": len(issues) == 0,
        "sharpness": round(sharpness, 2),
        "brightness": round(brightness, 2),
        "message": " ".join(issues) if issues else None,
    }


def embed_building_views(image_bgr: np.ndarray) -> list[np.ndarray]:
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("Empty image.")

    resized = _resize_for_clip(image_bgr)
    views: list[np.ndarray] = []
    for ratio in VIEW_CROP_RATIOS:
        crop = _center_crop(resized, ratio)
        views.append(_run_clip_embedding(crop))
    return views


def embed_building_image(image_bgr: np.ndarray) -> np.ndarray:
    views = embed_building_views(image_bgr)
    stacked = np.stack(views, axis=0)
    mean = np.mean(stacked, axis=0)
    return _normalize_vector(mean)


def serialize_building_embedding(image_bgr: np.ndarray) -> dict[str, Any]:
    views = embed_building_views(image_bgr)
    stacked = np.stack(views, axis=0)
    vector = _normalize_vector(np.mean(stacked, axis=0))
    return {
        "embedding": vector.tolist(),
        "dimensions": int(vector.shape[0]),
        "view_embeddings": [view.tolist() for view in views],
        "quality": analyze_building_image(image_bgr),
    }
