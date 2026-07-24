# Heritage Foundry API

Base path: `/api`

## Health

`GET /api/health`

Returns server status and timestamp.

## AI Image Generation

`POST /api/generate-image`

Body:

```json
{
  "prompt": "苗绣风格的哆啦A梦拼豆挂件",
  "aspect_ratio": "1:1",
  "image_size": "1K",
  "mime_type": "image/png",
  "style": "chinese",
  "craft_type": "embroidery"
}
```

Response:

```json
{
  "success": true,
  "image": "data:image/png;base64,...",
  "message": "生成成功",
  "metadata": {}
}
```

If `GEMINI_API_KEY` is not configured, this endpoint returns `503` instead of preventing the server from booting.

## AI Image Editing

`POST /api/edit-image`

Body includes `image` as a base64 data URL and `prompt`.

## Image-to-3D Generation

The 3D endpoints expose one provider-neutral task contract. The server selects
`meshy` or `local` from `THREE_D_PROVIDER`; request bodies cannot override the
provider or its base URL. The browser never receives provider keys or private
sidecar addresses.

### Capabilities

`GET /api/3d-capabilities`

Returns the selected provider, whether its server-side configuration is present,
whether the provider is actually ready, and the GLB/PBR/surface-color
contract. For `local`, the server verifies the sidecar `/v1/capabilities`
response before `ready` becomes true. The endpoint has its own rate limit and
uses a short server-side cache with concurrent request coalescing, so capability
probes cannot exhaust the sidecar. It never returns keys or base URLs.

### Create a task

`POST /api/generate-3d`

Body:

```json
{
  "image_url": "data:image/png;base64,...",
  "target_polycount": 100000,
  "pose_mode": "a-pose"
}
```

- `image_url` is required. `image` is accepted as a compatibility alias. Meshy
  accepts a data URL or an image URL it can access. The local provider accepts
  only PNG/JPEG/WebP base64 data URLs and applies a decoded-size limit, so it
  cannot be used to make the sidecar fetch arbitrary URLs.
- `target_polycount` is optional, defaults to `100000`, and must be an integer
  from `10000` to `300000`. Meshy uses it as a remesh target. The bundled
  TripoSR sidecar validates it for contract compatibility, but its actual
  topology is controlled by `TRIPOSR_MC_RESOLUTION`.
- `pose_mode` is optional. Supported values are `a-pose` and `t-pose`.
- For Meshy, the server fixes the quality contract to its latest standard model
  with texturing, PBR, HD texture, lighting removal, remeshing, automatic sizing,
  bottom origin, and GLB output. The bundled local sidecar produces a real GLB
  mesh with normals, vertex surface color, and a metallic-roughness PBR
  material; it does not claim UV texture maps or pose-aware remeshing.
  Client-provided quality or provider flags never override server settings.

Successful response: `202 Accepted`

```json
{
  "success": true,
  "task": {
    "id": "meshy-task-id",
    "provider": "meshy",
    "status": "queued",
    "progress": 0,
    "modelUrl": null,
    "previewUrl": null,
    "error": null
  },
  "message": "真实 3D 模型生成任务已创建"
}
```

### Query a task

`GET /api/generate-3d/:id`

Successful response: `200 OK`

```json
{
  "success": true,
  "task": {
    "id": "meshy-task-id",
    "provider": "meshy",
    "status": "succeeded",
    "progress": 100,
    "modelUrl": "https://provider.example/signed-model.glb",
    "previewUrl": "https://provider.example/signed-preview.png",
    "error": null
  }
}
```

The normalized `status` is one of `queued`, `processing`, `succeeded`, `failed`,
or `canceled`. Poll until a terminal status is returned. A successful task is
only considered usable when `modelUrl` contains a GLB URL. Local task IDs are
namespaced as `local:<base64url(sidecar-id)>`, so the upstream ID is preserved
byte-for-byte and polling remains routed to the provider that created the task
even if the default provider setting later changes.

Error responses use this shape:

```json
{
  "success": false,
  "error": "MESHY_API_KEY 未配置，无法生成真实 3D 模型",
  "code": "MESHY_NOT_CONFIGURED",
  "provider": "meshy",
  "category": "not_configured",
  "retryable": false
}
```

Depending on the failure, the endpoint may return `400`, `402`, `404`, `502`,
`503`, or `504`.

### Local sidecar v1 contract

Set `THREE_D_PROVIDER=local`. The configured sidecar must implement:

- `GET {LOCAL_3D_BASE_URL}/v1/capabilities`
- `POST {LOCAL_3D_BASE_URL}/v1/image-to-3d`
- `GET {LOCAL_3D_BASE_URL}/v1/image-to-3d/:id`

The capabilities response must report API version `1`, `ready: true`, GLB and
PBR, plus either `texturing: true` for UV/image textures or
`vertexColors: true` for vertex-colored output. A configured but offline or
incompatible sidecar remains `ready: false`, so the browser cannot start a task
that is guaranteed to fail.

Both endpoints return a task object with `id`, `status`, `progress`, optional
`model_url`, and optional `preview_url`. Artifact URLs must resolve to the same
origin as `LOCAL_3D_BASE_URL`; cross-origin and non-HTTP(S) URLs are rejected.

When a local task succeeds, the public `modelUrl` is rewritten to the fixed
same-origin endpoint below instead of exposing the sidecar address:

