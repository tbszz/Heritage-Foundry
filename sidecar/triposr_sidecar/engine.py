import importlib
import gc
import json
import math
from collections import deque
from pathlib import Path
import struct
import sys

import numpy as np
from PIL import Image


class PublicGenerationError(RuntimeError):
    def __init__(self, public_message):
        super().__init__(public_message)
        self.public_message = public_message


def load_official_model(repo_path, model_id):
    repo = str(Path(repo_path).resolve())
    sidecar_root = str(Path(__file__).resolve().parents[1])
    for entry in (sidecar_root, repo):
        if entry in sys.path:
            sys.path.remove(entry)
        sys.path.insert(0, entry)
    system_module = importlib.import_module("tsr.system")
    local_model = Path(model_id)
    if local_model.is_dir():
        import torch
        from omegaconf import OmegaConf

        config_path = local_model / "config.yaml"
        weight_path = local_model / "model.ckpt"
        config = OmegaConf.load(config_path)
        OmegaConf.resolve(config)
        model = system_module.TSR(config)
        state = torch.load(
            str(weight_path),
            map_location="cpu",
            weights_only=True,
            mmap=True,
        )
        model.load_state_dict(state)
        return model
    return system_module.TSR.from_pretrained(
        model_id,
        config_name="config.yaml",
        weight_name="model.ckpt",
    )


def prepare_input_image(path, foreground_ratio=0.85):
    ratio = float(foreground_ratio)
    if not 0.1 <= ratio <= 1.0:
        raise ValueError("foreground_ratio must be between 0.1 and 1.0")
    with Image.open(path) as opened:
        source = opened.copy()
    image = source.convert("RGBA")
    if source.mode not in {"RGBA", "LA"} or image.getchannel("A").getextrema()[0] == 255:
        image.putalpha(_edge_connected_background_alpha(source.convert("RGB")))
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("reference image has no visible foreground")
    foreground = image.crop(bounds)
    side = max(foreground.size)
    canvas_side = max(side, int(math.ceil(side / ratio)))
    transparent = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    transparent.alpha_composite(
        foreground,
        ((canvas_side - foreground.width) // 2, (canvas_side - foreground.height) // 2),
    )
    background = Image.new("RGB", transparent.size, (128, 128, 128))
    background.paste(transparent.convert("RGB"), mask=transparent.getchannel("A"))
    return background


def _edge_connected_background_alpha(image, threshold=32.0):
    rgb = np.asarray(image, dtype=np.int16)
    height, width, _channels = rgb.shape
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]), axis=0)
    background = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - background, axis=2)
    candidates = distance <= float(threshold)
    border_candidates = np.concatenate(
        (candidates[0], candidates[-1], candidates[:, 0], candidates[:, -1]),
        axis=0,
    )
    if float(border_candidates.mean()) < 0.7:
        return Image.new("L", (width, height), 255)

    connected = np.zeros((height, width), dtype=bool)
    queue = deque()
    for x in range(width):
        if candidates[0, x]:
            queue.append((0, x))
        if candidates[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if candidates[y, 0]:
            queue.append((y, 0))
        if candidates[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if connected[y, x] or not candidates[y, x]:
            continue
        connected[y, x] = True
        if y > 0:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x > 0:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))

    alpha = np.where(connected, 0, 255).astype(np.uint8)
    return Image.fromarray(alpha, mode="L")


def normalize_z_up_vertices(vertices, target_height_m=0.18):
    source = np.asarray(vertices, dtype=np.float32)
    if source.ndim != 2 or source.shape[1] != 3 or not np.isfinite(source).all():
        raise ValueError("mesh vertices must be a finite N x 3 array")
    if len(source) == 0:
        raise ValueError("mesh has no vertices")

    y_up = np.column_stack((source[:, 1], source[:, 2], source[:, 0])).astype(
        np.float32,
        copy=False,
    )
    minimum = y_up.min(axis=0)
    maximum = y_up.max(axis=0)
    height = float(maximum[1] - minimum[1])
    if height <= 0:
        raise ValueError("mesh height must be greater than zero")
    y_up *= float(target_height_m) / height

    minimum = y_up.min(axis=0)
    maximum = y_up.max(axis=0)
    y_up[:, 0] -= (minimum[0] + maximum[0]) / 2
    y_up[:, 1] -= minimum[1]
    y_up[:, 2] -= (minimum[2] + maximum[2]) / 2
    return y_up


def _vertex_normals(vertices, faces):
    normals = np.zeros_like(vertices, dtype=np.float32)
    triangles = vertices[faces]
    face_normals = np.cross(
        triangles[:, 1] - triangles[:, 0],
        triangles[:, 2] - triangles[:, 0],
    )
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    missing = lengths[:, 0] <= 1e-8
    lengths[missing] = 1.0
    normals /= lengths
    normals[missing] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    return normals.astype("<f4", copy=False)


def _vertex_colors(mesh, count):
    visual = getattr(mesh, "visual", None)
    colors = getattr(visual, "vertex_colors", None)
    if colors is None:
        return np.full((count, 4), (210, 210, 210, 255), dtype=np.uint8)
    colors = np.asarray(colors)
    if colors.shape[0] != count or colors.ndim != 2 or colors.shape[1] not in {3, 4}:
        raise ValueError("mesh vertex colors do not match its vertices")
    if np.issubdtype(colors.dtype, np.floating):
        colors = np.clip(colors, 0.0, 1.0) * 255.0
    colors = np.clip(colors, 0, 255).astype(np.uint8)
    if colors.shape[1] == 3:
        colors = np.column_stack((colors, np.full(count, 255, dtype=np.uint8)))
    return colors


