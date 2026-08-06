# 非遗博物馆 3D 前端 UI 升级设计方案

> 状态:Active · 日期:2026-07-22
> 目标:解决当前远端 3D 博物馆 UI 视觉效果简单、真实感不足的问题,输出 3 个完整可行的前端设计对比方案。
> 范围:首页与博物馆展示前端的视觉风格、摄像机推进交互、技术实现路径、性能与兼容性策略。
> 关联:[DESIGN.md](../../DESIGN.md)、[src/home.js](../../src/home.js)、[src/components/ParticleMorphScene.js](../../src/components/ParticleMorphScene.js)

---

## 一、调研结论(技术基线)

### 1.1 现状
- 技术栈:Vite 多页面 + 原生 ES modules + Three.js + Express。
- 现有 3D:[ParticleMorphScene.js](../../src/components/ParticleMorphScene.js)(800 行,首页粒子聚合形变)、[ThreeScene.js](../../src/components/ThreeScene.js)(1157 行,GLB/PBR 渲染)。
- 已用 Three.js 特性:`MeshStandardMaterial`/`MeshPhysicalMaterial`、`PMREMGenerator` + `RoomEnvironment`、`ACESFilmicToneMapping`、阴影、粒子系统。
- 现有色彩 token(来自 [colorSystem.js](../../src/utils/colorSystem.js)):深墨 `#1f2328`、暖金 `#c99a2e`、朱砂 `#d3382f`、瓷白 `#f5f5dc`。
- 现有 18 个 GLB 模型(见 `public/models/`),覆盖陶瓷、木雕、唐卡、刺绣、剪纸、玉雕等。
- 短板:无后处理管线、无摄像机巡游、无展厅空间结构、无加载过渡电影感、粒子形变后场景偏空。

### 1.2 调研要点
- 开源参考:`Steve245270533/gallery`(MIT,TS,自研轻量碰撞+移动端)、`threejs-sims-house-builder`(纯几何体+程序化纹理伪造建筑空间)、`theringsofsaturn/virtual-museum-tour-threejs`(摄像机巡游范式)。
- 真实感 5 项性价比组合:`RoomEnvironment`+`PMREMGenerator`(零成本 IBL)、`CatmullRomCurve3`+GSAP(电影感推进)、`EffectComposer` 三件套(UnrealBloom+SSAO+Vignette)、`Reflector` 地面倒影+`PCFSoftShadowMap`、`InstancedMesh` 柱列+`LoadingManager`+GSAP 飞入。
- 摄像机推进核心:`CatmullRomCurve3` 定义牌匾→门前→穿门→大厅曲线,滚轮驱动 `progress`,`getPointAt(弧长均匀)` + `lerp` 帧追赶。
- 国风 PBR 材质:木(metalness 0/roughness 0.5-0.7)、石(0/0.6-0.9)、铜(1/0.2-0.4)、绢(transmission 1)、漆(clearcoat 1)、瓷(clearcoat 1/roughness 0.05-0.2)。

---

## 二、主题设计与风格定位(三方案共享)

### 2.1 主题内核
"非遗造物局"以非遗技艺为内核,前端需传达**庄重、可信赖、有文化厚度**的博物馆气质,同时保留**国潮、手作、年轻**的品牌人格(见 [DESIGN.md](../../DESIGN.md))。三个方案在"博物馆"母题下分别取三种中国建筑空间语言,差异化明显,便于按受众与落地成本选型。

### 2.2 视觉真实感准则(三方案通用)
- 模型区尊重 GLB 原始材质色,不叠青蓝雾或统一染色(沿用现有约束)。
- 必须启用 IBL(`RoomEnvironment`+`PMREMGenerator`)+ `ACESFilmicToneMapping`,消除塑料感。
- 必须有后处理:`UnrealBloom`(金边/灯笼/藻井)+ `SSAO`(角落立体)+ `Vignette`(聚焦)。
- 必须有阴影:`PCFSoftShadowMap` + `light.shadow.radius`,展品/柱列/斗拱投影柔和。
- 地面必须有反射(`Reflector`)或质感纹理,强化空间体积感。