`GET /api/generate-3d/:id/artifacts/model.glb`

The proxy re-queries the task, follows only its validated same-origin model
artifact, rejects redirects, streams with a hard byte limit, and validates the
GLB header, JSON/chunk boundaries, active scene, mesh, and non-empty POSITION
geometry before returning `model/gltf-binary`. It is not an arbitrary URL
proxy.

### Model URL lifetime

Meshy may return signed `modelUrl` and `previewUrl` values that expire. They are
suitable for immediate preview or download, but should not be stored as durable
asset URLs. In production, download the completed GLB and preview on the server,
persist them to application-owned object storage, and save the resulting stable
URLs in the creation record.

Gemini/Nano Banana is used only to generate the 2D reference artwork for this
pipeline. It does not directly return a GLB or a true 3D mesh; the selected Meshy
or local sidecar provider performs the image-to-3D conversion.

## Styles

`GET /api/styles`

Returns supported visual prompt styles.

## Creations

`GET /api/creations?limit=12`

Returns recent public saved creations from Supabase.

`GET /api/creations/:id`

Returns a single saved creation.

`POST /api/creations`

Persists a generated work.

```json
{
  "title": "苗绣 × 哆啦A梦 - 拼豆挂件",
  "craftId": "embroidery",
  "craftName": "苗绣",
  "ipId": "doraemon",
  "ipName": "哆啦A梦",
  "carrierId": "keychain",
  "carrierName": "拼豆挂件",
  "styleId": "chinese",
  "styleName": "国潮明亮",
  "prompt": "...",
  "imageUrl": "data:image/png;base64,...",
  "pattern": [],
  "materials": [],
  "stats": {},
  "story": "...",
  "isPublic": true
}
```

`imageUrl` accepts either a base64 data URL or a plain URL. Base64 images are
uploaded to the Supabase Storage bucket `heritage-creations` (see
`supabase/migrations/202607170001_create_creations_storage.sql`) and the
stored `image_url` becomes the bucket's public URL; if the upload fails the
base64 string is stored as-is (legacy behavior).

If Supabase is not configured, this endpoint returns:

```json
{
  "success": false,
  "error": {
    "code": "SUPABASE_NOT_CONFIGURED",
    "message": "Supabase 未配置，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
  }
}
```

## Environment

Required for AI:

```bash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-image
```

Choose one server-side image-to-3D provider:

```bash
THREE_D_PROVIDER=meshy
```

Meshy configuration:

```bash
MESHY_API_KEY=
```

Optional Meshy settings:

```bash
MESHY_API_BASE_URL=https://api.meshy.ai/openapi/v1
MESHY_TIMEOUT_MS=30000
```

`MESHY_API_KEY` must remain server-side. Do not expose it through Vite variables,
frontend code, logs, screenshots, or committed configuration files.

Local sidecar configuration:

```bash
THREE_D_PROVIDER=local
LOCAL_3D_BASE_URL=http://127.0.0.1:7861
LOCAL_3D_API_KEY=
LOCAL_3D_TIMEOUT_MS=30000
LOCAL_3D_ALLOWED_HOSTS=127.0.0.1,localhost,::1,[::1]
LOCAL_3D_MAX_IMAGE_BYTES=10485760
LOCAL_3D_MAX_MODEL_BYTES=104857600
```

The sidecar host must be in `LOCAL_3D_ALLOWED_HOSTS`. Keep the default loopback
allowlist for local SF3D deployments; add a private deployment hostname only as
an explicit operator decision. Bind the sidecar to loopback and use
`LOCAL_3D_API_KEY` when it supports bearer authentication.

### Bundled local TripoSR sidecar

The repository includes a Windows-oriented TripoSR adapter under `sidecar/`.
It uses the official MIT-licensed TripoSR weights to reconstruct an actual
triangle mesh, then exports a plain embedded GLB with vertex colors, normals,
metallic-roughness material factors, 18 cm height, Y-up coordinates, and a
bottom origin. The initial orientation follows the official TripoSR viewer so
the reference-image front faces the Three.js camera. It does not return a 2D
billboard, Gaussian splat, or pretend that vertex color is a UV texture map.

Install the isolated CUDA runtime, official repository, dependencies, and model
weights on a drive with sufficient space:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local-3d.ps1
```

Start the local engine in the background:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-3d.ps1 -Background
```

Then configure the Node API:

```dotenv
THREE_D_PROVIDER=local
LOCAL_3D_BASE_URL=http://127.0.0.1:7861
LOCAL_3D_API_KEY=<same optional local token used by the sidecar>
LOCAL_3D_TIMEOUT_MS=30000
```

The default profile is deliberately conservative for an 8 GB RTX 4060 Laptop:
one GPU worker, a two-task queue, `4096` renderer chunks, and marching-cubes
resolution `160`. Raise `TRIPOSR_MC_RESOLUTION` only after a successful real
generation with enough free VRAM.

Required for Supabase server persistence:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

Do not put service role, secret, or personal access tokens in frontend code.

## Starting the API server

Start the backend with either command below so Node inherits the standard
`HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables when outbound
access requires a proxy:

```bash
npm run server
```

or:

```bash
node --use-env-proxy server.js
```

Running `node server.js` without `--use-env-proxy` can bypass the configured
proxy and make Gemini or Meshy requests fail in proxy-dependent environments.
