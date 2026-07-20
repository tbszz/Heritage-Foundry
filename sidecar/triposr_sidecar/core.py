import base64
import binascii
from io import BytesIO
import json
from pathlib import Path
import re
import struct
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError


_IMAGE_DATA_URL = re.compile(
    r"^data:image/(?P<kind>png|jpeg|webp);base64,(?P<data>[A-Za-z0-9+/]+={0,2})$",
    re.IGNORECASE,
)
_EXTENSIONS = {
    "png": ".png",
    "jpeg": ".jpg",
    "webp": ".webp",
}


def _matches_signature(kind: str, value: bytes) -> bool:
    if kind == "png":
        return value.startswith(b"\x89PNG\r\n\x1a\n")
    if kind == "jpeg":
        return value.startswith(b"\xff\xd8\xff")
    if kind == "webp":
        return len(value) >= 12 and value.startswith(b"RIFF") and value[8:12] == b"WEBP"
    return False


@dataclass(frozen=True)
class DecodedImage:
    mime_type: str
    extension: str
    bytes: bytes


def decode_image_data_url(value: str, max_bytes: int, max_pixels: int = 16_000_000) -> DecodedImage:
    match = _IMAGE_DATA_URL.fullmatch(value if isinstance(value, str) else "")
    if not match:
        raise ValueError("image_url must be a PNG, JPEG, or WebP base64 data URL")
    encoded = match.group("data")
    max_encoded_bytes = ((int(max_bytes) + 2) // 3) * 4
    if len(encoded) > max_encoded_bytes:
        raise ValueError("image_url exceeds the decoded byte limit")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("image_url contains invalid base64 data") from error
    if not image_bytes:
        raise ValueError("image_url is empty")
    if len(image_bytes) > max_bytes:
        raise ValueError("image_url exceeds the decoded byte limit")
    kind = match.group("kind").lower()
    if not _matches_signature(kind, image_bytes):
        raise ValueError("image_url bytes do not match the declared image signature")
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if image.width * image.height > int(max_pixels):
                raise ValueError("image_url exceeds the decoded pixel limit")
            image.verify()
    except ValueError:
        raise
    except (OSError, UnidentifiedImageError) as error:
        raise ValueError("image_url does not contain a valid image") from error
    return DecodedImage(
        mime_type=f"image/{kind}",
        extension=_EXTENSIONS[kind],
        bytes=image_bytes,
    )


def validate_glb_mesh(path) -> bool:
    source = Path(path)
    try:
        with source.open("rb") as handle:
            header = handle.read(12)
            if len(header) != 12:
                return False
            magic, version, total_length = struct.unpack("<4sII", header)
            if magic != b"glTF" or version != 2 or total_length != source.stat().st_size:
                return False
            chunk_header = handle.read(8)
            if len(chunk_header) != 8:
                return False
            json_length, json_type = struct.unpack("<II", chunk_header)
            if json_type != 0x4E4F534A or json_length <= 0 or json_length % 4:
                return False
            document = json.loads(
                handle.read(json_length).decode("utf-8").rstrip(" \x00")
            )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, struct.error):
        return False

    if document.get("asset", {}).get("version") != "2.0":
        return False
    meshes = document.get("meshes")
    accessors = document.get("accessors")
    scenes = document.get("scenes")
    nodes = document.get("nodes")
    if not all(isinstance(value, list) and value for value in (meshes, accessors, scenes, nodes)):
        return False
    scene_index = document.get("scene", 0)
    if not isinstance(scene_index, int) or not 0 <= scene_index < len(scenes):
        return False

    pending = list(scenes[scene_index].get("nodes", []))
    visited = set()
    while pending:
        node_index = pending.pop()
        if not isinstance(node_index, int) or not 0 <= node_index < len(nodes):
            return False
        if node_index in visited:
            continue
        visited.add(node_index)
        node = nodes[node_index]
        pending.extend(node.get("children", []))
        mesh_index = node.get("mesh")
        if not isinstance(mesh_index, int) or not 0 <= mesh_index < len(meshes):
            continue
        for primitive in meshes[mesh_index].get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(position_index, int) or not 0 <= position_index < len(accessors):
                continue
            position = accessors[position_index]
            if (
                position.get("componentType") == 5126
                and position.get("type") == "VEC3"
                and isinstance(position.get("count"), int)
                and position["count"] >= 3
            ):
                return True
    return False
