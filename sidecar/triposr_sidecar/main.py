import logging
import os
from pathlib import Path

from .api import SidecarSettings, create_app
from .engine import TripoSREngine


LOGGER = logging.getLogger("heritage-foundry-3d")


def _positive_int(value, fallback):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def build_app_from_env(environ, engine_factory=TripoSREngine):
    repo_path = Path(
        environ.get("TRIPOSR_REPO_PATH", "D:/HeritageFoundry3D/TripoSR")
    )
    artifact_dir = Path(
        environ.get("TRIPOSR_ARTIFACT_DIR", "D:/HeritageFoundry3D/artifacts")
    )
    engine = engine_factory(
        repo_path=repo_path,
        model_id=environ.get("TRIPOSR_MODEL_ID", "stabilityai/TripoSR"),
        device=environ.get("TRIPOSR_DEVICE", "cuda:0"),
        chunk_size=_positive_int(environ.get("TRIPOSR_CHUNK_SIZE"), 4096),
        mc_resolution=_positive_int(environ.get("TRIPOSR_MC_RESOLUTION"), 160),
        target_height_m=float(environ.get("TRIPOSR_TARGET_HEIGHT_M", "0.18")),
    )
    settings = SidecarSettings(
        artifact_dir=artifact_dir,
        api_key=environ.get("LOCAL_3D_API_KEY", ""),
        max_image_bytes=_positive_int(
            environ.get("LOCAL_3D_MAX_IMAGE_BYTES"),
            10 * 1024 * 1024,
        ),
        max_tasks=_positive_int(environ.get("TRIPOSR_MAX_TASKS"), 100),
        max_queue_size=_positive_int(environ.get("TRIPOSR_MAX_QUEUE_SIZE"), 2),
    )
    app = create_app(engine=engine, settings=settings)
    app.state.engine = engine
    app.state.settings = settings

    def load_engine():
        try:
            engine.load()
        except Exception as error:
            app.state.load_error = error
            LOGGER.exception("TripoSR engine failed to load")

    app.add_event_handler("startup", load_engine)
    return app


app = build_app_from_env(os.environ)
