# 遗见 Heritage Foundry — 复赛功能增补 PRD

---

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 产品名称 | 遗见 Heritage Foundry |
| 文档版本 | V3.0（复赛增补） |
| 创建日期 | 2026年8月5日 |
| 赛道 | 生活娱乐 / 社会公益 |
| 提交截止 | 2026年8月9日 23:59 |
| 文档状态 | 待确认 |

---

## 一、增补背景

### 1.1 现有产品基线

项目已完成初赛提交，现有功能包括：

- **首页**（[index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html)）：3D 手绘长廊 + 4 座主题展厅入口 + 活态 3D 展厅（model-viewer）+ 18 件馆藏轮播 + AI 共创引导
- **技艺图鉴**（[crafts.html](file:///e:/赛题5/Heritage%20Foundry/src/crafts.html)）：18 项非遗技艺卡片网格 + 详情弹窗 + AI 知识问答（Gemini 文字生成）
- **AI 共创工坊**（[generator.html](file:///e:/赛题5/Heritage%20Foundry/src/generator.html)）：4 因子下拉选择（非遗技艺 × IP × 载体 × 风格）→ Gemini 生图 → 3D 载体预览 → TripoSR 转 GLB → 拼豆图纸 + 材料清单
- **AR 体验**（[ar.html](file:///e:/赛题5/Heritage%20Foundry/src/ar.html)）：model-viewer + 多技艺切换 + WebXR
- **后端**（[server.js](file:///e:/赛题5/Heritage%20Foundry/server.js)）：Express + Gemini 生图/编辑/文字 + Supabase 作品存储 + TripoSR 侧车
- **3D 博物馆**（[MuseumScene.js](file:///e:/赛题5/Heritage%20Foundry/src/components/MuseumScene.js)）：第一人称 WASD 行走 + 18 个展台 + GLB 模型 + 牌匾动画

### 1.2 复赛评审维度

| 维度 | 权重 | 本增补覆盖 |
| --- | --- | --- |
| 产品完成度 | 20% | 功能 1（实时数据面板）、功能 3（共创画廊） |
| 社会价值 | 20% | 功能 1（馆藏规模可视化）、功能 3（社区参与）、功能 5（地域分布） |
| 技术实现 | 20% | 功能 4（3D 灵宠 + AI 对话）、功能 3（瀑布流 + 点赞） |
| 实用性 | 20% | 功能 2（自定义 prompt）、功能 3（作品浏览 + 点赞） |
| 创新性 | 20% | 功能 4（手绘灵宠导览员）、功能 5（非遗地图）、功能 2（开放创作） |

### 1.3 增补功能清单

| 编号 | 功能名称 | 优先级 | 预估工时 |
| --- | --- | --- | --- |
| F1 | 非遗数据统计面板 | P0 | 0.5 天 |
| F2 | 自定义 Prompt 开放输入 | P0 | 2 小时 |
| F3 | 共创画廊 + 点赞 | P0 | 1 天 |
| F4 | 手绘风格小灵宠（AI 导览员） | P1 | 1 天 |
| F5 | 非遗地域分布地图 | P1 | 0.5 天 |

---

## 二、F1 — 非遗数据统计面板

### 2.1 功能概述

在首页 hero 区下方新增一个动态数据面板，实时展示馆藏规模、用户共创数据和技术能力统计，替代当前硬编码的 `18 项数字馆藏 / 4 座主题展厅 / 1 个共创工坊` 静态文本。

### 2.2 数据来源

| 数据指标 | 数据源 | 获取方式 |
| --- | --- | --- |
| 非遗技艺总数 | [crafts.json](file:///e:/赛题5/Heritage%20Foundry/src/data/crafts.json) | 前端 `import craftsData; craftsData.length` |
| 主题展厅数 | 常量 | 硬编码 `4` |
| 3D 馆藏模型数 | crafts.json | `craftsData.filter(c => c.modelUrl).length` |
| 用户共创作品总数 | Supabase `heritage_creations` 表 | `GET /api/creations/stats` |
| 已生成 3D 模型数 | Supabase（`image_url IS NOT NULL` 的公开作品数） | 同上接口返回 |
| 按技艺分类的作品分布 | Supabase | 同上接口返回 `craftDistribution` |
| 今日访客数（可选） | 后端内存计数 + localStorage | `GET /api/health` 返回 `visitors.today` |

### 2.3 后端改动

#### 新增 `GET /api/creations/stats`

**文件**：[routes/creations.js](file:///e:/赛题5/Heritage%20Foundry/routes/creations.js)

**新增路由**：

```javascript
router.get('/stats', async (req, res, next) => {
  try {
    const client = supabaseService.getClient();
    if (!client) {
      return res.json({
        success: true,
        data: { totalCreations: 0, totalWithImage: 0, craftDistribution: {} }
      });
    }
    const { count: totalCreations } = await client
      .from('heritage_creations')
      .eq('is_public', true)
      .count('*', { count: 'exact' });

    const { count: totalWithImage } = await client
      .from('heritage_creations')
      .eq('is_public', true)
      .not('image_url', 'is', null)
      .count('*', { count: 'exact' });

    // 按技艺分组计数
    const { data: distribution } = await client
      .from('heritage_creations')
      .select('craft_name')
      .eq('is_public', true);

    const craftDistribution = {};
    (distribution || []).forEach(row => {
      const key = row.craft_name || '未分类';
      craftDistribution[key] = (craftDistribution[key] || 0) + 1;
    });

    res.json({
      success: true,
      data: { totalCreations, totalWithImage, craftDistribution }
    });
  } catch (error) {
    next(error);
  }
});
```

**Supabase 服务层**：[supabaseService.js](file:///e:/赛题5/Heritage%20Foundry/services/supabaseService.js) 需导出 `getClient` 函数（当前未导出）。

### 2.4 前端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html) | 将 `.museum-stage-index` 区域替换为结构化数据面板 |
| [home.js](file:///e:/赛题5/Heritage%20Foundry/src/home.js) | 新增 `loadStats()` 函数，调 `GET /api/creations/stats` |
| [museum-experience.css](file:///e:/赛题5/Heritage%20Foundry/src/museum-experience.css) | 新增 `.stats-panel` 系列样式 |

#### UI 设计

```
┌─────────────────────────────────────────────────────┐
│                  馆藏数据                            │
│                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐    │
│  │   18   │  │   15   │  │   42   │  │   7    │    │
│  │ 非遗技艺│  │ 3D馆藏 │  │ 共创作品│  │ 3D模型 │    │
│  └────────┘  └────────┘  └────────┘  └────────┘    │
│                                                     │
│  按技艺分类的作品分布                                 │
│  剪纸  ████████░░░░  8                              │
│  苗绣  ██████░░░░░░  6                              │
│  陶瓷  ████░░░░░░░░  4                              │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

- 数字使用 `CountUp` 动画（从 0 滚动到目标值，1.5s ease-out）
- 分布柱状图用纯 SVG 绘制，不引第三方图表库
- Supabase 未配置时：共创作品数显示 `—`，柱状图区域隐藏，非遗技艺数和 3D 馆藏数仍从本地 JSON 读取并显示

#### 降级策略

```
Supabase 配置且可达 → 完整数据面板（4 个数字 + 柱状图）
Supabase 未配置      → 仅本地数据（非遗技艺数 + 3D 馆藏数 + 硬编码展厅数）
请求失败             → 同上，控制台 warn
```

### 2.5 验收标准

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| AC-F1-01 | 非遗技艺数 | 从 crafts.json 动态读取，不硬编码 |
| AC-F1-02 | 共创作品数 | 从 Supabase 实时获取，页面刷新即更新 |
| AC-F1-03 | 数字动画 | 数字从 0 滚动到目标值，流畅无卡顿 |
| AC-F1-04 | 柱状图 | 按技艺分类的作品数量以水平柱状图展示 |
| AC-F1-05 | 降级 | Supabase 未配置时，本地数据仍正常显示，不报错 |

---

## 三、F2 — 自定义 Prompt 开放输入

### 3.1 功能概述

在 AI 共创工坊的灵感参数面板中新增一个自由文本输入框，用户可以输入任意描述性提示词，该内容会直接拼接到系统生成的 prompt 尾部，与四因子选择的 prompt 叠加，实现完全开放的创作自由度。

### 3.2 前端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [generator.html](file:///e:/赛题5/Heritage%20Foundry/src/generator.html) | 在 `.control-panel` 的风格选择 `select` 之后、`.button-group` 之前新增自定义 prompt 输入区 |
| [generator.js](file:///e:/赛题5/Heritage%20Foundry/src/generator.js) | 读取 textarea 值，通过 `apiService.js` 传给后端 |
| [style.css](file:///e:/赛题5/Heritage%20Foundry/src/style.css) | 新增 `.custom-prompt-group` 样式 |

#### HTML 结构

在 `generator.html` 第 90 行（风格 `select` 的 `</div>` 之后）插入：

```html
<div class="control-group custom-prompt-group">
  <label for="custom-prompt">自定义描述 <small>（可选）</small></label>
  <textarea
    id="custom-prompt"
    rows="3"
    maxlength="500"
    placeholder="输入你的创意描述，例如：角色穿着汉服站在元宵节灯会中、背景加上敦煌飞天纹样、整体色调偏暖金色……"
  ></textarea>
  <small class="custom-prompt-hint">留空则仅使用上方四因子组合生成</small>
</div>
```

#### 前端逻辑（generator.js）

在调用 `generateImage` 时，从 textarea 读取用户输入：

```javascript
const customPrompt = document.getElementById('custom-prompt')?.value?.trim() || '';
// 传给 apiService.generateImage
const result = await generateImage({ craft, ip, carrier, style, customPrompt });
```

#### apiService.js 改动

[apiService.js](file:///e:/赛题5/Heritage%20Foundry/src/utils/apiService.js) 的 `generateImage` 函数需要将 `customPrompt` 透传给后端：

```javascript
async function generateImage({ craft, ip, carrier, style, customPrompt }) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ craft, ip, carrier, style, customPrompt })
  });
  return response.json();
}
```

### 3.3 后端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [routes/generate.js](file:///e:/赛题5/Heritage%20Foundry/routes/generate.js) | 从 `req.body` 读取 `customPrompt`，传给 promptService |
| [services/promptService.js](file:///e:/赛题5/Heritage%20Foundry/services/promptService.js) | `buildCreativePrompt` 接受 `customPrompt` 参数，拼到 prompt 尾部 |
| [api/generate-image.js](file:///e:/赛题5/Heritage%20Foundry/api/generate-image.js) | 透传 `customPrompt` |

#### promptService.js 改动

在 `buildCreativePrompt` 函数签名新增 `customPrompt` 参数：

```javascript
function buildCreativePrompt({ basePrompt = '', style = 'default', craftType, ip, carrier, customPrompt = '' } = {}) {
  // ... 现有逻辑不变 ...

  const promptLines = [
    '你是一位脑洞大开的国潮非遗视觉导演，创作一张非常吸引注意力的非遗 × 流行 IP 跨界主视觉。',
    `核心任务：${task}。`,
    `跨界组合：${craft.name}非遗语言 + ${ipItem.name}流行 IP 角色特征 + ${carrierItem.name}。`,
    `非遗视觉：${craft.language}，${craft.twist || '传统技艺以超现实方式重组'}。`,
    `IP特征：保留${ipItem.name}的可识别神态与轮廓关键词：${ipItem.traits}，避免官方 logo 和文字商标。`,
    `产品方向：${carrierItem.constraint}，${styleText}。`,
    carrierOutputInstruction,
    `画面要求：${carrierItem.aspectInstruction || '1:1 方形画幅'}，干净背景、纯色背景，无文字，无水印，无 UI mockup，高清产品级渲染，动态感强，奇思妙想但形体明确。`
  ];

  // 用户自定义描述直接拼到尾部，不加任何约束
  if (customPrompt.trim()) {
    promptLines.push(`用户补充描述：${customPrompt.trim()}`);
  }

  return promptLines.join('\n');
}
```

### 3.4 交互设计

- textarea 有 500 字符上限，下方显示剩余字数
- 留空时行为与现有完全一致（仅四因子 prompt）
- 填写时，用户描述会作为 prompt 的最后一段拼入
- 不做任何内容过滤或关键词约束——完全开放

### 3.5 验收标准

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| AC-F2-01 | textarea 渲染 | 在灵感参数面板中风格选择下方显示，带 placeholder 和字数提示 |
| AC-F2-02 | 留空生成 | textarea 为空时，生成行为与现有完全一致 |
| AC-F2-03 | 填写生成 | textarea 有内容时，生成的图像体现用户描述的方向 |
| AC-F2-04 | 字数限制 | 超过 500 字时无法继续输入 |
| AC-F2-05 | 保存作品 | 作品保存时，`customPrompt` 内容记录在 `prompt` 字段中 |

---

## 四、F3 — 共创画廊 + 点赞

### 4.1 功能概述

在首页「活态展厅」与「数字馆藏」之间新增一个「共创画廊」板块，以瀑布流布局展示所有用户公开的 AI 文创作品，支持点赞和"以此为基础再创作"。

### 4.2 数据库改动

#### Supabase Migration

**新增文件**：`supabase/migrations/202608050001_add_likes_to_creations.sql`

```sql
-- 给 heritage_creations 表新增 likes 字段
alter table public.heritage_creations
  add column if not exists likes integer not null default 0;

-- 新增 likes 索引（按点赞数排序查询时使用）
create index if not exists heritage_creations_likes_idx
  on public.heritage_creations (likes desc);

-- 点赞表：记录每次点赞（防重复点赞用）
create table if not exists public.creation_likes (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.heritage_creations(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  unique(creation_id, visitor_id)
);

create index if not exists creation_likes_creation_idx
  on public.creation_likes (creation_id);
```

### 4.3 后端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [routes/creations.js](file:///e:/赛题5/Heritage%20Foundry/routes/creations.js) | 新增 `GET /` 排序参数（`sort=likes|latest`）、`POST /:id/like` |
| [services/supabaseService.js](file:///e:/赛题5/Heritage%20Foundry/services/supabaseService.js) | 新增 `listCreationsByLikes`、`likeCreation`、`getVisitorId` |

#### 新增 API

**1. 获取作品列表（支持排序）**

```
GET /api/creations?sort=likes&limit=24
```

- `sort=latest`（默认）：按 `created_at desc`（现有逻辑不变）
- `sort=likes`：按 `likes desc, created_at desc`

**2. 点赞**

```
POST /api/creations/:id/like
Body: { visitorId: "xxx" }
```

逻辑：
1. 查 `creation_likes` 表是否已存在 `(creation_id, visitor_id)` 记录
2. 已存在 → 返回 `{ success: true, liked: false, message: '已点赞过' }`
3. 不存在 → insert + `heritage_creations.likes += 1` → 返回 `{ success: true, liked: true, likes: newCount }`

**visitorId 生成**：前端首次访问时 `localStorage.setItem('visitorId', crypto.randomUUID())`，后续请求带上。

### 4.4 前端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html) | 在 `#live-gallery` 和 `#collection` 之间插入 `<section id="community-gallery">` |
| [home.js](file:///e:/赛题5/Heritage%20Foundry/src/home.js) | 新增 `loadCommunityGallery()` 函数 |
| [museum-experience.css](file:///e:/赛题5/Heritage%20Foundry/src/museum-experience.css) | 新增瀑布流 + 卡片样式 |
| [apiService.js](file:///e:/赛题5/Heritage%20Foundry/src/utils/apiService.js) | 新增 `listCreations(sort, limit)`、`likeCreation(id, visitorId)` |

#### HTML 结构

插入到 `index.html` 第 106 行 `</section>`（`#live-gallery` 结束）之后：

```html
<section id="community-gallery" class="community-gallery" aria-labelledby="community-title">
  <div class="community-heading reveal">
    <p>共创画廊</p>
    <h2 id="community-title">人人都是非遗共创者。</h2>
    <span>看看大家用 AI 创作的非遗文创作品，为你喜欢的点赞。</span>
    <div class="community-tabs" role="tablist">
      <button class="community-tab active" data-sort="latest" role="tab">最新</button>
      <button class="community-tab" data-sort="likes" role="tab">最热</button>
    </div>
  </div>
  <div id="community-grid" class="community-grid" aria-live="polite"></div>
  <div id="community-empty" class="community-empty" hidden>
    <p>还没有共创作品，去 <a href="generator.html">AI 共创工坊</a> 创建第一件吧！</p>
  </div>
</section>
```

#### 瀑布流卡片结构

每个作品卡片（JS 动态生成）：

```html
<article class="community-card" data-id="xxx">
  <div class="community-card-image">
    <img src="作品图URL" alt="作品名称" loading="lazy">
  </div>
  <div class="community-card-body">
    <strong>作品名称</strong>
    <span class="community-card-tags">
      <span class="tag">剪纸</span>
      <span class="tag">哆啦A梦</span>
    </span>
    <button class="like-btn" data-id="xxx">
      <svg>♥</svg>
      <span class="like-count">12</span>
    </button>
  </div>
</article>
```

#### 交互逻辑

1. 页面加载时调 `GET /api/creations?sort=latest&limit=24`
2. 点击「最热」tab → `GET /api/creations?sort=likes&limit=24`
3. 点击 ♥ 按钮 → `POST /api/creations/:id/like`，成功后 ♥ 变红、数字 +1
4. 点击卡片图片 → 弹出大图 modal（复用现有 dialog 模式）
5. Modal 内有「以此为基础再创作」按钮 → 跳转 `generator.html?craft=xxx&ip=xxx&carrier=xxx&style=xxx`

#### 瀑布流实现

使用 CSS `column-count` 实现纯 CSS 瀑布流（不引 Masonry.js）：

```css
.community-grid {
  column-count: 4;
  column-gap: 16px;
}
.community-card {
  break-inside: avoid;
  margin-bottom: 16px;
}
@media (max-width: 900px) { .community-grid { column-count: 2; } }
@media (max-width: 500px) { .community-grid { column-count: 1; } }
```

### 4.5 降级策略

```
Supabase 配置且可达 → 完整画廊（瀑布流 + 点赞 + 排序）
Supabase 未配置      → 显示空状态提示："还没有共创作品，去 AI 共创工坊创建第一件吧！"
请求失败             → 显示错误提示 + 重试按钮
```

### 4.6 验收标准

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| AC-F3-01 | 画廊渲染 | 瀑布流展示所有公开作品，含图片、名称、标签 |
| AC-F3-02 | 排序切换 | 点击「最新」/「最热」tab 正确切换排序 |
| AC-F3-03 | 点赞 | 点击 ♥ 后数字 +1，♥ 变红，不可重复点赞 |
| AC-F3-04 | 点赞持久 | 同一 visitorId 不可对同一作品点赞两次 |
| AC-F3-05 | 空状态 | 无作品时显示引导文案和跳转链接 |
| AC-F3-06 | 响应式 | 桌面 4 列、平板 2 列、手机 1 列 |
| AC-F3-07 | 降级 | Supabase 未配置时不报错，显示空状态 |

---

## 五、F4 — 手绘风格小灵宠（AI 非遗导览员）

### 5.1 功能概述

在 3D 博物馆场景中引入一只手绘风格的小天犬灵宠，具备以下能力：
- **跟随移动**：在玩家前方跳跃式跟随，带残影效果
- **AI 对话**：点击灵宠或按快捷键打开聊天框，可与 Gemini 对话提问非遗知识
- **场景引导**：根据玩家当前位置给出上下文提示（靠近展台时提示"按 E 查看详情"）

### 5.2 视觉设计

#### 灵宠外观

- **风格**：手绘线稿风格（与未来 3D 手绘博物馆改造方向一致）
- **形态**：小天犬，约 0.6 米高（3D 场景中），圆润可爱
- **材质**：使用 `MeshToonMaterial` 或手绘贴图 + 边缘光（RimLight）模拟手绘感
- **颜色**：主色鎏金黄 `#c99a2e`，辅色墨水黑 `#1f2328`，与项目色板一致

#### 残影效果

- 灵宠每跳跃一次，在跳跃起点留下一个半透明残影
- 残影是灵宠 mesh 的克隆体，材质 `opacity: 0.3 → 0`，`0.5s` 内淡出后移除
- 最多同时存在 3 个残影，超出时移除最早的

#### 跳跃动画

- 灵宠不是平滑移动，而是"跳跃式"跟随：每隔 1.5s 跳跃一次
- 跳跃轨迹：抛物线（y 方向 `sin(πt)` 插值），水平方向线性插值到目标点
- 目标点：玩家前方 2.5 米处，偏移一点随机量避免完全直线
- 跳跃过程中灵宠有轻微旋转（面向移动方向）

### 5.3 技术实现

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [MuseumScene.js](file:///e:/赛题5/Heritage%20Foundry/src/components/MuseumScene.js) | 新增 `Companion` 子类，在 `init` 中实例化 |
| 新建 `src/components/Companion.js` | 灵宠逻辑（模型加载、跳跃动画、残影、对话触发） |
| 新建 `api/chat.js` | Gemini 文字对话 API 端点 |
| [MuseumScene.js](file:///e:/赛题5/Heritage%20Foundry/src/components/MuseumScene.js) | `animate()` 中调用 `companion.update(delta)` |
| [index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html) | 新增聊天浮窗 DOM 结构 |
| [museum-experience.css](file:///e:/赛题5/Heritage%20Foundry/src/museum-experience.css) | 新增 `.companion-chat` 聊天浮窗样式 |

#### 灵宠模型

灵宠使用程序化几何体构建（不依赖外部 GLB 文件，确保零加载延迟）：

```javascript
// Companion.js 核心结构
export class Companion {
  constructor(scene) {
    this.scene = scene;
    this.mesh = this.buildHandDrawnDog();
    this.trails = [];        // 残影池
    this.jumpTimer = 0;      // 跳跃计时
    this.jumpProgress = 1;   // 当前跳跃进度 0→1
    this.jumpStart = new THREE.Vector3();
    this.jumpEnd = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.isOpen = false;     // 聊天框是否打开
  }

  buildHandDrawnDog() {
    const group = new THREE.Group();
    // 身体：椭球体
    const bodyGeo = new THREE.SphereGeometry(0.25, 16, 12);
    bodyGeo.scale(1.2, 0.9, 1.0);
    const bodyMat = new THREE.MeshToonMaterial({ color: 0xc99a2e });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // 头：球体
    const headGeo = new THREE.SphereGeometry(0.18, 16, 12);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.2, 0.2);
    group.add(head);

    // 耳朵：两个小三角锥
    const earGeo = new THREE.ConeGeometry(0.06, 0.15, 4);
    const earMat = new THREE.MeshToonMaterial({ color: 0x1f2328 });
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.1, 0.35, 0.18);
    const earR = earL.clone();
    earR.position.x = 0.1;
    group.add(earL, earR);

    // 眼睛：两个小黑点
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1f2328 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.06, 0.22, 0.36);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.06;
    group.add(eyeL, eyeR);

    // 尾巴：小圆柱
    const tailGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.2, 6);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, 0.1, -0.28);
    tail.rotation.x = -0.6;
    group.add(tail);

    // 边缘光（手绘轮廓感）
    const rimLight = new THREE.PointLight(0xf8e5b8, 0.6, 2);
    rimLight.position.set(0, 0.3, 0);
    group.add(rimLight);

    group.position.set(0, 0.3, 5);
    return group;
  }

  update(delta, playerPosition, playerForward) {
    this.jumpTimer += delta;
    // 计算目标点：玩家前方 2.5m
    this.targetPos.copy(playerPosition).addScaledVector(playerForward, 2.5);
    this.targetPos.y = 0.3;
    // 加随机偏移
    this.targetPos.x += (Math.random() - 0.5) * 0.5;

    // 每 1.5s 发起一次跳跃
    if (this.jumpProgress >= 1 && this.jumpTimer >= 1.5) {
      this.jumpTimer = 0;
      this.jumpProgress = 0;
      this.jumpStart.copy(this.mesh.position);
      this.jumpEnd.copy(this.targetPos);
      this.spawnTrail(); // 在起点留残影
    }

    // 跳跃插值
    if (this.jumpProgress < 1) {
      this.jumpProgress = Math.min(this.jumpProgress + delta * 1.2, 1);
      const t = this.jumpProgress;
      // 水平：线性
      this.mesh.position.lerpVectors(this.jumpStart, this.jumpEnd, t);
      // 垂直：抛物线 sin(πt) * height
      const jumpHeight = 0.6;
      this.mesh.position.y = 0.3 + Math.sin(Math.PI * t) * jumpHeight;
      // 面向移动方向
      const dir = new THREE.Vector3().subVectors(this.jumpEnd, this.jumpStart);
      if (dir.lengthSq() > 0.001) {
        this.mesh.lookAt(this.mesh.position.x + dir.x, this.mesh.position.y, this.mesh.position.z + dir.z);
      }
    }

    // 更新残影
    this.updateTrails(delta);
  }

  spawnTrail() {
    const trail = this.mesh.clone();
    trail.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.3;
      }
    });
    this.trails.push({ mesh: trail, life: 0.5 });
    this.scene.add(trail);
    // 最多 3 个残影
    while (this.trails.length > 3) {
      const old = this.trails.shift();
      this.scene.remove(old.mesh);
    }
  }

  updateTrails(delta) {
    this.trails.forEach(t => {
      t.life -= delta;
      t.mesh.traverse(child => {
        if (child.isMesh && child.material.transparent) {
          child.material.opacity = Math.max(0, t.life / 0.5 * 0.3);
        }
      });
    });
    this.trails = this.trails.filter(t => {
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        return false;
      }
      return true;
    });
  }
}
```

#### AI 对话 API

**新建文件**：`api/chat.js`

```javascript
const { GoogleGenAI } = require('@google/genai');

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 15000;

// 系统提示词：限定灵宠人设
const SYSTEM_PROMPT = `你是"小天犬"，一只住在非遗数字博物馆里的灵宠导览员。
你的性格：活泼、热情、对中国非遗文化了如指掌。
你的职责：回答用户关于非遗的问题，引导用户探索博物馆。
回答要求：
- 每次回答不超过 150 字
- 用口语化、活泼的语气
- 如果用户问的不是非遗相关话题，温柔地把话题引回非遗
- 可以推荐用户去某个展厅或试试 AI 共创工坊`;

async function handleChat(req, res) {
  const { message, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ success: false, error: '缺少 message' });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ success: false, error: 'AI 服务未配置' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: TIMEOUT_MS } });
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { temperature: 0.8, maxOutputTokens: 512 }
    });

    const reply = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ success: true, reply });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = handleChat;
```

**路由注册**（[server.js](file:///e:/赛题5/Heritage%20Foundry/server.js)）：

```javascript
const chatHandler = require('./api/chat');
// 在 app.use('/api/creations', creationRoutes) 之后
app.post('/api/chat', chatHandler);
```

#### 聊天浮窗 UI

在 [index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html) `</body>` 前插入：

```html
<div id="companion-chat" class="companion-chat" hidden>
  <div class="companion-chat-header">
    <span>🐕 小天犬 · 非遗导览员</span>
    <button id="companion-chat-close" type="button">×</button>
  </div>
  <div id="companion-chat-messages" class="companion-chat-messages"></div>
  <div class="companion-chat-input">
    <input id="companion-chat-input" type="text" placeholder="问问小天犬关于非遗的问题…" maxlength="200">
    <button id="companion-chat-send" type="button">发送</button>
  </div>
</div>
```

#### 触发方式

1. **点击灵宠**：在 3D 场景中 raycaster 检测点击灵宠 mesh → 打开聊天浮窗
2. **快捷键 `C`**：按 C 键切换聊天浮窗
3. **靠近展台引导**：玩家靠近展台时（距离 < 2.5），灵宠头顶弹出气泡："按 E 查看 {craft.name} 的故事"

### 5.4 上下文感知引导

灵宠会根据玩家在博物馆中的位置和状态给出不同提示：

| 玩家状态 | 灵宠气泡内容 |
| --- | --- |
| 刚进门（state: entering → explore） | "欢迎来到非遗博物馆！用 WASD 逛逛，我会在前面带路~" |
| 靠近展台（距离 < 2.5m） | "这是{craft.name}！按 E 查看详情" |
| 停留不动 > 15s | "想了解更多？按 C 跟我聊天！" |
| 聊天框已打开 | 无气泡（避免遮挡） |

### 5.5 降级策略

```
Gemini API 配置 → 完整 AI 对话
Gemini API 未配置 → 聊天框显示预设回复（从本地 FAQ 列表随机选一条）
3D 场景不可用（无 WebGL）→ 灵宠不出现，聊天浮窗仍可通过页面右下角按钮打开
```

### 5.6 验收标准

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| AC-F4-01 | 灵宠渲染 | 在 3D 博物馆中可见，手绘风格，颜色与项目一致 |
| AC-F4-02 | 跳跃跟随 | 灵宠每 1.5s 向玩家前方跳跃，轨迹为抛物线 |
| AC-F4-03 | 残影效果 | 跳跃起点留下半透明残影，0.5s 淡出 |
| AC-F4-04 | 聊天打开 | 点击灵宠或按 C 键打开聊天浮窗 |
| AC-F4-05 | AI 回复 | 输入非遗相关问题，Gemini 返回回复并显示在聊天框 |
| AC-F4-06 | 对话上下文 | 连续对话保留上下文（history 传递） |
| AC-F4-07 | 靠近提示 | 玩家靠近展台时灵宠弹出引导气泡 |
| AC-F4-08 | 性能 | 灵宠 + 残影不影响 3D 场景 FPS（> 30fps） |

---

## 六、F5 — 非遗地域分布地图

### 6.1 功能概述

在首页「数字馆藏」板块之后新增一个中国非遗地域分布地图板块，用 SVG 绘制简化版中国地图，标注 18 项非遗的地理分布，点击省份高亮该地区非遗，支持跳转对应技艺详情。

### 6.2 数据改动

#### crafts.json 新增 `region` 字段

在 [crafts.json](file:///e:/赛题5/Heritage%20Foundry/src/data/crafts.json) 的每项非遗数据中新增 `region` 字段：

| 非遗 ID | 名称 | region（省份） | regionLabel（显示用） |
| --- | --- | --- | --- |
| tiger-head | 布老虎 | shaanxi | 陕西 |
| papercut | 剪纸 | shaanxi | 陕西 |
| shadow | 皮影 | shaanxi | 陕西 |
| embroidery | 苗绣 | guizhou | 贵州 |
| tie-dye | 扎染 | yunnan | 云南 |
| porcelain | 景德镇陶瓷 | jiangxi | 江西 |
| calligraphy | 中国书法 | nationwide | 全国 |
| seal | 中国篆刻 | nationwide | 全国 |
| brocade | 南京云锦 | jiangsu | 江苏 |
| clay | 泥塑 | tianjin | 天津 |
| tea | 制茶技艺 | zhejiang | 浙江 |
| kites | 风筝 | shandong | 山东 |
| lanterns | 花灯 | nationwide | 全国 |
| wood-carving | 木雕 | zhejiang | 浙江 |
| stone-carving | 石刻 | gansu | 甘肃 |
| new-year | 木版年画 | nationwide | 全国 |
| tangka | 唐卡 | xizang | 西藏 |
| jade | 玉雕 | nationwide | 全国 |

### 6.3 前端改动

#### 涉及文件

| 文件 | 改动 |
| --- | --- |
| [crafts.json](file:///e:/赛题5/Heritage%20Foundry/src/data/crafts.json) | 每项新增 `region` 和 `regionLabel` 字段 |
| [index.html](file:///e:/赛题5/Heritage%20Foundry/src/index.html) | 在 `#collection` 后插入 `<section id="heritage-map">` |
| [home.js](file:///e:/赛题5/Heritage%20Foundry/src/home.js) | 新增 `renderHeritageMap()` 函数 |
| [museum-experience.css](file:///e:/赛题5/Heritage%20Foundry/src/museum-experience.css) | 新增 `.heritage-map` 系列样式 |
| 新建 `src/data/province-paths.js` | 简化版中国 SVG 省份路径数据 |

#### SVG 地图

使用简化版 SVG 路径（不引 ECharts / D3），只包含有非遗标注的省份 + 周边轮廓：

```javascript
// province-paths.js
export const PROVINCE_PATHS = {
  shaanxi:    { d: 'M...', label: '陕西',    x: 420, y: 280 },
  guizhou:    { d: 'M...', label: '贵州',    x: 380, y: 380 },
  yunnan:     { d: 'M...', label: '云南',    x: 330, y: 430 },
  jiangxi:    { d: 'M...', label: '江西',    x: 470, y: 360 },
  jiangsu:    { d: 'M...', label: '江苏',    x: 500, y: 270 },
  tianjin:    { d: 'M...', label: '天津',    x: 510, y: 230 },
  zhejiang:   { d: 'M...', label: '浙江',    x: 510, y: 340 },
  shandong:   { d: 'M...', label: '山东',    x: 490, y: 240 },
  gansu:      { d: 'M...', label: '甘肃',    x: 310, y: 250 },
  xizang:     { d: 'M...', label: '西藏',    x: 200, y: 380 },
  nationwide: { d: null,    label: '全国',    x: 0,   y: 0   }
};
```

> **注**：SVG 路径数据需从公开数据源获取简化版中国地图 path。推荐使用 [DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) 的省级 GeoJSON 转 SVG path。

#### HTML 结构

插入到 `index.html` 第 137 行 `</section>`（`#collection` 结束）之后：

```html
<section id="heritage-map" class="heritage-map" aria-labelledby="heritage-map-title">
  <div class="heritage-map-heading reveal">
    <p>地域分布</p>
    <h2 id="heritage-map-title">十八项非遗，散落山河之间。</h2>
    <span>点击高亮省份，查看该地区的非遗技艺。</span>
  </div>
  <div class="heritage-map-body">
    <div id="heritage-map-svg" class="heritage-map-svg-container"></div>
    <div id="heritage-map-detail" class="heritage-map-detail">
      <p class="heritage-map-hint">点击地图上的省份，查看该地区的非遗技艺</p>
    </div>
  </div>
</section>
```

#### 交互逻辑

1. 页面加载时渲染 SVG 中国地图，有非遗的省份用 `craft.color` 着色，无非遗的省份灰色
2. 有多个非遗的省份，颜色叠加为深色
3. 鼠标 hover 省份 → 显示该省份的非遗数量和名称（tooltip）
4. 点击省份 → 右侧 `#heritage-map-detail` 显示该省份所有非遗列表
5. 点击非遗名称 → 跳转 `crafts.html?craft=xxx`

#### 全国类非遗处理

`region: nationwide` 的非遗（书法、篆刻、花灯、木版年画、玉雕）不绑定到具体省份，在地图下方以独立标签栏展示：

```
全国性非遗：书法 · 篆刻 · 花灯 · 木版年画 · 玉雕
```

### 6.4 验收标准

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| AC-F5-01 | 地图渲染 | SVG 中国地图正确渲染，有非遗的省份着色 |
| AC-F5-02 | hover 提示 | 鼠标悬停省份时显示非遗数量和名称 |
| AC-F5-03 | 点击交互 | 点击省份后右侧显示该省份非遗列表 |
| AC-F5-04 | 跳转 | 点击非遗名称跳转到技艺图鉴页 |
| AC-F5-05 | 全国标签 | 全国性非遗在地图下方独立展示 |
| AC-F5-06 | 响应式 | 地图在移动端可缩放查看 |

---

## 七、技术架构总览

### 7.1 新增文件清单

| 文件路径 | 用途 |
| --- | --- |
| `supabase/migrations/202608050001_add_likes_to_creations.sql` | F3：点赞字段 + 点赞表 |
| `api/chat.js` | F4：灵宠 AI 对话端点 |
| `src/components/Companion.js` | F4：3D 灵宠逻辑 |
| `src/data/province-paths.js` | F5：SVG 省份路径数据 |

### 7.2 修改文件清单

| 文件路径 | 涉及功能 | 改动摘要 |
| --- | --- | --- |
| `src/index.html` | F1, F3, F4, F5 | 统计面板、共创画廊 section、聊天浮窗、地图 section |
| `src/home.js` | F1, F3, F5 | loadStats、loadCommunityGallery、renderHeritageMap |
| `src/generator.html` | F2 | 自定义 prompt textarea |
| `src/generator.js` | F2 | 读取 customPrompt 值 |
| `src/style.css` | F2 | 自定义 prompt 样式 |
| `src/museum-experience.css` | F1, F3, F4, F5 | 数据面板、画廊、聊天浮窗、地图样式 |
| `src/data/crafts.json` | F5 | 新增 region / regionLabel 字段 |
| `src/utils/apiService.js` | F2, F3 | generateImage 透传 customPrompt、listCreations 排序、likeCreation |
| `src/components/MuseumScene.js` | F4 | 实例化 Companion、animate 中调用 update |
| `routes/creations.js` | F1, F3 | 新增 /stats 路由、排序参数、/:id/like 路由 |
| `routes/generate.js` | F2 | 透传 customPrompt |
| `services/promptService.js` | F2 | buildCreativePrompt 接受 customPrompt |
| `services/supabaseService.js` | F1, F3 | 导出 getClient、新增 listCreationsByLikes、likeCreation |
| `api/generate-image.js` | F2 | 透传 customPrompt |
| `server.js` | F4 | 注册 /api/chat 路由 |

### 7.3 新增 API 端点清单

| 方法 | 路径 | 功能 | 涉及功能 |
| --- | --- | --- | --- |
| GET | `/api/creations/stats` | 获取共创统计（总数、3D模型数、分布） | F1 |
| GET | `/api/creations?sort=likes` | 按点赞数排序获取作品 | F3 |
| POST | `/api/creations/:id/like` | 点赞 | F3 |
| POST | `/api/chat` | 灵宠 AI 对话 | F4 |

### 7.4 数据库变更

| 变更 | 说明 |
| --- | --- |
| `heritage_creations` 新增 `likes` 字段 | integer, default 0 |
| 新增 `creation_likes` 表 | 防重复点赞，unique(creation_id, visitor_id) |

---

## 八、实施计划

### 8.1 优先级排序

| 顺序 | 功能 | 原因 |
| --- | --- | --- |
| 1 | F2 自定义 Prompt | 工作量最小（2h），立即提升 generator 页面体验 |
| 2 | F1 统计面板 | 工作量小（0.5d），首页即见，评审第一印象 |
| 3 | F3 共创画廊 + 点赞 | 工作量中等（1d），核心社交功能 |
| 4 | F5 非遗地域地图 | 工作量中等（0.5d），需要 SVG 数据准备 |
| 5 | F4 手绘灵宠 | 工作量最大（1d），3D + AI 对话 |

### 8.2 建议日程

| 日期 | 任务 |
| --- | --- |
| 8月5日（今天） | F2（2h）+ F1（0.5d） |
| 8月6日 | F3（1d） |
| 8月7日 | F5（0.5d）+ F4 开始（0.5d） |
| 8月8日 | F4 完成（0.5d）+ 整体测试 + 修 bug |
| 8月9日 | 录演示视频 + 写产品说明书 + 提交 |

---

## 九、风险与对策

| 风险 | 概率 | 对策 |
| --- | --- | --- |
| SVG 中国地图路径数据获取困难 | 中 | 降级为简化版省级色块网格（不画真实地图轮廓，用方格矩阵表示省份） |
| Gemini 文字对话延迟较高 | 中 | 前端显示"小天犬正在思考…"加载动画，设置 15s 超时 |
| Supabase 免费额度用尽 | 低 | 所有 Supabase 功能都有降级策略，不影响核心体验 |
| 灵宠残影导致 GPU 负担 | 低 | 限制最多 3 个残影，残影用低精度几何体 |
| 4 天时间不够 | 中 | F4 灵宠可降级为 2D 浮窗版（不做 3D），F5 地图可降级为列表版 |