def export_vertex_color_glb(mesh, output_path, target_height_m=0.18):
    vertices = normalize_z_up_vertices(mesh.vertices, target_height_m).astype("<f4")
    faces = np.asarray(mesh.faces, dtype=np.uint32)
    if faces.ndim != 2 or faces.shape[1] != 3 or len(faces) == 0:
        raise ValueError("mesh faces must be a non-empty N x 3 array")
    if int(faces.max()) >= len(vertices):
        raise ValueError("mesh faces reference missing vertices")
    normals = _vertex_normals(vertices, faces)
    colors = _vertex_colors(mesh, len(vertices))
    indices = faces.astype("<u4", copy=False).reshape(-1)

    binary = bytearray()
    buffer_views = []

    def append_buffer(array, target):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        payload = array.tobytes(order="C")
        binary.extend(payload)
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": len(payload),
                "target": target,
            }
        )
        return len(buffer_views) - 1

    position_view = append_buffer(vertices, 34962)
    normal_view = append_buffer(normals, 34962)
    color_view = append_buffer(colors, 34962)
    index_view = append_buffer(indices, 34963)
    while len(binary) % 4:
        binary.append(0)

    accessors = [
        {
            "bufferView": position_view,
            "componentType": 5126,
            "count": len(vertices),
            "type": "VEC3",
            "min": vertices.min(axis=0).astype(float).tolist(),
            "max": vertices.max(axis=0).astype(float).tolist(),
        },
        {
            "bufferView": normal_view,
            "componentType": 5126,
            "count": len(normals),
            "type": "VEC3",
        },
        {
            "bufferView": color_view,
            "componentType": 5121,
            "normalized": True,
            "count": len(colors),
            "type": "VEC4",
        },
        {
            "bufferView": index_view,
            "componentType": 5125,
            "count": len(indices),
            "type": "SCALAR",
            "min": [int(indices.min())],
            "max": [int(indices.max())],
        },
    ]
    document = {
        "asset": {"version": "2.0", "generator": "Heritage Foundry TripoSR Sidecar"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Heritage Figurine"}],
        "meshes": [
            {
                "name": "TripoSR Figurine",
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
                        "indices": 3,
                        "material": 0,
                        "mode": 4,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "Generated Vertex Color PBR",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.72,
                },
            }
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary_bytes = bytes(binary)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary_bytes)
    glb = b"".join(
        (
            struct.pack("<4sII", b"glTF", 2, total_length),
            struct.pack("<II", len(json_bytes), 0x4E4F534A),
            json_bytes,
            struct.pack("<II", len(binary_bytes), 0x004E4942),
            binary_bytes,
        )
    )
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(glb)


class TripoSREngine:
    def __init__(
        self,
        repo_path,
        model_id="stabilityai/TripoSR",
        device="cuda:0",
        chunk_size=4096,
        mc_resolution=160,
        target_height_m=0.18,
        model_loader=None,
        image_loader=None,
        mesh_exporter=None,
        inference_context=None,
        **_options,
    ):
        self.repo_path = Path(repo_path)
        self.model_id = model_id
        self.device = device
        self.chunk_size = int(chunk_size)
        self.mc_resolution = int(mc_resolution)
        self.target_height_m = float(target_height_m)
        self.model_loader = model_loader or load_official_model
        self.image_loader = image_loader or prepare_input_image
        self.mesh_exporter = mesh_exporter or export_vertex_color_glb
        self.inference_context = inference_context
        self.model = None
        self._ready = False

    @property
    def ready(self):
        return self._ready

    def load(self):
        if self._ready:
            return
        if not (self.repo_path / "tsr" / "system.py").is_file():
            raise FileNotFoundError(f"TripoSR repository not found: {self.repo_path}")
        model = self.model_loader(self.repo_path, self.model_id)
        model.renderer.set_chunk_size(self.chunk_size)
        self.model = model.to(self.device)
        self._ready = True

    def close(self):
        self._ready = False
        self.model = None
        gc.collect()
        _empty_cuda_cache()

    def generate(self, *, image_path, output_path, target_polycount, progress):
        del target_polycount
        if not self._ready or self.model is None:
            raise RuntimeError("TripoSR engine is not ready")
        if self.image_loader is None or self.mesh_exporter is None:
            raise RuntimeError("TripoSR engine adapters are not configured")
        try:
            image = self.image_loader(Path(image_path))
            progress(15)
            context = self.inference_context() if self.inference_context else _torch_inference_context()
            with context:
                scene_codes = self.model([image], device=self.device)
            progress(55)
            meshes = self.model.extract_mesh(
                scene_codes,
                True,
                resolution=self.mc_resolution,
            )
            progress(82)
            self.mesh_exporter(
                meshes[0],
                Path(output_path),
                self.target_height_m,
            )
            progress(96)
        except RuntimeError as error:
            description = str(error).lower()
            if "cuda" in description and "out of memory" in description:
                _empty_cuda_cache()
                raise PublicGenerationError(
                    "GPU 显存不足，请关闭占用显卡的程序后重试"
                ) from error
            raise


def _torch_inference_context():
    import torch

    return torch.inference_mode()


def _empty_cuda_cache():
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
