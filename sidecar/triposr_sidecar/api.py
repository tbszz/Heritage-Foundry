from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from dataclasses import asdict
import logging
from pathlib import Path
from secrets import compare_digest
from threading import BoundedSemaphore

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from .core import decode_image_data_url, validate_glb_mesh
from .jobs import TaskCapacityError, TaskStore


LOGGER = logging.getLogger("heritage-foundry-3d")
ARTIFACT_SUFFIXES = (".glb", ".png", ".jpg", ".jpeg", ".webp")


class RequestBodyTooLarge(RuntimeError):
    pass


class RequestBodyLimitMiddleware:
    def __init__(self, app, max_bytes: int, api_key: str = ""):
        self.app = app
        self.max_bytes = max(1, int(max_bytes))
        self.api_key = api_key

    async def __call__(self, scope, receive, send):
        guarded = (
            scope.get("type") == "http"
            and scope.get("method") == "POST"
            and scope.get("path") == "/v1/image-to-3d"
        )
        if not guarded:
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        if self.api_key:
            expected = f"Bearer {self.api_key}"
            if not compare_digest(headers.get("authorization", ""), expected):
                await JSONResponse(
                    {"detail": "Unauthorized"},
                    status_code=401,
                )(scope, receive, send)
                return

        declared = headers.get("content-length")
        if declared:
            try:
                if int(declared) > self.max_bytes:
                    raise RequestBodyTooLarge
            except ValueError:
                await JSONResponse(
                    {"detail": "Invalid Content-Length"},
                    status_code=400,
                )(scope, receive, send)
                return
            except RequestBodyTooLarge:
                await JSONResponse(
                    {"detail": "Request body too large"},
                    status_code=413,
                )(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await JSONResponse(
                {"detail": "Request body too large"},
                status_code=413,
            )(scope, receive, send)


@dataclass(frozen=True)
class SidecarSettings:
    artifact_dir: Path
    api_key: str = ""
    max_image_bytes: int = 10 * 1024 * 1024
    max_tasks: int = 100
    max_queue_size: int = 2


class ImageTo3DRequest(BaseModel):
    image_url: str
    output_format: str = "glb"
    texture: bool = True
    pbr: bool = True
    remesh: bool = True
    target_polycount: int = Field(default=100_000, ge=10_000, le=300_000)
    pose_mode: str | None = None


def create_app(engine, settings: SidecarSettings) -> FastAPI:
    app = FastAPI(title="Heritage Foundry Local 3D", version="1.0")
    max_encoded_image_bytes = ((settings.max_image_bytes + 2) // 3) * 4
    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_bytes=max_encoded_image_bytes + 64 * 1024,
        api_key=settings.api_key,
    )
    settings.artifact_dir.mkdir(parents=True, exist_ok=True)

    def safe_unlink(path: Path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            LOGGER.warning("Unable to remove local 3D artifact %s", path.name)

    def cleanup_task_files(task):
        task_id = task.id if hasattr(task, "id") else str(task)
        for suffix in ARTIFACT_SUFFIXES:
            safe_unlink(settings.artifact_dir / f"{task_id}{suffix}")

    def cleanup_orphaned_artifacts():
        for existing in settings.artifact_dir.iterdir():
            if existing.is_file() and existing.suffix.lower() in ARTIFACT_SUFFIXES:
                safe_unlink(existing)

    app.add_event_handler("startup", cleanup_orphaned_artifacts)

    tasks = TaskStore(
        max_tasks=settings.max_tasks,
        on_evict=cleanup_task_files,
    )
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="triposr")
    queue_slots = BoundedSemaphore(max(1, settings.max_queue_size))
    app.state.tasks = tasks
    app.state.executor = executor

    def shutdown_executor():
        executor.shutdown(wait=True, cancel_futures=False)
        close_engine = getattr(engine, "close", None)
        if callable(close_engine):
            try:
                close_engine()
            except Exception:
                LOGGER.exception("Unable to release the local 3D engine")

    app.add_event_handler("shutdown", shutdown_executor)

    def authorize(authorization: str = Header(default="")):
        if not settings.api_key:
            return
        expected = f"Bearer {settings.api_key}"
        if not compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="Unauthorized")

    @app.get("/v1/capabilities", dependencies=[Depends(authorize)])
    def capabilities():
        return {
            "apiVersion": "1",
            "ready": bool(engine.ready),
            "imageTo3D": {
                "formats": ["glb"],
                "pbr": True,
                "texturing": False,
                "vertexColors": True,
            },
        }

    def task_payload(task):
        return {key: value for key, value in asdict(task).items() if value is not None}

    def run_task(task_id: str, image_path: Path, output_path: Path, target_polycount: int):
        try:
            tasks.update(task_id, status="processing", progress=5)

            def report_progress(value: int):
                tasks.update(
                    task_id,
                    status="processing",
                    progress=max(5, min(99, int(value))),
                )

            engine.generate(
                image_path=image_path,
                output_path=output_path,
                target_polycount=target_polycount,
                progress=report_progress,
            )
            if not validate_glb_mesh(output_path):
                raise RuntimeError("3D engine did not create a valid mesh GLB artifact")
            tasks.update(
                task_id,
                status="succeeded",
                progress=100,
                model_url=f"/v1/artifacts/{task_id}.glb",
            )
        except Exception as error:
            safe_unlink(output_path)
            public_message = getattr(error, "public_message", "3D generation failed")
            tasks.update(
                task_id,
                status="failed",
                error=str(public_message)[:400] or "3D generation failed",
            )
        finally:
            try:
                safe_unlink(image_path)
            finally:
                queue_slots.release()

    @app.post(
        "/v1/image-to-3d",
        status_code=202,
        dependencies=[Depends(authorize)],
    )
    def create_task(payload: ImageTo3DRequest):
        if not engine.ready:
            raise HTTPException(status_code=503, detail="3D engine is not ready")
        if payload.output_format != "glb" or not payload.texture or not payload.pbr:
            raise HTTPException(status_code=422, detail="GLB, texturing, and PBR are required")
        if not queue_slots.acquire(blocking=False):
            raise HTTPException(status_code=429, detail="3D generation queue is full")
        task = None
        image_path = None
        submitted = False
        try:
            decoded = decode_image_data_url(payload.image_url, settings.max_image_bytes)
            task = tasks.create()
            image_path = settings.artifact_dir / f"{task.id}{decoded.extension}"
            output_path = settings.artifact_dir / f"{task.id}.glb"
            image_path.write_bytes(decoded.bytes)
            executor.submit(
                run_task,
                task.id,
                image_path,
                output_path,
                payload.target_polycount,
            )
            submitted = True
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except TaskCapacityError as error:
            raise HTTPException(
                status_code=429,
                detail="3D task retention capacity is full",
            ) from error
        except Exception:
            raise
        finally:
            if not submitted:
                if image_path is not None:
                    safe_unlink(image_path)
                if task is not None:
                    tasks.delete(task.id)
                queue_slots.release()
        return task_payload(task)

    @app.get("/v1/image-to-3d/{task_id}", dependencies=[Depends(authorize)])
    def get_task(task_id: str):
        task = tasks.get(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return task_payload(task)

    @app.get("/v1/artifacts/{task_id}.glb", dependencies=[Depends(authorize)])
    def get_artifact(task_id: str):
        task = tasks.get(task_id)
        if task is None or task.status != "succeeded":
            raise HTTPException(status_code=404, detail="Artifact not found")
        artifact_path = settings.artifact_dir / f"{task.id}.glb"
        if not artifact_path.is_file():
            raise HTTPException(status_code=404, detail="Artifact not found")
        return FileResponse(
            artifact_path,
            media_type="model/gltf-binary",
            filename=f"{task.id}.glb",
            headers={"Cache-Control": "private, no-store"},
        )

    return app
