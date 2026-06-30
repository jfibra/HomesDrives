"""SCRFD face detector (buffalo_l det_10g.onnx). Adapted from InsightFace."""

from __future__ import annotations

import numpy as np
import onnxruntime as ort
import cv2

DEFAULT_DET_SIZES = [(128, 128), (640, 640)]


def distance2bbox(points: np.ndarray, distance: np.ndarray, max_shape=None) -> np.ndarray:
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    if max_shape is not None:
        x1 = np.clip(x1, 0, max_shape[1])
        y1 = np.clip(y1, 0, max_shape[0])
        x2 = np.clip(x2, 0, max_shape[1])
        y2 = np.clip(y2, 0, max_shape[0])
    return np.stack([x1, y1, x2, y2], axis=-1)


def distance2kps(points: np.ndarray, distance: np.ndarray, max_shape=None) -> np.ndarray:
    preds = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, i % 2] + distance[:, i]
        py = points[:, i % 2 + 1] + distance[:, i + 1]
        if max_shape is not None:
            px = np.clip(px, 0, max_shape[1])
            py = np.clip(py, 0, max_shape[0])
        preds.append(px)
        preds.append(py)
    return np.stack(preds, axis=-1)


class SCRFD:
    def __init__(self, model_file: str) -> None:
        self.session = ort.InferenceSession(model_file, providers=["CPUExecutionProvider"])
        self.center_cache: dict[tuple[int, int, int], np.ndarray] = {}
        self.nms_thresh = 0.4
        self.det_thresh = 0.5
        self._init_vars()

    def _init_vars(self) -> None:
        input_cfg = self.session.get_inputs()[0]
        input_shape = input_cfg.shape
        if isinstance(input_shape[2], str):
            self.static_input_size = None
        else:
            self.static_input_size = tuple(input_shape[2:4][::-1])

        self.input_size = self.static_input_size if self.static_input_size is not None else DEFAULT_DET_SIZES[-1]
        self.input_sizes = [self.static_input_size] if self.static_input_size is not None else list(DEFAULT_DET_SIZES)
        self.input_name = input_cfg.name
        outputs = self.session.get_outputs()
        self.batched = len(outputs[0].shape) == 3
        self.output_names = [output.name for output in outputs]
        self.input_mean = 127.5
        self.input_std = 128.0
        self.use_kps = False
        self._num_anchors = 1

        if len(outputs) == 6:
            self.fmc = 3
            self._feat_stride_fpn = [8, 16, 32]
            self._num_anchors = 2
        elif len(outputs) == 9:
            self.fmc = 3
            self._feat_stride_fpn = [8, 16, 32]
            self._num_anchors = 2
            self.use_kps = True
        elif len(outputs) == 10:
            self.fmc = 5
            self._feat_stride_fpn = [8, 16, 32, 64, 128]
            self._num_anchors = 1
        elif len(outputs) == 15:
            self.fmc = 5
            self._feat_stride_fpn = [8, 16, 32, 64, 128]
            self._num_anchors = 1
            self.use_kps = True
        else:
            raise RuntimeError(f"Unsupported SCRFD output count: {len(outputs)}")

    def prepare(self, det_thresh: float | None = None, nms_thresh: float | None = None) -> None:
        if det_thresh is not None:
            self.det_thresh = det_thresh
        if nms_thresh is not None:
            self.nms_thresh = nms_thresh

    def detect(self, img: np.ndarray, input_size=None, max_num: int = 0):
        input_sizes = self._resolve_input_sizes(input_size)
        pre_det_list = []
        kpss_det_list = []

        for size in input_sizes:
            pre_det, kpss = self._detect_candidates(img, size)
            if pre_det.shape[0] == 0:
                continue
            pre_det_list.append(pre_det)
            if self.use_kps and kpss is not None:
                kpss_det_list.append(kpss)

        if not pre_det_list:
            kpss = np.empty((0, 5, 2), dtype=np.float32) if self.use_kps else None
            return np.empty((0, 5), dtype=np.float32), kpss

        pre_det = np.vstack(pre_det_list).astype(np.float32, copy=False)
        order = pre_det[:, 4].argsort()[::-1]
        pre_det = pre_det[order, :]
        kpss = np.vstack(kpss_det_list)[order, :, :] if self.use_kps and kpss_det_list else None
        keep = self.nms(pre_det)
        det = pre_det[keep, :]
        if kpss is not None:
            kpss = kpss[keep, :, :]

        if max_num > 0 and det.shape[0] > max_num:
            area = (det[:, 2] - det[:, 0]) * (det[:, 3] - det[:, 1])
            order = area.argsort()[::-1][:max_num]
            det = det[order, :]
            if kpss is not None:
                kpss = kpss[order, :, :]

        return det, kpss

    def _detect_candidates(self, img: np.ndarray, input_size: tuple[int, int]):
        im_ratio = float(img.shape[0]) / img.shape[1]
        model_ratio = float(input_size[1]) / input_size[0]
        if im_ratio > model_ratio:
            new_height = input_size[1]
            new_width = int(new_height / im_ratio)
        else:
            new_width = input_size[0]
            new_height = int(new_width * im_ratio)

        det_scale = float(new_height) / img.shape[0]
        resized_img = cv2.resize(img, (new_width, new_height))
        det_img = np.zeros((input_size[1], input_size[0], 3), dtype=np.uint8)
        det_img[:new_height, :new_width, :] = resized_img

        scores_list, bboxes_list, kpss_list = self._forward(det_img)
        if not scores_list or sum(score.size for score in scores_list) == 0:
            return np.empty((0, 5), dtype=np.float32), None

        scores = np.vstack(scores_list)
        order = scores.ravel().argsort()[::-1]
        bboxes = np.vstack(bboxes_list) / det_scale
        pre_det = np.hstack((bboxes, scores)).astype(np.float32, copy=False)[order, :]
        kpss = None
        if self.use_kps:
            kpss = (np.vstack(kpss_list) / det_scale)[order, :, :]
        return pre_det, kpss

    def _forward(self, img: np.ndarray):
        input_size = tuple(img.shape[0:2][::-1])
        blob = cv2.dnn.blobFromImage(
            img,
            1.0 / self.input_std,
            input_size,
            (self.input_mean, self.input_mean, self.input_mean),
            swapRB=True,
        )
        net_outs = self.session.run(self.output_names, {self.input_name: blob})

        input_height = blob.shape[2]
        input_width = blob.shape[3]
        scores_list = []
        bboxes_list = []
        kpss_list = []

        for idx, stride in enumerate(self._feat_stride_fpn):
            if self.batched:
                scores = net_outs[idx][0]
                bbox_preds = net_outs[idx + self.fmc][0] * stride
                kps_preds = net_outs[idx + self.fmc * 2][0] * stride if self.use_kps else None
            else:
                scores = net_outs[idx]
                bbox_preds = net_outs[idx + self.fmc] * stride
                kps_preds = net_outs[idx + self.fmc * 2] * stride if self.use_kps else None

            height = input_height // stride
            width = input_width // stride
            key = (height, width, stride)
            if key in self.center_cache:
                anchor_centers = self.center_cache[key]
            else:
                anchor_centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
                anchor_centers = (anchor_centers * stride).reshape((-1, 2))
                if self._num_anchors > 1:
                    anchor_centers = np.stack([anchor_centers] * self._num_anchors, axis=1).reshape((-1, 2))
                if len(self.center_cache) < 100:
                    self.center_cache[key] = anchor_centers

            pos_inds = np.where(scores >= self.det_thresh)[0]
            bboxes = distance2bbox(anchor_centers, bbox_preds)
            scores_list.append(scores[pos_inds])
            bboxes_list.append(bboxes[pos_inds])
            if self.use_kps and kps_preds is not None:
                kpss = distance2kps(anchor_centers, kps_preds).reshape((kps_preds.shape[0], -1, 2))
                kpss_list.append(kpss[pos_inds])

        return scores_list, bboxes_list, kpss_list

    def _resolve_input_sizes(self, input_size):
        if input_size is not None:
            return self._normalize_input_sizes(input_size)
        return list(self.input_sizes)

    @staticmethod
    def _normalize_input_sizes(input_size):
        if input_size is None:
            return []
        if isinstance(input_size, np.ndarray):
            input_size = input_size.tolist()
        values = input_size if isinstance(input_size[0], (list, tuple, np.ndarray)) else [input_size]
        sizes = []
        for item in values:
            if isinstance(item, np.ndarray):
                item = item.tolist()
            width, height = int(item[0]), int(item[1])
            size = (width, height)
            if size not in sizes:
                sizes.append(size)
        return sizes

    def nms(self, dets: np.ndarray):
        thresh = self.nms_thresh
        x1 = dets[:, 0]
        y1 = dets[:, 1]
        x2 = dets[:, 2]
        y2 = dets[:, 3]
        scores = dets[:, 4]
        areas = (x2 - x1 + 1) * (y2 - y1 + 1)
        order = scores.argsort()[::-1]
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            w = np.maximum(0.0, xx2 - xx1 + 1)
            h = np.maximum(0.0, yy2 - yy1 + 1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(ovr <= thresh)[0]
            order = order[inds + 1]
        return keep
