# Heritage Foundry

AI 非遗文创与手作方案生成平台。项目围绕“非遗技艺 + 流行 IP + 手作载体”的组合，提供创意生成、AI 图像生成、3D 载体预览、拼豆图纸、材料清单、非遗故事卡和作品保存等能力。

## 功能特性

- 非遗技艺浏览：展示苗绣、剪纸、陶瓷、木雕、唐卡等技艺内容。
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
- 大文件：Git LFS 管理字体和 `.glb` 3D 模型

## 快速开始

```bash
npm install
cp .env.example .env
npm run start
```

默认启动方式会同时运行 Vite 前端和 Express 后端。

- 前端开发服务：通常为 `http://localhost:5173`
- 后端 API 服务：默认 `http://localhost:3000`

也可以分别启动：

```bash
npm run dev
npm run server
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
npm run dev       # 启动 Vite 前端
npm run server    # 启动 Express API
npm run start     # 同时启动前端和后端
npm test          # 运行测试
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

## 项目结构

```text
.
├── docs/                 # API 文档和项目计划
├── middleware/           # Express 中间件
├── public/
│   ├── assets/           # 生成图标与视觉资源
│   ├── fonts/            # 字体文件，使用 Git LFS
│   └── models/           # 3D 模型，使用 Git LFS
├── routes/               # API 路由
├── services/             # Gemini、Prompt、Supabase 服务
├── src/
│   ├── components/       # Three.js 场景组件
│   ├── utils/            # 数据、颜色、图纸与 API 工具
│   ├── index.html        # 首页
│   ├── crafts.html       # 非遗技艺页
│   └── generator.html    # 创意生成工作台
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
```

在 Supabase 项目中应用该迁移后，配置 `.env` 中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 即可启用作品保存与最近作品读取。

## Git LFS

仓库中的字体和 3D 模型文件较大，已通过 Git LFS 管理。首次克隆后如资源缺失，可执行：

```bash
git lfs install
git lfs pull
```

LFS 跟踪范围：

- `public/models/*.glb`
- `public/fonts/*.ttf`
- `public/fonts/*.otf`

## 验证

当前项目可用以下命令做基础验证：

```bash
npm test
npm run build
```

## 许可证

当前仓库尚未声明开源许可证。如需公开复用或分发，请先补充 LICENSE 文件。