### 2.3 色彩系统(三方案差异化)

| 角色 | 方案A 紫禁工坊 | 方案B 江南书院 | 方案C 敦煌秘境 |
|---|---|---|---|
| 主底色 | 朱砂 `#d3382f` | 瓷白 `#f5f5dc` | 洞窟褐 `#2a1f15` |
| 次底色 | 墨黑 `#1f2328` | 黛青 `#3a4a5c` | 矿物土黄 `#c4923a` |
| 强调色 | 鎏金 `#c99a2e` | 竹青 `#6b8e6b` | 石青 `#3d6b8a` / 石绿 `#4b8b5c` |
| 高光色 | 瓷白 `#f5f5dc` | 水墨 `#1f2328` | 朱砂 `#d3382f` |
| 灯光色温 | 暖黄 3500K | 中性白 5000K | 暖烛 2700K + 冷青背光 6500K |

---

## 三、交互体验设计(三方案共享)

### 3.1 摄像机推进叙事(核心冲击力)
统一采用"牌匾特写 → 触发推进 → 穿门 → 大厅豁然开朗"的四段式电影叙事,三个方案在"门"的形态上差异化(宫门/月洞门/窟门)。

**摄像机路径(CatmullRomCurve3 关键节点)**:
1. **起幅(牌匾特写)**:正前方 5m,轻微仰视,FOV 50,停留 2s 展示金边/木纹泛光。
2. **推进**:沿 Z 轴匀速至门前 1m,DOF 焦点从牌匾切到门框,背景虚化。
3. **穿门**:相机 Y 微降(1.6→1.4)+ 加速 + 暗角增强至 0.9,门框两侧滑出画面。
4. **落幅(大厅全景)**:Y 抬升(1.4→1.8)+ 后退 2m + FOV 50→75 广角拉伸,定格展厅全景。

**触发方式**:
- 加载完成自动播放起幅 2s。
- 点击牌匾 / 滚轮向下 / 按下 ↓ 键 → 触发 GSAP 时间轴推进(progress 0→1,duration 3.5s,`power3.inOut`)。
- 滚轮驱动:监听 `wheel`,将 `deltaY` 累加到 `progress` 并 clamp 0~1,帧间 `lerp(target, 0.1)` 平滑追赶,支持中断与连续。
- `prefers-reduced-motion`:跳过推进动画,直接淡入大厅全景(遵循 [DESIGN.md](../../DESIGN.md) 无障碍约束)。

### 3.2 用户导航系统
- **进入博物馆后**:左侧栏保留现有非遗技艺导航(沿用项目硬约束:左栏导航 + 中央 3D + 描述同屏)。
- **展厅导览**:在大厅落幅后,底部出现"展厅导览"浮层,显示当前展品序号(如 `03 · 陶瓷`)与前后切换。
- **展品查看**:点击左栏技艺 → 摄像机沿曲线平滑移动到对应展位(`curve.getPointAt`),展品高亮(`UnrealBloom` 阈值降低),右侧出现非遗故事卡(沿用 `MUSEUM_LINES` 文案)。
- **退出漫游**:右上角"自由视角"按钮切换 OrbitControls,允许用户旋转/缩放当前展品(沿用现有 3D 交互约束)。

### 3.3 加载过渡
- `LoadingManager.onProgress` 驱动顶部进度条(按文件数)。
- GLB 单独 `xhr.loaded/xhr.total` 按字节精确显示主模型进度。
- 加载完成:GSAP `timeline` 控制全屏遮罩 `ShaderMaterial`(`uProgress` 1→0 淡出)+ 摄像机从牌匾外飞入起幅位。

---

## 四、方案 A:斗拱穹顶·紫禁工坊

