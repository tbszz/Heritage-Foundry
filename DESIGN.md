# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-13
- Primary product surfaces: 首页、非遗技艺页、创意生成工作台、拼豆图纸与材料清单、作品保存/最近作品。
- Evidence reviewed: `.trae/specs/PRD.md`, `.trae/specs/tasks.md`, `.trae/specs/checklist.md`, `community-post.md`, `nonheritage-cultural-product-registration.md`, `src/index.html`, `src/home.js`, `src/crafts.html`, `src/generator.html`, `src/style.css`, `src/components/ParticleMorphScene.js`, `src/components/ThreeScene.js`, `src/utils/patternGenerator.js`.

## Brand
- Personality: 国潮、手作、年轻、可信、可共创。
- Trust signals: 非遗故事卡、材料清单、可下载图纸、真实 PBR 载体预览、可下载的生成式 GLB 手办、可保存的作品记录。
- Avoid: 只做装饰的动效、过度营销页、密集大段说明、单一红/金配色压倒内容。

## Product goals
- Goals: 让用户从非遗选择到 AI 图案/参考图、真实产品 3D 预览、生成式 GLB 手办、拼豆图纸、材料统计、保存作品形成闭环。
- Non-goals: 复杂电商交易、用户账号体系、专业 CAD/工业打样流程。
- Success signals: 关键按钮有明确状态；图纸能下载；材料数量准确；唐卡等重模型渲染稳定；无 Supabase 配置时功能不崩。

## Personas and jobs
- Primary personas: 年轻手作爱好者、文创小店店主、校园/文旅活动组织者、非遗传播者。
- User jobs: 快速生成一个能展示、能制作、能分享的非遗文创方案。
- Key contexts of use: 桌面端精细调整；移动端快速预览和分享；展会/课堂现场演示。

## Information architecture
- Primary navigation: 首页、非遗技艺、创意生成。
- Core routes/screens: `index.html` 引导；`crafts.html` 了解技艺与进入生成；`generator.html` 完成生成工作台。
- Content hierarchy: 先选参数，再看 3D/AI 预览，再生成拼豆图纸，最后查看材料、文案、保存作品。

## Design principles
- Principle 1: 把“生成”设计成工作台流程，按钮状态和结果区域必须联动。
- Principle 2: 动效强化注意力和反馈，但不牺牲 WebGL 帧率、可读性和下载能力。
- Tradeoffs: 炫酷优先给关键区域，如 3D 舞台、生成按钮、图纸出现；表单、材料清单保持清晰和稳定。

## Visual language
- Color: 以深墨、暖金、朱砂与瓷白建立展馆氛围；模型区域尊重 GLB 原始材质色，不叠加青蓝色雾或统一染色。
- Typography: 系统无衬线，标题紧凑有力量，工作台内文字保持中小字号。
- Spacing/layout rhythm: 首页与创意生成统一采用深墨数字展馆底景；桌面端生成页先横向铺开参数控制台，再以宽幅数字展台承接 3D 与 AI 结果，下方图纸/材料采用清晰网格；移动端单列堆叠。
- Shape/radius/elevation: 控件 8px radius；重复项目用轻卡片；页面分区不套卡片。
- Motion: 使用短促的 hover、生成中脉冲和结果入场；首页切换只由“墨韵化生”粒子承担，稳定后粒子完全退场并显示清晰完整模型。切换必须即时响应、允许连续中断、缓存 GLB，并在约 1.1 秒内完成已缓存形变；支持 reduced motion。
- Imagery/iconography: 真实 3D 模型、AI 生成图、拼豆网格是主视觉；图标只辅助按钮含义。

## Components
- Existing components to reuse: `ThreeScene`, `patternGenerator`, `apiService`, 技艺数据与当前按钮/选择控件。
- New/changed components: 分段选择按钮、生成步骤状态条、真实 3D 任务面板、GLB 下载、作品保存按钮、最近作品区、动态材料表、拼豆编辑工具条。
- Variants and states: 默认、hover、active、loading、disabled、error、saved、offline/database disabled。
- Token/component ownership: `src/style.css` 继续作为样式来源；不新增大型设计系统。

