# 非遗造物局 · 鸿蒙版

本仓库为原版 Heritage Foundry 的独立鸿蒙迁移工程，包含 Web/Node 服务和 `harmonyos/` 原生 Stage 工程。当前为开发版本；不能把 Web 构建成功视作 HAP 编译、真机运行或全部参赛要求已完成。

## 开发

```sh
npm ci
npm run build:harmony-viewer
npm run build
npm test -- --maxWorkers=2
```

使用 DevEco Studio 打开 `harmonyos/`，安装对应 HarmonyOS SDK，配置本人的应用签名，再构建并运行 `entry`。工程面向 API 12+，目标 SDK 为 HarmonyOS 6.0.0/API 20。签名、设备 UDID、SDK 路径均不得提交。

三维渲染与手作图纸源码在 `harmonyos/viewer/`，编译产物和 Draco 解码器放入 `entry/src/main/resources/rawfile/viewer/`。工坊复用原版六种载体、拼豆图纸、色号与材料统计；技艺数据、创作流程、画廊和草稿由 ArkTS 实现。原生导出使用同步启动、限时查询结果的 ArkWeb 桥，不假设 runJavaScript 会等待网页 Promise。

原生应用“我的”页面填写 HTTPS 服务地址，例如实际部署域名下的 `/api`。尚未部署的域名不能用于演示。服务端 `.env` 使用 `THREE_D_PROVIDER=tripo` 与 `TRIPO_API_KEY`；原生端和网页不包含供应商密钥。图库继续使用原有 Supabase 接口和服务端配置。

## 当前验证边界

- 2026-09-18：鸿蒙仓库 527 项测试通过，原版 472 项通过；包含 Tripo 提交边界、队列重试及原生流程 mock 回归。
- Web 主程序与原生内嵌渲染资源分别通过 Vite production build。
- Tripo v3 鉴权、真实文生模型及参考图生模型已验证。当前 100 件 GLB 已写入共享馆藏清单，并接入原版展馆、工坊与鸿蒙百艺新馆；同时生成了 100 份不依赖 Draco/WebP 的鸿蒙 AR 兼容变体。真机 AR 仍需逐件验证。
- ArkTS / HAP 编译、模拟器及真机功能测试尚待完成，不能据源码宣称完整可用。
- 已加入地域筛选与文化档案、拼豆/材料统计/PNG和CSV导出、服务卡片、系统分享、轻量跨设备草稿接续和原生百艺新馆，均仍需 ArkTS 编译与设备验证。
- 手作工坊浏览器实测：原有青花图像生成 2485 颗、16 色图纸；异步导出桥返回有效 PNG，公开保存快照返回 9216 个格位、16 项材料和真实统计。重新生成期间拒绝旧快照；这不能替代 ArkWeb/系统文件选择器实测。
- 原生 AR 页面使用 API18+ ARView/真实平面命中与锚点；未确认 ArkGraphics3D 支持 Draco/WebP，因此先运行 `npm run models:build-ar` 生成 `/models-ar/` 原生用 GLB，再进行设备测试。原有浏览器模型保持原压缩格式。AR 不支持的设备提示不算功能验收通过。
- 接续只迁移有界提示词、选项、HTTPS资源地址和任务ID；dataURL/本地文件不会随 Want 跨设备传输。完整跨设备文件同步仍未实现。
- 100 件模型批次已完成资产与清单接入；实际入馆内容仍以 `public/data/heritage-collection.json` 为准。

## 参赛

用户指定赛事为 [2026 C4-AI 鸿蒙高校创新赛](https://developer.huawei.com/home/C4-AI)。[官方赛道页面](https://developer.huawei.com/consumer/cn/activity/incentive/C4) 当前报名已结束。研究取得的规程写明初赛截止 2026-07-26，复赛作品提交截止 2026-09-30 24:00；参赛阶段需与用户已报名/晋级状态核对。

完整功能迁移验收清单见 [实施设计](plans/2026-09-07-harmonyos-design.md)。正式提交前逐项记录设备、系统版本、操作步骤、结果及证据，不把降级提示或模拟数据算成功。

## 官方技术资料

- [Stage 工程配置](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/module-configuration-file)
- [ArkWeb 本地资源](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-cross-origin)
- [系统文件选择与导出](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-file-picker)
- [Tripo v3 文生模型](https://developers.tripo3d.ai/zh/docs/generation-text-to-model/standard)
- [Tripo v3 图生模型](https://developers.tripo3d.ai/zh/docs/generation-image-to-model/standard)