### 4.1 设计说明
以**紫禁宫殿工坊**为空间母题,营造皇家造办处的庄重与威严。中轴对称布局,朱墙金瓦,藻井穹顶居中,展品沿中轴线与两翼展柜陈列。气质:大气、庄严、富丽,适合突出"国潮+皇家非遗"定位。

**空间结构(纯几何体 + PBR 伪造)**:
- 入口:三间四柱琉璃牌楼(`BoxGeometry` 堆叠斗拱 + `ExtrudeGeometry` 飞檐),中央悬黑底金字匾额"非遗造物局"。
- 大厅:30m×18m×9m 矩形展厅,地面抛光金砖(`Reflector`),两侧朱漆柱列(`InstancedMesh` ×12),顶部八角藻井(`LatheGeometry` 旋转生成层叠穹顶,贴缠枝莲彩绘)。
- 展位:中央白石须弥座展台 + 两侧玻璃展柜(`MeshPhysicalMaterial` transmission)。

### 4.2 技术实现路径
1. **环境光**:`new RoomEnvironment()` + `pmrem.fromScene()` 生成室内 IBL;叠加 1 盏 `DirectionalLight`(暖黄 3500K,castShadow,`shadow.mapSize 2048`,`radius 8`)模拟天窗主光。
2. **建筑几何**:牌楼/柱列/藻井全部用 `BoxGeometry`/`CylinderGeometry`/`LatheGeometry` 程序化生成,贴 `CanvasTexture` 程序化木纹/彩绘(参考 threejs-sims-house-builder 范式),无需外部模型。
3. **材质**:
   - 朱墙:`MeshStandardMaterial` color `#d3382f` roughness 0.7 + 法线贴图砖纹。
   - 金瓦/匾额:`MeshStandardMaterial` metalness 1 roughness 0.3 color `#c99a2e` + Bloom 发光。
   - 金砖地面:`Reflector` color `#2a2018`,倒影柱列与藻井。
   - 玻璃展柜:`MeshPhysicalMaterial` transmission 1 roughness 0.1 thickness 0.5。
4. **摄像机**:`CatmullRomCurve3` 4 节点(牌匾位→宫门前→穿门→大厅中央),GSAP 时间轴驱动。
5. **后处理**:`RenderPass` → `SSAOPass` → `BokehPass`(穿门景深)→ `UnrealBloomPass`(strength 1.2 threshold 0.1)→ `VignetteShader` → `OutputPass`。
6. **展品**:复用现有 18 个 GLB,按技艺分展位,`InstancedMesh` 处理重复展台。

### 4.3 视觉效果描述
- 起幅:黑底金字"非遗造物局"匾额占满画面,金边泛光,背景虚化,朱墙暗角衬底。
- 穿门:相机下沉加速,门框金线流过两侧,藻井彩绘从头顶掠过,地面金砖倒影流动。
- 落幅:大厅豁然开朗,八角藻井居顶,朱柱分列两翼,中央瓷器展品被暖光聚焦,空间对称威严。

