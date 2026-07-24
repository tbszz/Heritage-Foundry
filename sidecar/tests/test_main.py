import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

try:
    from sidecar.triposr_sidecar.main import build_app_from_env
except ModuleNotFoundError:
    build_app_from_env = None


class MainAppTests(unittest.TestCase):
    def test_builds_the_sidecar_from_environment_and_loads_the_engine_on_startup(self):
        self.assertIsNotNone(build_app_from_env, "sidecar main entrypoint is missing")

        class FakeEngine:
            def __init__(self, **options):
                self.options = options
                self.ready = False

            def load(self):
                self.ready = True

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "TripoSR"
            artifacts = root / "artifacts"
            app = build_app_from_env(
                {
                    "TRIPOSR_REPO_PATH": str(repo),
                    "TRIPOSR_ARTIFACT_DIR": str(artifacts),
                    "TRIPOSR_DEVICE": "cpu",
                    "TRIPOSR_CHUNK_SIZE": "2048",
                    "TRIPOSR_MC_RESOLUTION": "144",
                    "LOCAL_3D_API_KEY": "fixture-token",
                },
                engine_factory=FakeEngine,
            )

            with TestClient(app) as client:
                response = client.get(
                    "/v1/capabilities",
                    headers={"Authorization": "Bearer fixture-token"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready"])
        self.assertEqual(app.state.engine.options["repo_path"], repo)
        self.assertEqual(app.state.engine.options["device"], "cpu")
        self.assertEqual(app.state.engine.options["chunk_size"], 2048)
        self.assertEqual(app.state.engine.options["mc_resolution"], 144)
        self.assertEqual(app.state.settings.artifact_dir, artifacts)


if __name__ == "__main__":
    unittest.main()
