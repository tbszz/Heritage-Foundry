# 非遗造物局 - 实现计划 (V2.0)

## [x] Task 1: 项目初始化与依赖配置
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 使用 Vite 初始化项目
  - 安装 Three.js、@tweenjs/tween.js 等依赖
  - 配置项目结构和构建脚本
- **Acceptance Criteria Addressed**: AC-05, AC-06
- **Test Requirements**:
  - `human-judgement` TR-1.1: 项目成功初始化，依赖安装完成
  - `human-judgement` TR-1.2: 项目结构清晰，符合PRD设计

## [x] Task 2: 非遗技艺选择功能实现
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现非遗技艺下拉菜单（剪纸、皮影、苗绣、扎染、木版年画）
  - 为每种非遗技艺添加特色描述和示例纹样
- **Acceptance Criteria Addressed**: AC-01
- **Test Requirements**:
  - `human-judgement` TR-2.1: 下拉菜单显示5种非遗技艺选项
  - `human-judgement` TR-2.2: 选项清晰可辨，交互流畅

## [ ] Task 3: 流行IP选择功能实现
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现流行IP下拉菜单（哆啦A梦、熊大熊二、哪吒、孙悟空、皮卡丘）
  - 为每种IP添加描述和预期融合效果
- **Acceptance Criteria Addressed**: AC-02
- **Test Requirements**:
  - `human-judgement` TR-3.1: 下拉菜单显示5种流行IP选项
  - `human-judgement` TR-3.2: IP描述清晰，融合效果说明明确

## [ ] Task 4: 文创载体选择功能实现
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现文创载体下拉菜单（拼豆挂件、帆布包、手机壳、贴纸套组、冰箱贴）
  - 为每种载体添加可视化预览
- **Acceptance Criteria Addressed**: AC-03
- **Test Requirements**:
  - `human-judgement` TR-4.1: 下拉菜单显示5种文创载体选项
  - `human-judgement` TR-4.2: 选项与文创场景匹配

## [ ] Task 5: 风格选择功能实现
- **Priority**: medium
- **Depends On**: Task 1
- **Description**: 
  - 实现风格下拉菜单（国潮明亮、可爱校园、复古市集、极简日常、节日礼物）
  - 为每种风格添加配色预览
- **Acceptance Criteria Addressed**: AC-04
- **Test Requirements**:
  - `human-judgement` TR-5.1: 下拉菜单显示5种风格选项
  - `human-judgement` TR-5.2: 风格描述准确，预览直观

## [ ] Task 6: nanobanana API服务实现
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现apiService.js，封装nanobanana API调用
  - 实现prompt模板，根据非遗技艺、IP和风格生成prompt
  - 实现图像生成的异步请求和加载状态
- **Acceptance Criteria Addressed**: AC-05
- **Test Requirements**:
  - `human-judgement` TR-6.1: API调用成功，返回图像URL
  - `human-judgement` TR-6.2: 图像生成过程显示加载进度
  - `human-judgement` TR-6.3: Prompt生成合理，融合非遗和IP元素

## [ ] Task 7: Three.js 3D场景搭建
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现ThreeScene.js组件
  - 创建3D场景、相机、渲染器
  - 添加光照和环境设置
- **Acceptance Criteria Addressed**: AC-06
- **Test Requirements**:
  - `human-judgement` TR-7.1: 3D场景正常渲染
  - `human-judgement` TR-7.2: 光照效果合理，视觉清晰

## [ ] Task 8: 3D模型创建与加载
- **Priority**: high
- **Depends On**: Task 7
- **Description**: 
  - 使用Three.js几何体创建简单的3D模型（挂件、帆布包、手机壳）
  - 实现模型加载和纹理映射
  - 支持模型切换
- **Acceptance Criteria Addressed**: AC-06, AC-07
- **Test Requirements**:
  - `human-judgement` TR-8.1: 3D模型正常显示
  - `human-judgement` TR-8.2: AI生成图像正确映射到模型上
  - `human-judgement` TR-8.3: 切换载体时模型正确切换

## [ ] Task 9: 3D交互功能实现
- **Priority**: high
- **Depends On**: Task 7
- **Description**: 
  - 实现鼠标拖拽旋转3D模型
  - 实现滚轮缩放查看细节
  - 实现自动旋转动画
- **Acceptance Criteria Addressed**: AC-06
- **Test Requirements**:
  - `human-judgement` TR-9.1: 拖拽旋转流畅自然
  - `human-judgement` TR-9.2: 滚轮缩放效果正常
  - `human-judgement` TR-9.3: 自动旋转动画平滑

## [ ] Task 10: 商品文案生成功能实现
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4, Task 5
- **Description**: 
  - 实现根据非遗技艺、IP、载体和风格组合生成商品名称
  - 实现根据选择生成卖点文案和非遗故事卡
- **Acceptance Criteria Addressed**: AC-08
- **Test Requirements**:
  - `human-judgement` TR-10.1: 商品名称与选择内容相关且有创意
  - `human-judgement` TR-10.2: 卖点文案清晰传达产品价值

## [ ] Task 11: 拼豆图纸生成功能实现
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 实现将AI生成图像转译为拼豆像素图
  - 实现带坐标网格的拼豆图纸生成
  - 实现每个格子的色号标注
- **Acceptance Criteria Addressed**: AC-09
- **Test Requirements**:
  - `human-judgement` TR-11.1: 图纸显示清晰的坐标网格
  - `human-judgement` TR-11.2: 每个豆子位置标注色号
  - `human-judgement` TR-11.3: 图像像素化效果合理

## [ ] Task 12: 颜色统计与材料清单功能实现
- **Priority**: high
- **Depends On**: Task 11
- **Description**: 
  - 实现每种颜色的名称显示
  - 实现色号代码显示
  - 实现所需豆子数量统计
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `human-judgement` TR-12.1: 显示每种颜色的名称
  - `human-judgement` TR-12.2: 显示色号代码
  - `human-judgement` TR-12.3: 豆子数量统计准确

## [ ] Task 13: 制作信息展示功能实现
- **Priority**: medium
- **Depends On**: Task 11
- **Description**: 
  - 实现预计豆子总数显示
  - 实现使用颜色数量显示
  - 实现制作时长估算和难度等级评估
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `human-judgement` TR-13.1: 豆子数量统计准确
  - `human-judgement` TR-13.2: 制作时长估算合理
  - `human-judgement` TR-13.3: 难度等级评估准确

## [ ] Task 14: 响应式布局优化
- **Priority**: medium
- **Depends On**: Task 1
- **Description**: 
  - 优化移动端布局，确保关键内容可见
  - 优化触控交互体验
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `human-judgement` TR-14.1: 在手机端（375px宽）布局正常
  - `human-judgement` TR-14.2: 在平板端（768px宽）布局正常

## [ ] Task 15: 视觉设计优化
- **Priority**: low
- **Depends On**: Task 1
- **Description**: 
  - 优化配色方案，确保符合非遗文化特色
  - 优化图标和视觉元素
  - 提升整体视觉统一性和美观度
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `human-judgement` TR-15.1: 配色方案符合非遗文化特色
  - `human-judgement` TR-15.2: 视觉风格统一协调