### 4.4 性能优化策略
- 柱列/瓦当/地砖用 `InstancedMesh` 单 draw call。
- 藻井彩绘用 `LOD`(远距离切低模)。
- 后处理降级:移动端关 `SSAOPass` 与 `Reflector`,仅保留 `UnrealBloom`+`Vignette`。
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` cap 像素比(沿用现有约束)。
- 模型切换释放旧资源 + 丢弃陈旧回调(沿用 `ThreeScene` 既有模式)。

### 4.5 兼容性考虑
- 桌面端 Chrome/Edge 优先,60fps;Firefox/Safari 降级关 SSAO。
- WebGL2 不可用时回退静态全景图(牌楼渲染图)。
- `prefers-reduced-motion` 跳过穿门动画。

### 4.6 实施难度评估
- **难度:中高**。建筑几何程序化建模工作量较大(藻井/斗拱),但无外部模型依赖,可控。
- 复用现有 `ThreeScene` 的 GLB/PBR 管线,新增 EffectComposer 与摄像机曲线模块。
- 预计新增代码:EffectComposer 封装 ~200 行、建筑几何 ~400 行、摄像机推进 ~150 行。

---

## 五、方案 B:水墨回廊·江南书院

### 5.1 设计说明
以**江南园林书院**为空间母题,营造文人雅集的静谧与诗意。粉墙黛瓦,月洞门,水院倒影,曲廊回环。气质:清雅、含蓄、留白,适合突出"手作+东方美学"定位,受众偏年轻文艺群体。

**空间结构**:
- 入口:白墙前悬木匾"非遗造物局",月洞门(`ShapeGeometry` 带孔)居中。
- 水院:中央一方静水池(`Reflector`),四周围合粉墙黛瓦廊柱,展品沿曲廊壁龛陈列。
- 细节:冰裂纹窗格(`ShapeGeometry` 参数化)、竹影投影、水面雾气。

### 5.2 技术实现路径
1. **环境光**:`RoomEnvironment` IBL + 1 盏 `DirectionalLight`(中性白 5000K,模拟天光)+ `HemisphereLight`(天青/地白)。
2. **建筑几何**:粉墙 `PlaneGeometry` + 程序化白灰纹理;黛瓦屋顶 `ExtrudeGeometry` 沿 `CatmullRomCurve3` 檐口曲线;月洞门 `ShapeGeometry` 减运算。
3. **材质**:
   - 粉墙:`MeshStandardMaterial` color `#f5f5dc` roughness 0.9。
   - 黛瓦:`MeshStandardMaterial` color `#3a4a5c` roughness 0.7。
   - 水池:`Reflector` color `#2a3540` + `FresnelShader` 边缘强化 + 轻微法线扰动模拟涟漪。
   - 木质展架:`MeshStandardMaterial` color `#8B4513` roughness 0.6 木纹法线。
4. **雾效**:`scene.fog = new FogExp2(0x3a4a5c, 0.02)` 营造空气透视与深远感。
5. **体积光**:月洞门格栅间用 `GodraysNode` 或径向模糊模拟天光透入(轻量版可用 `SpotLight` + 雾)。
6. **摄像机**:穿月洞门时,相机沿弧线推进,DOF 焦点从木匾切到水中倒影。
7. **后处理**:`RenderPass` → `SSAOPass` → `UnrealBloomPass`(strength 0.6,克制)→ `VignetteShader`(0.4,柔和)→ `OutputPass`。

### 5.3 视觉效果描述
- 起幅:白墙前木匾特写,竹影斑驳投影其上,晨光从月洞门斜射,雾气氤氲。
- 穿门:相机穿过月洞门,圆形门框如画框展开水院,水面倒影对称展开。
- 落幅:水院静谧,展品在曲廊壁龛被柔光点亮,水面雾气浮动,空间留白诗意。

### 5.4 性能优化策略
- `Reflector` 水面分辨率降至屏幕 0.5x。
- 雾效几乎免费,可常开。
- 体积光移动端降级为 `SpotLight` + 半透明锥体。
- 墙体/瓦片 `InstancedMesh`。

### 5.5 兼容性考虑
- `Reflector` 在 Safari 旧版可能掉帧,降级为普通镜面材质。
- `FogExp2` 全平台兼容。
- 移动端单列布局,水院简化为静态背景。

### 5.6 实施难度评估
- **难度:中**。月洞门/曲廊几何相对简单,水池倒影是亮点。
- 雾效+体积光是氛围关键,调参成本中等。
- 预计新增代码:建筑几何 ~300 行、水面/雾 ~150 行、摄像机推进 ~150 行(复用方案 A 模块)。

---

## 六、方案 C:数字石窟·敦煌秘境