## Accessibility
- Target standard: WCAG 2.1 AA 的核心可读性与键盘可用性。
- Keyboard/focus behavior: 所有按钮和选择项可 Tab 聚焦；分段选择同步原生 select。
- Contrast/readability: 文本不压在复杂图像上；按钮文本不溢出。
- Screen-reader semantics: 结果区域使用可理解标题；生成状态使用文字提示。
- Reduced motion and sensory considerations: `prefers-reduced-motion` 下禁用持续漂浮/扫描动效，保留必要状态变化。

## Responsive behavior
- Supported breakpoints/devices: 375px 手机、768px 平板、1024px+ 桌面。
- Layout adaptations: 桌面双栏工作台；平板两列；手机单列，按钮换行。
- Touch/hover differences: 手机端加大按钮和拼豆格点击区域，hover 效果不可作为唯一反馈。

## Interaction states
- Loading: AI 生图、真实 3D 排队/建模、拼豆生成、保存作品均显示具体进行中状态。
- Empty: 未生成图像时提供可操作入口，不放长说明。
- Error: API/数据库失败显示短消息并保留本地结果；3D provider 未配置时不伪造模型成功。
- Success: 图像、带贴图产品 GLB、图纸、保存完成给出明显但短促的反馈。
- Disabled: 生成中按钮禁用；产品 GLB 必须等图案真正进入印花材质后才可下载，图纸下载在无图纸时禁用。
- Offline/slow network, if applicable: AI 失败时明确报错并保留用户选择，不伪造生成成功；Supabase 未配时作品保存给出“本地可用，云端未配置”。

## Content voice
- Tone: 年轻、明确、有手作感，少术语。
- Terminology: 使用“拼豆图纸”“材料清单”“载体预览”“非遗故事卡”。
- Microcopy rules: 按钮写动作，状态写结果；不在界面解释实现细节。

## Implementation constraints
- Framework/styling system: Vite 多页面 + 原生 ES modules + Express。
- Design-token constraints: 继续使用 CSS variables，不引入 Tailwind/组件库。
- 3D asset contract: 产品与手办统一使用 GLB mesh + PBR；AI 图案只进入独立 print/decal mesh，不替换或染色底材。稳定产品优先使用可控载体模板，并可把当前载体与印花封装为可重新载入、按载体实际量级写入米制尺寸的二进制 GLB；生成式手办走异步 image-to-3D。当前本地降级引擎为 TripoSR：GPU 重建真实三角网格，CPU marching cubes 避免 Windows 原生编译依赖，导出 18 cm、Y-up、底面归零、带顶点色和 metallic-roughness 材质的普通 GLB；取得 SF3D 权重授权与 VS2022 工具链后可升级为 UV 纹理/预测材质路径。
- Rendering boundary: Three.js 负责 GLB/PBR 渲染、交互与贴花，不负责生成模型；Gaussian Splat 只可用于文物/空间扫描展示，不作为需要 UV、闭合拓扑和下载的产品资产。
- Security/storage: Gemini、Meshy 与本地 sidecar token 只从服务端环境变量读取；provider 只能由服务端选择。本地模型通过固定 GLB 代理回传并校验同源、大小与 GLB 头；能力探测采用独立限流、短缓存与并发合并；Meshy 临时签名资产正式上线前必须转存自有对象存储。
- Performance constraints: 3D 渲染 cap pixel ratio，模型切换要释放旧资源并丢弃陈旧回调；重模型和 reduced motion 场景避免过多持续动画。
- Compatibility constraints: Chrome/Edge 优先，兼顾 Firefox/Safari；WebGL 不可用时要有静态预览。
- Test/screenshot expectations: 改动后运行 `npm test`、`npm run build`，并用本地页面烟测核心流程。

## Open questions
- [ ] Supabase 项目 URL 和 server-side secret/service role key 是否已有固定项目；当前只收到个人 access token，不能直接作为浏览器 key。
- [ ] AI 生图最终使用 nanobanana 还是 Google Gemini 图像接口；现代码沿用 Gemini，保持可配置。
- [ ] 正式 Meshy API key、调用额度与生成资产对象存储尚未配置。本机本地 TripoSR sidecar 已进入接入与真实 GLB 验证阶段；SF3D 仍需接受 gated 权重条款并补齐 VS2022 工具链。所有 provider 均未就绪时只展示真实产品模板和清晰错误状态。
