# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-08
- Primary product surfaces: 铜织博物馆首页、沉浸式四章展厅、3D 藏品鉴赏、百工典藏、山河图志、AI 造物案台、共创画廊、AR 看展。
- Evidence reviewed: 用户参考图 `.omx/artifacts/visual-ralph/immersive-museum/reference.png`、`docs/design-previews/option-a-copper-weave-palace.png`、`public/assets/generated/museum-cinematic.webp`、`src/index.html`、`src/home.js`、`src/museum-experience.css`、`src/components/SketchCorridorScene.js`、`src/components/ArtifactStage.js`、`src/generator.html`、`src/generator.js`、`src/generator-museum.css`、`src/data/crafts.json`。

## Brand
- Personality: 宏伟、当代东方、克制、可信、活态、可共创。
- Trust signals: 铜织展馆、真实 3D 馆藏、地域档案、技艺故事、材料清单、可下载图纸与模型、真实作品画廊。
- Avoid: 紫蓝霓虹、AI 渐变、无意义粒子、古风游戏感、满屏胶囊、卡片套卡片、emoji 馆藏图标、技术术语堆叠、持续漂浮和弹跳。

## Product goals
- Goals: 让用户先被一座宏大的非遗博物馆吸引，再顺畅进入四章展厅，旋转鉴赏 3D 藏品，并从馆藏自然抵达地域探索、AI 文创和共创画廊。
- Non-goals: 自由飞行游戏、虚拟宠物聊天、电商交易、专业 CAD、把所有空间都改成实时 3D。
- Success signals: 首页首帧立即可见；主导航直达地图和画廊；进馆转场连续；四章展厅和 3D 模型可操作；AI 造物不再像通用 AI 控制台；桌面与手机均可用。

## Personas and jobs
- Primary personas: 比赛评委、年轻公众、非遗爱好者、手作爱好者、校园与文旅活动组织者。
- User jobs: 快速理解项目价值；沉浸逛馆；发现一项技艺；旋转观察真实藏品；生成、制作并分享一件非遗文创。
- Key contexts of use: 1440px+ 路演与桌面深度体验；390px 手机快速浏览；展会或课堂现场演示。

## Information architecture
- Primary navigation: 云上展厅、百工典藏、山河图志、AI 造物、共创画廊。品牌返回首页；AR 进入藏品详情与次级入口。
- Core routes/screens: `index.html`（外景、进馆、地图与画廊全屏场景）、`crafts.html`（百工典藏）、`generator.html`（造物案台）、`ar.html`（AR 看展）。
- Content hierarchy: 建筑世界观 → 推门入馆 → 四章展厅 → 3D 藏品 → 技艺详情/AR/文创 → 共创分享。

## Design principles
- Principle 1: 馆是主角，字是天幕，角色是被唤醒的馆藏；首屏只保留一个主要动作。
- Principle 2: 复制参考图的尺度、遮挡和景深语法，不复制紫色配色或房地产文案。
- Principle 3: 3D 只用于有价值的空间和藏品交互；首屏静态层必须在 WebGL 之前可见。
- Principle 4: “AI”是能力而不是视觉风格；造物案台使用工艺、材料和展签语言。
- Tradeoffs: 用固定镜头轨道和有限回望换取连续、稳定、低眩晕的展厅体验；用按需加载换取首屏速度。

## Visual language
- Color: 漆夜 `#08090B`、乌木 `#171411`、绢白 `#E9E1D3`、熟朱砂 `#B44336`、古铜金 `#B58B4A`、石青 `#3D5662`。比例约 60/16/15/5/3/1。
- Typography: 思源宋体 Heavy 用于巨型标题；思源宋体 Regular 与霞鹜文楷用于叙事；系统无衬线用于导航、表单和数据。
- Spacing/layout rhythm: 桌面 12 栏、最大 1440px；首页不套卡片；大面积留给建筑和作品舞台。
- Shape/radius/elevation: 展签 2px、控件 8px、大面板 16px；胶囊仅限单一主操作或状态。
- Motion: Premium；品牌曲线 `cubic-bezier(.22, 1, .36, 1)`。反馈 120–160ms，面板 380–480ms，页面 700–950ms，进馆 1.2–1.6s。无弹跳 overshoot。
- Imagery/iconography: 铜织外景、丝绢内厅、真实 GLB、皮影与布老虎馆藏图像；金色只表现真实光与金属。
- Signature: 巨型“遗见”标题位于建筑后方，铜织建筑与迎宾馆藏切开字层。

