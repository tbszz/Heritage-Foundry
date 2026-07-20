# Heritage Foundry

AI 非遗文创与手作方案生成平台。项目围绕“非遗技艺 + 流行 IP + 手作载体”的组合，提供创意生成、AI 图像生成、3D 载体预览、拼豆图纸、材料清单、非遗故事卡和作品保存等能力。

## 功能特性

- 非遗技艺浏览：展示苗绣、剪纸、陶瓷、木雕、唐卡等技艺内容。
- AR 体验（`ar.html`）：基于 `<model-viewer>`，安卓/鸿蒙浏览器可把文物以真实尺寸放进房间（WebXR / Scene Viewer），桌面端 3D 环绕预览。
- 创意生成工作台：选择非遗技艺、IP、载体和视觉风格，生成文创方案。
- AI 图像生成与编辑：通过 Gemini 图像接口生成或编辑方案图。
- 3D 载体预览：使用 Three.js 渲染文创载体模型。
- 拼豆图纸生成：输出可制作的像素图纸、材料清单和统计数据。
- 作品保存：支持将生成结果保存到 Supabase，并读取最近公开作品。
- 降级可用：未配置 Gemini 或 Supabase 时，服务仍可启动并返回明确错误。

## 技术栈

- 前端：Vite、多页面原生 ES modules、Three.js、CSS variables
- 后端：Node.js、Express
- AI：Google Gemini 图像生成接口
- 数据库：Supabase
- 测试：Vitest、Supertest
- 大文件：Git LFS 管理原始字体和 `.glb` 3D 模型（`assets-src/`）
- 资产管线：gltf-transform（Draco + WebP 纹理压缩）、fonttools（字体子集化）

## 快速开始

本地开发需要 **Node.js 22.21+**。该版本提供服务端访问 Gemini 时使用的系统代理支持；启动脚本会在版本不兼容时提前给出明确提示。

```bash
npm install
cp .env.example .env
npm run start
```

默认启动方式会同时运行 Vite 前端和 Express 后端。

- 前端开发服务：通常为 `http://localhost:5173`
- 后端 API 服务：默认 `http://localhost:3000`

需要单独调试某一侧时，可以分别启动：

```bash
npm run dev:web
npm run dev:api
```

## 环境变量

复制 `.env.example` 为 `.env`，再按需填写：

```bash
PORT=3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-image
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

说明：

- `GEMINI_API_KEY` 用于 AI 图像生成和编辑。
- `SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 用于服务端作品保存。
- 不要把真实 `.env`、service role key、个人 token 或其他密钥提交到仓库。

## 常用命令

```bash
npm run dev       # 同时启动 Vite 前端和 Express API
npm run dev:web   # 仅启动 Vite 前端
npm run dev:api   # 仅启动 Express API
npm run server    # dev:api 的兼容别名
npm run start     # dev 的兼容别名
npm test          # 运行测试
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

资产管线（源资产变更后重新运行）：

```bash
node scripts/compress-models.mjs    # assets-src/models/ → public/models/（Draco+WebP，420MB→14MB）
python3 scripts/subset_fonts.py     # assets-src/fonts/ → public/fonts/*.woff2（71MB→1.8MB，需 pip install fonttools brotli）
```

## 项目结构

```text
.
├── assets-src/           # 原始资产（完整字体/原始模型/原图，Git LFS）
├── docs/                 # API 文档和项目计划
├── middleware/           # Express 中间件（含限流）
├── public/
│   ├── assets/           # 生成图标与视觉资源（大图已转 WebP）
│   ├── draco/            # Draco 解码器（自托管，离线可用）
│   ├── fonts/            # 子集化 woff2 字体（脚本生成）
│   ├── models/           # 压缩后 3D 模型（脚本生成）
│   └── vendor/           # model-viewer 自包含 bundle
├── routes/               # API 路由
├── scripts/              # 模型压缩与字体子集化脚本
├── services/             # Gemini、Prompt、Supabase 服务
├── src/
│   ├── components/       # Three.js 场景组件
│   ├── data/crafts.json  # ★ 非遗数据唯一数据源（前后端共享）
│   ├── utils/            # 数据、颜色、图纸与 API 工具
│   ├── index.html        # 首页
│   ├── crafts.html       # 非遗技艺页
│   ├── generator.html    # 创意生成工作台
│   └── ar.html           # AR 体验页
├── supabase/migrations/  # 数据库迁移
├── tests/                # 自动化测试
├── server.js             # Express 入口
└── vite.config.js        # Vite 配置
```

## API 概览

API 基础路径为 `/api`。详细说明见 `docs/API.md`。

- `GET /api/health`：健康检查
- `POST /api/generate-image`：AI 图像生成
- `POST /api/edit-image`：AI 图像编辑
- `GET /api/styles`：支持的视觉风格
- `GET /api/creations`：读取最近公开作品
- `GET /api/creations/:id`：读取单个作品
- `POST /api/creations`：保存生成作品

## Supabase 配置

项目提供数据库迁移文件：

```text
supabase/migrations/202607050001_create_heritage_foundry.sql
supabase/migrations/202607170001_create_creations_storage.sql
```

在 Supabase 项目中应用该迁移后，配置 `.env` 中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 即可启用作品保存与最近作品读取。

## Git LFS

仓库中的字体和 3D 模型文件较大，已通过 Git LFS 管理。首次克隆后如资源缺失，可执行：

```bash
git lfs install
git lfs pull
```

LFS 跟踪范围：

- `public/models/*.glb`（压缩产物）
- `assets-src/models/*.glb`（原始模型）
- `assets-src/fonts/*.ttf` / `*.otf`（完整字体）

## 部署

- 单进程部署：`npm run build` 后 `node server.js`，Express 会自动托管 `dist/` 并提供 API。
- Docker：`docker build -t heritage-foundry . && docker run -p 3000:3000 --env-file .env heritage-foundry`
- 环境变量 `ALLOWED_ORIGINS`（CORS 白名单）与 `GENERATE_RATE_MAX`（生图限流）见 `.env.example`。
- CI：GitHub Actions 在 push/PR 时自动运行测试与构建（`.github/workflows/ci.yml`）。

## 验证

当前项目可用以下命令做基础验证：

```bash
npm test
npm run build
```

## 许可证

MIT，见 [LICENSE](LICENSE)。3D 模型资产的使用限制见 LICENSE 附注。