### 6.1 设计说明
以**敦煌莫高窟**为空间母题,营造信仰宇宙的神秘与震撼。岩石壁面满绘壁画,中心佛龛陈列展品,冷暖光对比强烈。气质:神秘、庄严、震撼,适合突出"唐卡/矿彩/信仰类非遗"定位,视觉冲击力最强。

**空间结构**:
- 入口:崖壁立面悬木匾,拱形窟门(`ShapeGeometry` 拱形)居中。
- 窟内:长方形石窟,左右壁满绘壁画(贴图投影),顶覆藻井,中央佛龛(`CylinderGeometry` + 圆顶)陈列展品。
- 细节:壁画矿彩纹理、岩石粗糙壁面、烛光与天窗冷光对比。

### 6.2 技术实现路径
1. **环境光**:`RoomEnvironment` IBL(低强度)+ 暖烛光 `PointLight` ×4(2700K,castShadow,模拟龛前灯)+ 冷青 `DirectionalLight`(6500K,从窟门天窗射入)。
2. **建筑几何**:岩石壁面 `PlaneGeometry` + 高精度法线/置换贴图模拟风化;拱顶 `LatheGeometry`;佛龛 `CylinderGeometry` + 半球顶。
3. **材质**:
   - 岩石:`MeshStandardMaterial` color `#2a1f15` roughness 0.95 + 法线贴图风化纹。
   - 壁画:AI 生成矿彩壁画贴图(复用 `/api/generate-image`)→ 投射到壁面 `MeshStandardMaterial` map + 自发光 `emissive` 轻微。
   - 佛龛金身:`MeshStandardMaterial` metalness 1 roughness 0.2 color `#c4923a` + Bloom。
4. **体积光**:窟门天窗用 `GodraysNode`(density 0.8,raymarchSteps 60)模拟光束射入,配合 `FogExp2(0x2a1f15, 0.03)` 空气感。
5. **投影映射**:壁画用 `Projector` + `MeshStandardMaterial` map,可动态切换不同非遗主题壁画(唐卡/飞天/缠枝)。
6. **摄像机**:穿窟门时,光束从头顶倾泻,DOF 焦点从木匾切到佛龛展品,冷暖光过渡。
7. **后处理**:`RenderPass` → `SSAOPass` → `GodraysNode` → `BokehPass` → `UnrealBloomPass`(strength 1.5,金身强发光)→ `VignetteShader`(0.7,强暗角)→ `OutputPass`。

### 6.3 视觉效果描述
- 起幅:崖壁木匾特写,窟门幽暗,暖光从门缝透出,神秘感。
- 穿门:相机进入窟内,冷青光束从天窗倾泻照亮壁画,暖烛光在佛龛跳动,矿彩壁画斑斓。
- 落幅:中央佛龛展品被烛光与冷光双重照亮,金身泛光,壁画环绕,空间震撼庄严。

### 6.4 性能优化策略
- `GodraysNode` raymarch 较重,移动端降级为 `SpotLight` + 锥体或关闭。
- 壁画贴图用 KTX2 压缩(复用现有 GLB LFS 通道思路)。
- 岩石法线贴图用 `CompressedTextureLoader`。
- `LOD` 处理远距离壁画切低分辨率贴图。

### 6.5 兼容性考虑
- `GodraysNode` 需 WebGL2 + 阴影完整设置,旧设备降级。
- 体积光 + 多阴影在低端 GPU 可能掉帧,提供"性能模式"开关。
- 暗角较强,注意文字可读性(沿用 DESIGN.md 文字不压复杂图像约束)。

### 6.6 实施难度评估
- **难度:高**。体积光 raymarch、壁画投影映射、冷暖光平衡调参成本高。
- 视觉冲击力最强,但性能风险最高,需重点优化。
- 预计新增代码:建筑几何 ~350 行、体积光/投影 ~250 行、后处理 ~200 行、摄像机推进 ~150 行(复用)。

---

## 七、方案对比矩阵

