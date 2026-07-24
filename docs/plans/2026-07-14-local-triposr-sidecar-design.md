# Local TripoSR Sidecar Design

## Decision

Use the official MIT-licensed TripoSR model as the first local image-to-3D
engine. Keep the existing Node provider contract and Three.js renderer intact.
Stable Fast 3D remains the preferred quality upgrade once its gated model
license is accepted and a Windows C++ build toolchain is available; Hunyuan3D
remains a remote high-VRAM provider option.

Gaussian splatting is not the handoff format for figurines. The generated
artifact must be a conventional GLB 2.0 triangle mesh that Three.js can light,
orbit, reload, and download.

## Runtime architecture

- The sidecar listens only on `127.0.0.1:7861`.
- FastAPI exposes the existing v1 contract: capabilities, create task, poll
  task, and same-origin GLB artifact.
- A single-worker executor serializes GPU jobs. HTTP requests never run model
  inference inline.
- TripoSR code and model weights live outside the repository on `D:`. The repo
  contains only the adapter, tests, requirements, and launch script.
- The official TripoSR model performs GPU reconstruction. A local
  `torchmcubes` compatibility module uses CPU marching cubes on Windows so the
  project does not require an untrusted binary wheel or a Visual Studio build.
- The first production-safe profile uses a reduced marching-cubes resolution
  and vertex-color GLB. The exported glTF material uses metallic-roughness PBR
  factors, while preserving the generated vertex colors as base color.

## Data flow

1. Gemini creates a clean full-body three-quarter reference image.
2. Node validates the data URL and submits a fixed GLB/texturing/PBR contract.
3. The sidecar decodes the image into a per-task directory and returns
   `queued` immediately.
4. The GPU worker loads TripoSR once, preprocesses the foreground, reconstructs
   a mesh, extracts vertex colors, normalizes orientation and scale, and writes
   an ordinary embedded GLB.
5. Polling returns `succeeded` with a relative same-origin artifact URL.
6. Node revalidates and proxies the GLB; Three.js loads it with `GLTFLoader`.

## Failure and security behavior

- Optional bearer authentication is applied to every sidecar endpoint.
- Only PNG, JPEG, and WebP base64 data URLs are accepted, with decoded byte and
  pixel limits.
- Task identifiers are random UUID hex strings; callers cannot choose paths.
- Artifacts are resolved from task metadata, never from user path input.
- GPU OOM, malformed input, unavailable model, and export errors transition the
  task to `failed` with a bounded public error message.
- Readiness stays false until dependencies and the model are loaded.
- One GPU job runs at a time; queue depth is bounded.

## Verification

- Unit tests cover data URL validation, authorization, readiness, task state,
  queue saturation, error sanitization, and artifact delivery.
- A real engine smoke test generates one GLB and checks GLB 2.0 structure,
  non-empty geometry, finite bounds, PBR material, vertex color, Y=0 base, and
  absence of unsupported required compression extensions.
- Node integration verifies the sidecar through `/api/3d-capabilities`, task
  creation/polling, and the fixed GLB proxy.
- Browser verification selects “3D手办”, loads the generated mesh, rotates it,
  and verifies the download link.
