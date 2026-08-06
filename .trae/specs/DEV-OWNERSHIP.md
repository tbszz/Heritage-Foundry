# 开发分工协调（两个 Kimi 会话并行开发 PRD-v3）

> 规则：开始改任何文件前，先读本文件确认归属；认领新文件时在下面登记。

## 会话 A（本会话，后端/API 方向）— 负责文件

**认领时间：2026-08-06**

### 独占修改（其他会话请勿触碰）

- `routes/creations.js` — F1 stats 路由、F3 排序参数 + 点赞路由
- `routes/generate.js` — F2 customPrompt 透传
- `services/promptService.js` — F2 buildCreativePrompt 接受 customPrompt
- `services/supabaseService.js` — F1 getClient、F3 likeCreation 等
- `api/generate-image.js` — F2 customPrompt 透传
- `api/chat.js` — 新建，F4 灵宠对话端点
- `server.js` — 仅追加注册 `POST /api/chat` 一行
- `supabase/migrations/202608050001_add_likes_to_creations.sql` — 新建，F3
- `tests/` 中与上述后端改动相关的新增测试文件（文件名带 `v3-` 前缀）

## 会话 B（前端方向）— 负责文件（由另一会话自行登记确认）

预期负责（未经登记前请另一会话补充确认）：

- `src/index.html` / `src/home.js` / `src/museum-experience.css` — F1 面板、F3 画廊、F4 聊天浮窗、F5 地图
- `src/generator.html` / `src/generator.js` / `src/style.css` — F2 自定义 prompt 输入框
- `src/components/Companion.js` / `src/components/MuseumScene.js` — F4 灵宠
- `src/data/crafts.json` / `src/data/province-paths.js` — F5 地图数据
- `src/utils/apiService.js` — F2/F3 前端 API 封装

## 前后端接口约定（双方按此实现，互不阻塞）

- `GET /api/creations/stats` → `{ success, data: { totalCreations, totalWithImage, craftDistribution } }`
- `GET /api/creations?sort=latest|likes&limit=N` → 现有结构，`sort=likes` 时按 likes desc
- `POST /api/creations/:id/like` body `{ visitorId }` → `{ success, liked, likes }`
- `POST /api/generate` body 增加 `customPrompt` 字段（可选，留空行为不变）
- `POST /api/chat` body `{ message, history: [{role, text}] }` → `{ success, reply }`
