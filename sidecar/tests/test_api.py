import tempfile
import base64
import json
import struct
import time
import threading
from io import BytesIO
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

try:
    from sidecar.triposr_sidecar.api import SidecarSettings, create_app
except ModuleNotFoundError:
    SidecarSettings = None
    create_app = None


class FakeEngine:
    @property
    def ready(self):
        return True


def minimal_glb():
    document = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "mode": 4}]}],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
            }
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 36, "target": 34962}
        ],
        "buffers": [{"byteLength": 36}],
    }
    json_chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    binary = struct.pack("<9f", 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    return b"".join(
        (
            struct.pack("<4sII", b"glTF", 2, total_length),
            struct.pack("<II", len(json_chunk), 0x4E4F534A),
            json_chunk,
            struct.pack("<II", len(binary), 0x004E4942),
            binary,
        )
    )


def empty_glb():
    json_chunk = b'{"asset":{"version":"2.0"}}'
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    total_length = 12 + 8 + len(json_chunk)
    return struct.pack("<4sII", b"glTF", 2, total_length) + struct.pack(
        "<II", len(json_chunk), 0x4E4F534A
    ) + json_chunk


def png_data_url():
    buffer = BytesIO()
    Image.new("RGB", (2, 2), (210, 40, 30)).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class FakeGeneratingEngine(FakeEngine):
    def generate(self, *, image_path, output_path, target_polycount, progress):
        self.image_path = image_path
        self.target_polycount = target_polycount
        progress(65)
        output_path.write_bytes(minimal_glb())


class BlockingEngine(FakeGeneratingEngine):
    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()

    def generate(self, **kwargs):
        self.started.set()
        self.release.wait(timeout=2)
        super().generate(**kwargs)


class FailingEngine(FakeEngine):
    def generate(self, **_kwargs):
        raise RuntimeError("C:/private/model-cache/token=secret")


class PartialFailingEngine(FakeEngine):
    def generate(self, *, output_path, **_kwargs):
        output_path.write_bytes(b"partial glb")
        raise RuntimeError("generation failed")


class EmptyGlbEngine(FakeEngine):
    def generate(self, *, output_path, **_kwargs):
        output_path.write_bytes(empty_glb())


class CloseTrackingEngine(FakeGeneratingEngine):
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class CapabilityTests(unittest.TestCase):
    def test_reports_the_existing_v1_glb_contract_when_engine_is_ready(self):
        self.assertIsNotNone(create_app, "sidecar API is not implemented")
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )

            response = TestClient(app).get("/v1/capabilities")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "apiVersion": "1",
                "ready": True,
                "imageTo3D": {
                    "formats": ["glb"],
                    "pbr": True,
                    "texturing": False,
                    "vertexColors": True,
                },
            },
        )

    def test_requires_the_configured_bearer_token(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeEngine(),
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    api_key="local-secret",
                ),
            )
            client = TestClient(app)

            missing = client.get("/v1/capabilities")
            wrong = client.get(
                "/v1/capabilities",
                headers={"Authorization": "Bearer wrong"},
            )
            accepted = client.get(
                "/v1/capabilities",
                headers={"Authorization": "Bearer local-secret"},
            )

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(accepted.status_code, 200)