| 维度 | 方案A 紫禁工坊 | 方案B 江南书院 | 方案C 敦煌秘境 |
|---|---|---|---|
| **主题气质** | 庄严富丽·皇家 | 清雅诗意·文人 | 神秘震撼·信仰 |
| **目标受众** | 大众/国潮/文旅 | 年轻文艺/手作 | 沉浸体验/唐卡矿彩 |
| **空间语言** | 牌楼+藻井+朱柱 | 月洞门+水院+曲廊 | 窟门+壁画+佛龛 |
| **核心材质** | 朱漆/金瓦/金砖 | 粉墙/黛瓦/静水 | 岩壁/矿彩壁画/金身 |
| **灯光策略** | 暖黄主光 | 中性天光+雾 | 暖烛+冷青双光 |
| **关键技术** | Reflector+InstancedMesh | Reflector水+Fog+Godrays | GodraysNode+投影映射 |
| **后处理复杂度** | 中(Bloom+SSAO+Vignette) | 低中(Bloom克制+Vignette柔) | 高(Godrays+Bloom强+Vignette强) |
| **摄像机门** | 琉璃宫门 | 月洞门 | 拱形窟门 |
| **视觉冲击力** | ★★★★ | ★★★ | ★★★★★ |
| **文化厚度** | ★★★★ | ★★★ | ★★★★★ |
| **实施难度** | 中高 | 中 | 高 |
| **性能风险** | 中 | 低 | 高 |
| **移动端友好** | 中(降级SSAO) | 高(雾免费) | 低(体积光重) |
| **与现有资产契合** | 高(瓷器/玉雕/漆器) | 中(刺绣/剪纸/茶) | 高(唐卡/木雕/石雕) |
| **预计新增代码量** | ~750 行 | ~600 行 | ~950 行 |

---

## 八、实施建议与选型推荐

### 8.1 选型推荐
- **首选方案A(紫禁工坊)**:综合性价比最高。庄重气质契合"非遗造物局"品牌,Reflector+InstancedMesh 技术成熟风险低,与现有瓷器/玉雕/漆器资产契合度高,移动端可平稳降级。
- **备选方案B(江南书院)**:若目标受众偏年轻文艺、强调手作诗意,且需要移动端最佳体验,选 B。难度最低,可快速落地。
- **高阶方案C(敦煌秘境)**:若需最强视觉冲击与唐卡/矿彩类非遗深度展示,且桌面端为主,选 C。建议作为"沉浸展厅"独立模块,与 A/B 主厅并存。

### 8.2 推荐落地路径
1. **阶段一(共享基座)**:封装 `EffectComposer` 管线 + `CatmullRomCurve3` 摄像机推进模块 + `LoadingManager` 加载过渡(三方案复用)。
2. **阶段二(选型实现)**:按选型实现对应建筑几何与材质。
3. **阶段三(展品接入)**:复用现有 18 个 GLB,按技艺分展位接入 `MUSEUM_LINES` 文案。
4. **阶段四(性能调优)**:后处理降级策略、`InstancedMesh`、`LOD`、像素比 cap。

### 8.3 性能与兼容性通用策略
- 像素比 cap `Math.min(devicePixelRatio, 2)`。
- 后处理降级链:桌面全开 → 中端关 SSAO → 移动端关 SSAO+Reflector → 低端关全部仅留 Bloom。
- WebGL2 不可用回退静态渲染图。
- `prefers-reduced-motion` 跳过摄像机推进,直接淡入落幅。
- 模型切换释放旧资源 + 丢弃陈旧回调(沿用 `ThreeScene` 既有模式)。

### 8.4 预览图
三方案预览图见 `docs/design-previews/`:
- `option-a-imperial-court-workshop.png`(方案A 紫禁工坊)
- `option-b-jiangnan-water-court-v2.png`(方案B 江南书院)
- `option-c-dunhuang-grotto.png`(方案C 敦煌秘境)