## Components
- Existing components to reuse: `SketchCorridorScene`、`ArtifactStage`、`ThreeScene`、技艺数据、地域地图数据、共创接口。
- New/changed components: 浮动馆牌导航、铜织外景 Hero、推门入馆转场、皮影/布虎迎宾按钮、全屏地图/画廊入口、造物案台三栏布局。
- Removed components: `Companion`、小天犬聊天 DOM、灵宠触发印章及长廊跟随/点击协议。
- Variants and states: 默认、hover、focus、active、loading、disabled、error、empty、offline、reduced-motion、still/cinematic。
- Token/component ownership: 首页 token 位于 `museum-experience.css`；共享色彩和字体与 `style.css` 保持同名语义；不引入新框架或设计系统依赖。

## Accessibility
- Target standard: WCAG 2.1 AA 核心要求。
- Keyboard/focus behavior: 所有导航、角色、展厅入口、地图省份、画廊操作和 3D 弹窗可键盘操作；焦点始终可见。
- Contrast/readability: 文字不压在高噪声区域；复杂图像上使用方向性遮罩，不以低透明度替代层级。
- Screen-reader semantics: Hero 只有一个可见 H1；场景转换使用状态文本；dialog 标题与关闭行为明确。
- Reduced motion and sensory considerations: `prefers-reduced-motion` 使用 300ms 溶解，停用相机视差、角色循环和自动旋转。

## Responsive behavior
- Supported breakpoints/devices: 390×844、768px、1024px、1440×900。
- Layout adaptations: 手机隐藏次要英文与角色气泡，导航可折行或横向滚动，Hero 巨字缩放；造物案台从三栏变单列。
- Touch/hover differences: 触控目标至少 44px；触摸滑动用于轨道前进，点按入厅；hover 不能成为唯一反馈。

## Interaction states
- Loading: 首屏外景永不被 loader 覆盖；3D 只在点击入馆后显示进度；加载失败保留静态内厅与明确重试。
- Empty: 画廊与作品区给出真实示例展签和下一步，不放抽象渐变占位。
- Error: API/数据库/3D 失败时保留用户选择和已有结果，不伪造成功。
- Success: 点赞像落朱砂印，生成结果像作品入框；反馈短促、可感知。
- Disabled: 显示原因；下载与保存只在真实结果就绪后可用。
- Offline/slow network: 首屏、地图与本地馆藏数据可用；云端作品与生成能力显示明确降级。

## Content voice
- Tone: 像博物馆策展文字，简洁、沉静、有材料感。
- Terminology: 云上展厅、百工典藏、山河图志、造物案台、共创画廊、推门入馆、旋转鉴赏。
- Microcopy rules: 按钮写结果动作；少用“智能、赋能、AI 驱动”；英文只保留品牌副标和必要格式信息。

## Implementation constraints
- Framework/styling system: Vite 多页面 + 原生 HTML/CSS/ES modules + Express；不迁移框架，不新增依赖。
- Design-token constraints: 复用 CSS variables；颜色、字体、动效常量必须从本文件派生。
- 3D boundary: `SketchCorridorScene` 管空间与镜头；`ArtifactStage` 管独立藏品旋转缩放；`ThreeScene` 管文创载体与贴花。模型原始材质不得统一染色。
- Performance constraints: 首屏不自动初始化 Three.js；进馆后动态导入；像素比封顶；一次只保留必要模型；页面隐藏和弹层打开时暂停渲染。
- Compatibility constraints: Chrome/Edge 优先，兼顾 Firefox/Safari；WebGL 不可用时保留静态内厅。
- Test/screenshot expectations: TDD；`npm test`、`npm run build`；内置浏览器 1440×900 与 390×844 截图；Visual Ralph 记录至少 12 轮验收结论。

## Open questions
- [ ] ChatCut/Seedance 2.5 当前环境无可调用工具；本轮不依赖视频，使用静态外景、CSS 与 Three.js 完成可交互叙事。
- [ ] Supabase、Gemini 与 3D provider 的正式生产配置仍沿用现有环境约束，不在本次视觉重构中扩权。
