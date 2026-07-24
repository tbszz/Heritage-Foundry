import unittest
import tempfile
from pathlib import Path
import sys
import json
import struct
from contextlib import nullcontext
from unittest.mock import patch

import numpy as np
from PIL import Image

try:
    from sidecar.triposr_sidecar.engine import (
        TripoSREngine,
        export_vertex_color_glb,
        load_official_model,
        normalize_z_up_vertices,
        prepare_input_image,
    )
except (ImportError, ModuleNotFoundError):
    TripoSREngine = None
    export_vertex_color_glb = None
    load_official_model = None
    normalize_z_up_vertices = None
    prepare_input_image = None


class MeshNormalizationTests(unittest.TestCase):
    def test_faces_the_threejs_positive_z_camera_after_triposr_axis_conversion(self):
        vertices = np.array(
            [
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
            ],
            dtype=np.float32,
        )

        normalized = normalize_z_up_vertices(vertices, target_height_m=1.0)

        origin = normalized[0]
        np.testing.assert_allclose(normalized[1] - origin, [0.0, 0.0, 1.0])
        np.testing.assert_allclose(normalized[2] - origin, [1.0, 0.0, 0.0])
        np.testing.assert_allclose(normalized[3] - origin, [0.0, 1.0, 0.0])

    def test_converts_z_up_to_y_up_and_writes_an_18cm_bottom_origin_asset(self):
        self.assertIsNotNone(normalize_z_up_vertices, "mesh normalization is missing")
        vertices = np.array(
            [
                [-1.0, -2.0, -1.0],
                [3.0, -2.0, -1.0],
                [-1.0, 2.0, 3.0],
                [3.0, 2.0, 3.0],
            ],
            dtype=np.float32,
        )

        normalized = normalize_z_up_vertices(vertices, target_height_m=0.18)

        minimum = normalized.min(axis=0)
        maximum = normalized.max(axis=0)
        center = (minimum + maximum) / 2
        self.assertAlmostEqual(float(minimum[1]), 0.0, places=6)
        self.assertAlmostEqual(float(maximum[1]), 0.18, places=6)
        self.assertAlmostEqual(float(center[0]), 0.0, places=6)
        self.assertAlmostEqual(float(center[2]), 0.0, places=6)
        self.assertTrue(np.isfinite(normalized).all())

    def test_prepares_a_transparent_foreground_on_the_triposr_gray_background(self):
        self.assertIsNotNone(prepare_input_image, "input preprocessing is missing")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "subject.png"
            image = Image.new("RGBA", (30, 20), (0, 0, 0, 0))
            pixels = image.load()
            for y in range(5, 15):
                for x in range(10, 20):
                    pixels[x, y] = (220, 40, 30, 255)
            image.save(path)

            prepared = prepare_input_image(path, foreground_ratio=0.8)

        self.assertEqual(prepared.mode, "RGB")
        self.assertEqual(prepared.size[0], prepared.size[1])
        self.assertEqual(prepared.getpixel((0, 0)), (128, 128, 128))
        center = prepared.getpixel((prepared.size[0] // 2, prepared.size[1] // 2))
        self.assertGreater(center[0], 180)
        self.assertLess(center[1], 80)

    def test_removes_only_edge_connected_flat_background_from_rgb_references(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "subject-rgb.png"
            image = Image.new("RGB", (30, 20), (250, 250, 248))
            pixels = image.load()
            for y in range(4, 16):
                for x in range(9, 21):
                    pixels[x, y] = (200, 35, 30)
            for y in range(8, 12):
                for x in range(13, 17):
                    pixels[x, y] = (250, 250, 248)
            image.save(path)

            prepared = prepare_input_image(path, foreground_ratio=0.8)

        self.assertEqual(prepared.getpixel((0, 0)), (128, 128, 128))
        self.assertLessEqual(prepared.width, 18)
        center = prepared.getpixel((prepared.width // 2, prepared.height // 2))
        self.assertGreater(center[0], 235)
        self.assertGreater(center[1], 235)

    def test_exports_an_embedded_vertex_color_pbr_glb_with_meter_scale_bounds(self):
        self.assertIsNotNone(export_vertex_color_glb, "GLB exporter is missing")

        class Visual:
            vertex_colors = np.array(
                [
                    [255, 40, 30, 255],
                    [40, 255, 30, 255],
                    [40, 30, 255, 255],
                    [240, 220, 80, 255],
                ],
                dtype=np.uint8,
            )

        class Mesh:
            vertices = np.array(
                [
                    [-1.0, -1.0, -1.0],
                    [1.0, -1.0, -1.0],
                    [0.0, 1.0, -1.0],
                    [0.0, 0.0, 2.0],
                ],
                dtype=np.float32,
            )
            faces = np.array(
                [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]],
                dtype=np.uint32,
            )
            visual = Visual()

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "figurine.glb"
            export_vertex_color_glb(Mesh(), path, target_height_m=0.18)
            data = path.read_bytes()

        magic, version, total_length = struct.unpack_from("<4sII", data, 0)
        json_length, json_type = struct.unpack_from("<II", data, 12)
        document = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip(" \x00"))
        primitive = document["meshes"][0]["primitives"][0]
        position = document["accessors"][primitive["attributes"]["POSITION"]]
        material = document["materials"][primitive["material"]]["pbrMetallicRoughness"]

        self.assertEqual(magic, b"glTF")
        self.assertEqual(version, 2)
        self.assertEqual(total_length, len(data))
        self.assertEqual(json_type, 0x4E4F534A)
        self.assertEqual(document["asset"]["version"], "2.0")
        self.assertIn("NORMAL", primitive["attributes"])
        self.assertIn("COLOR_0", primitive["attributes"])
        self.assertAlmostEqual(position["min"][1], 0.0, places=6)
        self.assertAlmostEqual(position["max"][1], 0.18, places=6)
        self.assertEqual(material["metallicFactor"], 0.0)
        self.assertGreater(material["roughnessFactor"], 0.5)


class EngineLifecycleTests(unittest.TestCase):
    def test_stays_unready_when_the_official_triposr_repository_is_missing(self):
        self.assertIsNotNone(TripoSREngine, "TripoSREngine is not implemented")
        engine = TripoSREngine(repo_path="Z:/missing/TripoSR")

        with self.assertRaises(FileNotFoundError):
            engine.load()

        self.assertFalse(engine.ready)

    def test_uses_the_real_preprocessor_and_glb_exporter_by_default(self):
        engine = TripoSREngine(repo_path="D:/fixture/TripoSR")

        self.assertIs(engine.image_loader, prepare_input_image)
        self.assertIs(engine.mesh_exporter, export_vertex_color_glb)

    def test_loads_one_model_instance_and_marks_the_engine_ready(self):
        class FakeRenderer:
            def set_chunk_size(self, value):
                self.chunk_size = value

        class FakeModel:
            def __init__(self):
                self.renderer = FakeRenderer()

            def to(self, device):
                self.device = device
                return self

        fake_model = FakeModel()
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "tsr").mkdir()
            (repo / "tsr" / "system.py").write_text("# fixture", encoding="utf-8")
            engine = TripoSREngine(
                repo_path=repo,
                device="cpu",
                chunk_size=2048,
                model_loader=lambda _repo, _model_id: fake_model,
            )

            engine.load()
            engine.load()

        self.assertTrue(engine.ready)
        self.assertEqual(fake_model.device, "cpu")
        self.assertEqual(fake_model.renderer.chunk_size, 2048)

    def test_close_releases_the_loaded_model_and_resets_readiness(self):
        engine = TripoSREngine(repo_path="D:/fixture/TripoSR")
        engine.model = object()
        engine._ready = True

        engine.close()

        self.assertIsNone(engine.model)
        self.assertFalse(engine.ready)

    def test_default_loader_uses_the_official_tsr_pretrained_entrypoint(self):
        self.assertIsNotNone(load_official_model, "official model loader is missing")
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            package = repo / "tsr"
            package.mkdir()
            (package / "__init__.py").write_text("", encoding="utf-8")
            (package / "system.py").write_text(
                "class TSR:\n"
                "    @classmethod\n"
                "    def from_pretrained(cls, model_id, config_name, weight_name):\n"
                "        return (model_id, config_name, weight_name)\n",
                encoding="utf-8",
            )
            try:
                loaded = load_official_model(repo, "fixture/model")
            finally:
                sys.modules.pop("tsr.system", None)
                sys.modules.pop("tsr", None)

        self.assertEqual(loaded, ("fixture/model", "config.yaml", "model.ckpt"))

    def test_local_checkpoint_loader_uses_safe_memory_mapped_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            package = repo / "tsr"
            package.mkdir(parents=True)
            (package / "__init__.py").write_text("", encoding="utf-8")
            (package / "system.py").write_text(
                "class TSR:\n"
                "    def __init__(self, cfg): self.cfg = cfg\n"
                "    def load_state_dict(self, state): self.state = state\n",
                encoding="utf-8",
            )
            model = root / "model"
            model.mkdir()
            (model / "config.yaml").write_text("{}", encoding="utf-8")
            (model / "model.ckpt").write_bytes(b"verified fixture")
            try:
                with patch("torch.load", return_value={"weight": 1}) as torch_load:
                    loaded = load_official_model(repo, str(model))
            finally:
                sys.modules.pop("tsr.system", None)
                sys.modules.pop("tsr", None)

        self.assertEqual(loaded.state, {"weight": 1})
        torch_load.assert_called_once_with(
            str(model / "model.ckpt"),
            map_location="cpu",
            weights_only=True,
            mmap=True,
        )

    def test_generate_runs_inference_extracts_a_colored_mesh_and_exports_glb(self):
        class FakeRenderer:
            def set_chunk_size(self, value):
                self.chunk_size = value

        class FakeModel:
            def __init__(self):
                self.renderer = FakeRenderer()
                self.calls = []

            def to(self, device):
                self.device = device
                return self

            def __call__(self, images, device):
                self.calls.append((images, device))
                return "scene-codes"

            def extract_mesh(self, scene_codes, has_vertex_color, resolution):
                self.extraction = (scene_codes, has_vertex_color, resolution)
                return ["colored-mesh"]

        fake_model = FakeModel()
        exported = []
        progress_values = []
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            (repo / "tsr").mkdir(parents=True)
            (repo / "tsr" / "system.py").write_text("# fixture", encoding="utf-8")
            image_path = Path(directory) / "input.png"
            image_path.write_bytes(b"fixture")
            output_path = Path(directory) / "model.glb"
            engine = TripoSREngine(
                repo_path=repo,
                device="cpu",
                mc_resolution=160,
                model_loader=lambda _repo, _model_id: fake_model,
                image_loader=lambda path: ("prepared", path),
                mesh_exporter=lambda mesh, path, height: (
                    exported.append((mesh, path, height)),
                    path.write_bytes(b"glb"),
                ),
                inference_context=nullcontext,
            )
            engine.load()

            self.assertTrue(hasattr(engine, "generate"), "engine.generate is missing")
            engine.generate(
                image_path=image_path,
                output_path=output_path,
                target_polycount=80_000,
                progress=progress_values.append,
            )

        self.assertEqual(fake_model.calls, [([("prepared", image_path)], "cpu")])
        self.assertEqual(fake_model.extraction, ("scene-codes", True, 160))
        self.assertEqual(exported, [("colored-mesh", output_path, 0.18)])
        self.assertEqual(progress_values, [15, 55, 82, 96])

    def test_converts_cuda_oom_into_an_actionable_public_failure(self):
        class FakeRenderer:
            def set_chunk_size(self, _value):
                pass

        class OomModel:
            renderer = FakeRenderer()

            def to(self, _device):
                return self

            def __call__(self, _images, device):
                raise RuntimeError(f"CUDA out of memory on {device}: private allocation")

        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            (repo / "tsr").mkdir(parents=True)
            (repo / "tsr" / "system.py").write_text("# fixture", encoding="utf-8")
            image_path = Path(directory) / "input.png"
            image_path.write_bytes(b"fixture")
            engine = TripoSREngine(
                repo_path=repo,
                device="cuda:0",
                model_loader=lambda _repo, _model_id: OomModel(),
                image_loader=lambda _path: "prepared",
                inference_context=nullcontext,
            )
            engine.load()

            with self.assertRaises(Exception) as raised:
                engine.generate(
                    image_path=image_path,
                    output_path=Path(directory) / "model.glb",
                    target_polycount=80_000,
                    progress=lambda _value: None,
                )

        self.assertEqual(
            getattr(raised.exception, "public_message", None),
            "GPU 显存不足，请关闭占用显卡的程序后重试",
        )
        self.assertNotIn("private allocation", str(getattr(raised.exception, "public_message", "")))


if __name__ == "__main__":
    unittest.main()
