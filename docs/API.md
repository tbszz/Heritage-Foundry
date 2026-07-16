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

Required for Supabase server persistence:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

Do not put service role, secret, or personal access tokens in frontend code.