class TaskApiTests(unittest.TestCase):
    def test_removes_orphaned_task_files_only_when_the_sidecar_starts(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_dir = Path(directory)
            orphan_glb = artifact_dir / "orphan.glb"
            orphan_image = artifact_dir / "orphan.png"
            unrelated = artifact_dir / "keep.txt"
            orphan_glb.write_bytes(b"old")
            orphan_image.write_bytes(b"old")
            unrelated.write_text("keep", encoding="utf-8")

            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(artifact_dir=artifact_dir),
            )

            self.assertTrue(orphan_glb.exists())
            self.assertTrue(orphan_image.exists())
            with TestClient(app):
                self.assertFalse(orphan_glb.exists())
                self.assertFalse(orphan_image.exists())
            self.assertTrue(unrelated.exists())

    def test_releases_the_gpu_queue_when_input_cleanup_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_queue_size=1,
                ),
            )
            with TestClient(app) as client:
                with patch.object(Path, "unlink", side_effect=OSError("locked")):
                    first = client.post(
                        "/v1/image-to-3d",
                        json={"image_url": png_data_url()},
                    )
                    first_id = first.json()["id"]
                    deadline = time.monotonic() + 2
                    while time.monotonic() < deadline:
                        first_task = client.get(
                            f"/v1/image-to-3d/{first_id}"
                        ).json()
                        if first_task.get("status") == "succeeded":
                            break
                        time.sleep(0.01)
                    second = client.post(
                        "/v1/image-to-3d",
                        json={"image_url": png_data_url()},
                    )

        self.assertEqual(first.status_code, 202)
        self.assertEqual(first_task["status"], "succeeded")
        self.assertEqual(second.status_code, 202)

    def test_releases_the_gpu_queue_when_staging_the_input_image_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_queue_size=1,
                ),
            )
            client = TestClient(app, raise_server_exceptions=False)

            with patch.object(Path, "write_bytes", side_effect=OSError("disk full")):
                first = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                )
                second = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                )

        self.assertEqual(first.status_code, 500)
        self.assertEqual(second.status_code, 500)

    def test_shuts_down_the_worker_executor_with_the_app(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )

            with TestClient(app):
                self.assertFalse(app.state.executor._shutdown)

            self.assertTrue(app.state.executor._shutdown)

    def test_releases_the_loaded_model_after_draining_tasks(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = CloseTrackingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )

            with TestClient(app):
                self.assertFalse(engine.closed)

            self.assertTrue(engine.closed)

    def test_drains_running_and_queued_work_before_shutdown(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = BlockingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_queue_size=2,
                ),
            )

            with TestClient(app) as client:
                first = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                ).json()
                self.assertTrue(engine.started.wait(timeout=1))
                second = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                ).json()
                threading.Timer(0.05, engine.release.set).start()

            first_task = app.state.tasks.get(first["id"])
            second_task = app.state.tasks.get(second["id"])

        self.assertEqual(first_task.status, "succeeded")
        self.assertEqual(second_task.status, "succeeded")

    def test_runs_an_image_to_glb_task_and_exposes_its_terminal_state(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = FakeGeneratingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )
            client = TestClient(app)

            created = client.post(
                "/v1/image-to-3d",
                json={
                    "image_url": png_data_url(),
                    "output_format": "glb",
                    "texture": True,
                    "pbr": True,
                    "remesh": True,
                    "target_polycount": 80000,
                },
            )

            self.assertEqual(created.status_code, 202)
            task_id = created.json()["id"]
            self.assertEqual(created.json()["status"], "queued")

            deadline = time.monotonic() + 2
            polled = None
            while time.monotonic() < deadline:
                polled = client.get(f"/v1/image-to-3d/{task_id}")
                if polled.json().get("status") == "succeeded":
                    break
                time.sleep(0.01)
            staged_input_exists = engine.image_path.exists()

        self.assertEqual(polled.status_code, 200)
        self.assertEqual(polled.json()["id"], task_id)
        self.assertEqual(polled.json()["status"], "succeeded")
        self.assertEqual(polled.json()["progress"], 100)
        self.assertEqual(
            polled.json()["model_url"],
            f"/v1/artifacts/{task_id}.glb",
        )
        self.assertEqual(engine.target_polycount, 80000)
        self.assertFalse(staged_input_exists)

    def test_serves_the_generated_glb_from_the_task_owned_artifact_path(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )
            client = TestClient(app)
            created = client.post(
                "/v1/image-to-3d",
                json={"image_url": png_data_url()},
            )
            task_id = created.json()["id"]
            deadline = time.monotonic() + 2
            task = None
            while time.monotonic() < deadline:
                task = client.get(f"/v1/image-to-3d/{task_id}").json()
                if task.get("status") == "succeeded":
                    break
                time.sleep(0.01)

            artifact = client.get(task["model_url"])

        self.assertEqual(artifact.status_code, 200)
        self.assertEqual(artifact.headers["content-type"], "model/gltf-binary")
        self.assertEqual(artifact.content, minimal_glb())

    def test_evicts_only_terminal_tasks_and_removes_their_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_dir = Path(directory)
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(
                    artifact_dir=artifact_dir,
                    max_tasks=2,
                    max_queue_size=1,
                ),
            )
            with TestClient(app) as client:
                task_ids = []
                for _index in range(3):
                    created = client.post(
                        "/v1/image-to-3d",
                        json={"image_url": png_data_url()},
                    ).json()
                    task_ids.append(created["id"])
                    deadline = time.monotonic() + 2
                    while time.monotonic() < deadline:
                        task = client.get(
                            f"/v1/image-to-3d/{created['id']}"
                        ).json()
                        if task.get("status") == "succeeded":
                            break
                        time.sleep(0.01)

                oldest = client.get(f"/v1/image-to-3d/{task_ids[0]}")
                oldest_artifact_exists = (
                    artifact_dir / f"{task_ids[0]}.glb"
                ).exists()

        self.assertEqual(oldest.status_code, 404)
        self.assertFalse(oldest_artifact_exists)

    def test_rejects_capacity_pressure_without_evicting_an_active_task(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = BlockingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_tasks=1,
                    max_queue_size=2,
                ),
            )
            with TestClient(app) as client:
                first = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                )
                self.assertTrue(engine.started.wait(timeout=1))
                second = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                )
                first_status = client.get(
                    f"/v1/image-to-3d/{first.json()['id']}"
                )
                engine.release.set()

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(first_status.status_code, 200)

    def test_rejects_new_work_when_the_single_gpu_queue_is_full(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = BlockingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_queue_size=1,
                ),
            )
            client = TestClient(app)
            payload = {"image_url": png_data_url()}

            first = client.post("/v1/image-to-3d", json=payload)
            self.assertTrue(engine.started.wait(timeout=1))
            second = client.post("/v1/image-to-3d", json=payload)
            engine.release.set()
            task_id = first.json()["id"]
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                task = client.get(f"/v1/image-to-3d/{task_id}").json()
                if task.get("status") in {"succeeded", "failed"}:
                    break
                time.sleep(0.01)

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 429)

    def test_skips_image_decode_when_the_gpu_queue_is_already_full(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = BlockingEngine()
            app = create_app(
                engine=engine,
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_queue_size=1,
                ),
            )
            with TestClient(app) as client:
                first = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                )
                self.assertTrue(engine.started.wait(timeout=1))
                with patch(
                    "sidecar.triposr_sidecar.api.decode_image_data_url"
                ) as decoder:
                    second = client.post(
                        "/v1/image-to-3d",
                        json={"image_url": png_data_url()},
                    )
                engine.release.set()

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 429)
        decoder.assert_not_called()

    def test_rejects_an_oversized_json_body_before_route_decoding(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(
                    artifact_dir=Path(directory),
                    max_image_bytes=16,
                ),
            )
            with TestClient(app) as client:
                with patch(
                    "sidecar.triposr_sidecar.api.decode_image_data_url"
                ) as decoder:
                    response = client.post(
                        "/v1/image-to-3d",
                        json={"image_url": "data:image/png;base64," + ("A" * 70000)},
                    )

        self.assertEqual(response.status_code, 413)
        decoder.assert_not_called()

    def test_rejects_non_image_data_without_creating_a_task(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FakeGeneratingEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )
            client = TestClient(app, raise_server_exceptions=False)

            response = client.post(
                "/v1/image-to-3d",
                json={"image_url": "data:text/plain;base64,bm90LWFuLWltYWdl"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("PNG", response.json()["detail"])

    def test_does_not_expose_internal_engine_exceptions_in_task_status(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=FailingEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )
            client = TestClient(app)
            created = client.post(
                "/v1/image-to-3d",
                json={"image_url": png_data_url()},
            )
            task_id = created.json()["id"]
            deadline = time.monotonic() + 2
            task = None
            while time.monotonic() < deadline:
                task = client.get(f"/v1/image-to-3d/{task_id}").json()
                if task.get("status") == "failed":
                    break
                time.sleep(0.01)

        self.assertEqual(task["status"], "failed")
        self.assertEqual(task["error"], "3D generation failed")
        self.assertNotIn("private", str(task))
        self.assertNotIn("secret", str(task))

    def test_removes_a_partial_glb_when_generation_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_dir = Path(directory)
            app = create_app(
                engine=PartialFailingEngine(),
                settings=SidecarSettings(artifact_dir=artifact_dir),
            )
            with TestClient(app) as client:
                created = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                ).json()
                task_id = created["id"]
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    task = client.get(f"/v1/image-to-3d/{task_id}").json()
                    if task.get("status") == "failed":
                        break
                    time.sleep(0.01)
                partial_exists = (artifact_dir / f"{task_id}.glb").exists()

        self.assertEqual(task["status"], "failed")
        self.assertFalse(partial_exists)

    def test_rejects_a_glb_container_without_real_mesh_geometry(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                engine=EmptyGlbEngine(),
                settings=SidecarSettings(artifact_dir=Path(directory)),
            )
            with TestClient(app) as client:
                created = client.post(
                    "/v1/image-to-3d",
                    json={"image_url": png_data_url()},
                ).json()
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    task = client.get(
                        f"/v1/image-to-3d/{created['id']}"
                    ).json()
                    if task.get("status") in {"succeeded", "failed"}:
                        break
                    time.sleep(0.01)

        self.assertEqual(task["status"], "failed")


if __name__ == "__main__":
    unittest.main()
