# AI Native 升级方案：从「AI 功能叠加」到「AI 原生」

日期：2026-10-22
状态：特性 1–3 已完成并双仓验证（原版仓 545 测试全绿、鸿蒙仓 605 测试全绿，两仓 Vite 构建与鸿蒙 viewer 构建通过）；特性 3 检索层已升级为知识库架构（Gemini embedding 256 维 + Supabase pgvector/本地 JSON 双存储 + RRF 混合检索，参考 supabase-community/chatgpt-your-files 与 Onyx 的混合索引模式）；特性 4–6 暂缓
范围：原版仓 `Heritage Foundry` 为主，前端改动双仓同步到 `Heritage-Foundry-HarmonyOS`

> 部署待办：在 Supabase Dashboard SQL Editor 执行 `supabase/migrations/202610220001_create_craft_embeddings.sql` 建表后，运行 `npm run knowledge:build` 将向量灌入 pgvector（在此之前运行时自动降级使用仓库内 JSON 索引）。

## 背景与诊断

当前项目的 AI 介入方式是「AI 作为被调用的工具」：

- `services/promptService.js` 用硬编码模板把「技艺 × IP × 载体 × 风格」四个下拉框拼成 prompt，所有创造性决策由用户填表单完成，AI 只执行最后一步渲染；
- `services/geminiService.js` 是一次性调用，生成即结束，没有自检、没有循环、没有多轮；
- 全项目无对话/聊天能力，无 SSE 流式（仅 3D 任务轮询）；
- 118 项非遗的 `src/data/crafts.json`（含 story、region 等丰富字段）是纯静态展示。

AI Native 的核心标准：让 AI 承担「理解意图、做决策、控制质量、讲述知识」的过程，用户只表达意图和品味。

## 特性清单（按优先级）

### 特性 1：对话式造物台（意图理解代替表单）

用户用自然语言描述需求（如「做个送表弟的生日礼物，他喜欢皮卡丘，老家苏州」），LLM 解析成结构化创作简报（技艺/IP/载体/风格/补充描述 + 推理说明），回填现有表单；支持多轮微调（「换成手机壳」→ 基于当前简报增量修改）。

- 后端：新增 `/api/creative-brief` 端点，用 `@google/genai` 文本模型 + 结构化 JSON 输出；`promptService.js` 的四个库（CRAFT / IP / CARRIER / STYLE）从「下拉框数据源」升级为「LLM 的候选描述」。
- 前端：`generator.html` / `generator.js` 增加自然语言输入区，解析结果回填表单并展示「AI 简报推理」；表单保留可手动改。
- 无状态设计：前端每次传 `message` + `currentBrief`（上一次解析结果），后端不存会话。

### 特性 2：生成自审循环（AI 对产出负责）

生图后用视觉模型对照载体约束清单自检（主体居中占比？轮廓是否适合拼豆转译？有无文字水印？），不达标带修改指令自动重试一次；「AI 审查意见」返回给前端展示。

- 后端：新增审查服务（vision 复核，复用同一 Gemini client），`generate-image` 流程可选开启 `self_check`；检查清单直接派生自 `buildCarrierOutputInstruction` 的约束文案。
- 前端：结果区展示审查结论与问题列表。
- 目标：从「AI 生成」升级为「AI 保证质量」。

### 特性 3：AI 讲解员（博物馆知识问答）

展厅/藏品页加「问讲解员」入口，LLM 基于 `crafts.json` + 地域数据回答问题（如「布老虎和黎族织锦有什么共同点」「规划一条江南主题参观路线」），回答附带数据出处。

- 后端：新增 `/api/docent` 端点；118 项数据先做关键词预筛（name/category/region/description/blurb/story）取 top-k 再进 prompt，避免全量塞入。
- 前端：藏品/技艺详情页加入问答入口与对话展示。

### 特性 4：拍照识艺（多模态输入）——本轮暂缓

上传照片 → 视觉模型识别非遗元素 → 自动填入创作简报。复用 `editImage` 的图像输入管道。情感场景最强（「把奶奶的绣样变成拼豆图纸」），待 1–3 完成后视时间实施。

### 特性 5：创作说明 LLM 化 + 流式叙事——本轮暂缓

创作说明从模板拼接升级为 LLM 叙事（技艺背景 × 设计理由 × 使用场景），并在生成等待期流式输出「AI 的创意构思」。

### 特性 6：管线 MCP 化——本轮不做

把「生图 → 自检 → 3D → 拼豆」暴露为 MCP 工具供外部 Agent 编排。投入大，前几项完成后再评估。

## 实施约束

- **双仓同步**：凡改 `src/*.html|js|css` 与 `tests/`，用 `cp` 同步到鸿蒙仓同路径，两仓分别 `npm test` + `npm run build`（鸿蒙仓另有 `build:harmony-viewer`）。
- **可降级运行**：未配置 `GEMINI_API_KEY` 时新端点返回清晰的 503 未配置状态；AI 简报/审查/讲解员失败不影响基础表单生图链路。
- **限流**：新端点全部走 `serverless-guardrails` 现有基建。
- **无新供应商**：全部复用已集成的 Gemini（文本/视觉模型同一 client）。
- 文本模型默认 `gemini-3.1-flash`（env `GEMINI_TEXT_MODEL` 可覆盖），与图像模型 `gemini-3.1-flash-image` 同族。

## 验收

- `npm test` 全绿（含新增单测：简报解析、审查循环、讲解员检索与降级路径）。
- 两仓 `npm run build` 通过。
- 未配置 key 时端点返回 503 + 明确 code，前端展示降级提示。
