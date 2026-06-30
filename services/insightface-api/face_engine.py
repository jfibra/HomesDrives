"""
Face detection (SCRFD det_10g) + 512-d ArcFace embeddings (buffalo_l).
Uses buffalo_l detector landmarks for alignment — rejects hands/blur/false positives.
"""

from __future__ import annotations

import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

import cv2
import numpy as np
import onnxruntime as ort

from scrfd_detector import SCRFD

BUFFALO_L_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
MODEL_DIR = Path(os.getenv("FACE_MODEL_DIR", Path(__file__).parent / "models"))
EMBED_SIZE = 112
DETECTION_MODEL_NAME = "det_10g.onnx"
RECOGNITION_MODEL_NAME = "w600k_r50.onnx"
DET_SCORE_THRESHOLD = float(os.getenv("FACE_DET_SCORE_THRESHOLD", "0.55"))
MIN_FACE_SIZE_PX = int(os.getenv("FACE_MIN_SIZE_PX", "64"))
MIN_FACE_SHARPNESS = float(os.getenv("FACE_MIN_SHARPNESS", "55"))
MIN_FACE_AREA_RATIO = float(os.getenv("FACE_MIN_AREA_RATIO", "0.00015"))

ARCFACE_DST = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


@dataclass
class DetectedFaceResult:
    bbox: np.ndarray
    score: float
    embedding: np.ndarray


def _find_model_file(file_name: str) -> Path | None:
    if not MODEL_DIR.exists():
        return None
    matches = list(MODEL_DIR.rglob(file_name))
    return matches[0] if matches else None


def _ensure_buffalo_models() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if _find_model_file(RECOGNITION_MODEL_NAME) and _find_model_file(DETECTION_MODEL_NAME):
        return

    zip_path = MODEL_DIR / "buffalo_l.zip"
    if not zip_path.exists() or zip_path.stat().st_size < 1_000_000:
        if zip_path.exists():
            zip_path.unlink()
        print(f"Downloading buffalo_l models to {zip_path} ...")
        urlretrieve(BUFFALO_L_URL, zip_path)

    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(MODEL_DIR)


def _align_face(image_bgr: np.ndarray, landmarks: np.ndarray) -> np.ndarray | None:
    transform, _ = cv2.estimateAffinePartial2D(landmarks, ARCFACE_DST, method=cv2.LMEDS)
    if transform is None:
        return None

    aligned = cv2.warpAffine(image_bgr, transform, (EMBED_SIZE, EMBED_SIZE), borderValue=0.0)
    return aligned if aligned.size else None


def _bbox_aspect_ratio_ok(bbox: np.ndarray) -> bool:
    width = max(1.0, float(bbox[2] - bbox[0]))
    height = max(1.0, float(bbox[3] - bbox[1]))
    ratio = width / height
    return 0.68 <= ratio <= 1.35


def _landmarks_valid(landmarks: np.ndarray, bbox: np.ndarray, image_shape: tuple[int, int]) -> bool:
    x1, y1, x2, y2 = bbox
    width = max(1.0, float(x2 - x1))
    height = max(1.0, float(y2 - y1))
    image_area = max(1.0, float(image_shape[0] * image_shape[1]))
    face_area = width * height

    if width < MIN_FACE_SIZE_PX or height < MIN_FACE_SIZE_PX:
        return False
    if face_area / image_area < MIN_FACE_AREA_RATIO:
        return False
    if not _bbox_aspect_ratio_ok(bbox):
        return False

    left_eye, right_eye, nose, left_mouth, right_mouth = landmarks

    if abs(float(left_eye[1] - right_eye[1])) > height * 0.12:
        return False

    eye_distance = float(np.linalg.norm(right_eye - left_eye))
    if eye_distance < width * 0.22 or eye_distance > width * 0.68:
        return False

    if not (min(left_eye[0], right_eye[0]) <= nose[0] <= max(left_eye[0], right_eye[0])):
        return False

    eye_line_y = (left_eye[1] + right_eye[1]) / 2.0
    if nose[1] <= eye_line_y + height * 0.08:
        return False

    mouth_y = (left_mouth[1] + right_mouth[1]) / 2.0
    if mouth_y <= nose[1] + height * 0.06:
        return False

    mouth_width = float(np.linalg.norm(right_mouth - left_mouth))
    if mouth_width < eye_distance * 0.45 or mouth_width > eye_distance * 1.8:
        return False

    for x, y in landmarks:
        if x < x1 - width * 0.15 or x > x2 + width * 0.15 or y < y1 - height * 0.15 or y > y2 + height * 0.15:
            return False

    return True


def _is_sharp_enough(aligned_bgr: np.ndarray) -> bool:
    gray = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < MIN_FACE_SHARPNESS:
        return False

    # Real faces usually have darker eye region than cheeks in aligned crop.
    top = gray[: int(gray.shape[0] * 0.45), :]
    bottom = gray[int(gray.shape[0] * 0.55) :, :]
    if top.size == 0 or bottom.size == 0:
        return False
    return float(top.mean()) < float(bottom.mean()) + 18


class FaceEngine:
    def __init__(self) -> None:
        _ensure_buffalo_models()
        det_path = _find_model_file(DETECTION_MODEL_NAME)
        rec_path = _find_model_file(RECOGNITION_MODEL_NAME)
        if det_path is None or rec_path is None:
            found = [str(path.relative_to(MODEL_DIR)) for path in MODEL_DIR.rglob("*.onnx")]
            raise RuntimeError(f"Missing buffalo_l models. Found: {found or 'none'}")

        self.detector = SCRFD(str(det_path))
        self.detector.prepare(det_thresh=DET_SCORE_THRESHOLD, nms_thresh=0.4)
        self.recognizer = ort.InferenceSession(str(rec_path), providers=["CPUExecutionProvider"])
        self.rec_input = self.recognizer.get_inputs()[0].name

    def detect_and_embed(self, image_bgr: np.ndarray) -> list[DetectedFaceResult]:
        bboxes, landmarks = self.detector.detect(image_bgr, input_size=(640, 640))
        if bboxes is None or bboxes.shape[0] == 0:
            return []

        results: list[DetectedFaceResult] = []
        image_shape = image_bgr.shape[:2]

        for index in range(bboxes.shape[0]):
            x1, y1, x2, y2, score = bboxes[index]
            score = float(score)
            if score < DET_SCORE_THRESHOLD:
                continue

            bbox = np.array([x1, y1, x2, y2], dtype=np.float32)
            if landmarks is None or landmarks.shape[0] <= index:
                continue

            face_landmarks = landmarks[index].astype(np.float32)
            if not _landmarks_valid(face_landmarks, bbox, image_shape):
                continue

            embedding = self._embed_face(image_bgr, face_landmarks)
            if embedding is not None:
                results.append(DetectedFaceResult(bbox=bbox, score=score, embedding=embedding))

        return results

    def _embed_face(self, image_bgr: np.ndarray, landmarks: np.ndarray) -> np.ndarray | None:
        aligned = _align_face(image_bgr, landmarks)
        if aligned is None or not _is_sharp_enough(aligned):
            return None

        face = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB).astype(np.float32)
        face = (face - 127.5) / 127.5
        face = np.transpose(face, (2, 0, 1))[None, ...]

        embedding = self.recognizer.run(None, {self.rec_input: face})[0][0]
        norm = np.linalg.norm(embedding)
        if norm <= 0:
            return None
        return (embedding / norm).astype(np.float32)


_engine: FaceEngine | None = None


def get_face_engine() -> FaceEngine:
    global _engine
    if _engine is None:
        _engine = FaceEngine()
    return _engine


def serialize_face(face: DetectedFaceResult) -> dict[str, Any]:
    bbox = face.bbox.astype(float).tolist()
    return {
        "bbox": bbox,
        "bounding_box": {
            "x": bbox[0],
            "y": bbox[1],
            "width": max(1.0, bbox[2] - bbox[0]),
            "height": max(1.0, bbox[3] - bbox[1]),
        },
        "embedding": face.embedding.astype(float).tolist(),
        "confidence": face.score,
    }
