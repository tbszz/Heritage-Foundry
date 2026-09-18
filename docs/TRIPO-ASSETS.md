# Tripo 接入与百艺新馆资产管线

原版和鸿蒙版共用 provider-neutral API。设置服务端 `THREE_D_PROVIDER=tripo`、`TRIPO_API_KEY` 后，`/api/generate-3d` 创建 Tripo v3 图生模型任务；公共 task ID 使用 `tripo:` 前缀，切换供应商后仍按原供应商轮询。原有 Meshy 与本地 TripoSR 路径保留。

## 100 件模型

`scripts/heritage-model-catalog.cjs` 定义 100 个独立器物 brief，分 10 类。每件描述形制、材料、配色、工艺和细节。AI 结果是传统工艺风格展示模型，不是实物扫描；高还原度必须通过逐件形制和纹样审核，不能只看模型生成成功。

```sh
# 会消耗 Tripo 账户已有额度：先提交两个样本
node --use-env-proxy scripts/generate-heritage-models.cjs --submit=2
# 只查询已有任务并下载，不创建新任务
npm run models:poll
# 已确认样本后继续 100 件清单，最多 4 个并发
node scripts/run-heritage-batch.cjs
# 对已下载模型检查和压缩
npm run models:optimize
# 视觉审核文件确认 approved 后才发布入馆
node scripts/publish-heritage-models.cjs
```

任务账本在忽略的 `artifacts/tripo-batch/`。本机两个仓库通过 `TRIPO_BATCH_DIR` 指向同一个账本，避免重复提交。创建任务先记录 creating，再写 taskId；不确定的 POST 结果标记 submission_unknown，暂停后续付费提交，必须先核对真实任务。查询失败保留已有 taskId，下次继续查询。

工具保留排他锁，遇到锁会显示 PID。恢复前核实进程是否实际存活，不能仅凭文件时间判断任务终止。

质量复核期间，在共享账本目录放置 `hold-submissions` 可暂停新增付费任务，现有任务仍继续查询和下载；全部取回后监督进程退出。余额接口短暂不可用不会阻断已付费任务恢复，但每次新增任务仍需实时有效余额。

统一风格的生产模式使用 `TRIPO_REQUIRE_REFERENCES=true`。新器物必须先有 `references/heritage-NNN.json` 和审核通过的本地参考图，才会提交 Tripo 图生模型；缺少参考时不会退回文生模型。没有可提交参考且现有任务已取回时，监督进程正常退出。生成中与下载后待审的数量合计最多 4 件。

器形不符的模型标为 `needs_revision`。核对参考图后，在私有目录创建参考 JSON：

```json
{"approved":true,"imagePath":"reference.png","source":"参考图出处及使用许可","evidence":"器形、材质与纹样核对记录"}
```

执行 `node --use-env-proxy scripts/revise-heritage-model.cjs heritage-004 reference.json`。该命令属于新的付费生成，要求旧任务已下载、明确返修结论和已审核参考图；原任务、原始 GLB 和预览保存在 `attempts/`。新任务继续由常规轮询脚本恢复，必须重新做技术与视觉审核才能入馆。上传或创建结果不确定时保留 `submission_unknown`，不可盲目重跑。

## 质量和性能

- Tripo v3.1，智能低模、PBR、detailed 贴图、请求面数 12,000、三角网格 GLB；不开启强制 FBX 的 quad。
- 实际三角面验收上限 20,000；首批实际面数 14,652 / 15,706，说明请求面数不是严格结果保证。
- 检查 GLB 容器、可解析网格、有限顶点、三角形索引、PBR 基色贴图。
- 去重、清理、焊点，纹理限制 2048、WebP 质量 88、Draco 压缩。压缩不会冒充已减少三角面。
- 仅对轻微超预算的静态网格尝试保守边折叠：超额不超过 500 面且不超过预算的 2.5%，保留 UV、法线和材质；不支持的属性或大量超标直接拒绝。实测泥塑虎从 20015 降至 19979 面，仍需视觉审核。
- 移动下载上限 8 MiB，首批约 1.30 / 1.08 MiB。保留原始文件，便于重新压缩和对比。
- 新馆列表只加载懒加载缩略图；选中才请求 GLB，切换前释放上一模型几何体、材质和纹理。页面隐藏或离开时停止/释放渲染。
- 低体积和低面数不等于帧率保证。最终需要在目标手机/鸿蒙设备记录冷加载、旋转、连续切换、内存与帧时间。

视觉审核账本格式：`[{"id":"heritage-001","verdict":"approved","evidence":"实际观察依据"}]`。技术检查失败、视觉待审或拒绝的项目不能发布。`public/data/heritage-collection.json` 只含已批准的展品。

官方文档：[v3 文生模型](https://developers.tripo3d.ai/zh/docs/generation-text-to-model/standard)、[任务查询](https://developers.tripo3d.ai/zh/docs/task-query)、[定价](https://developers.tripo3d.ai/zh/pricing)。首批实测每件 40 credits，后续以任务回执为准。

## 2026-09-08 本机性能复核

AR 构建新增 PNG 无损编码优化，保持纹理尺寸、解码像素、透明度、几何和材质绑定不变。三件原有模型实测：剪纸 23,419,824 → 21,928,232 字节，绣绷 20,599,356 → 19,803,660 字节，绣虎 3,152,364 → 2,520,292 字节；合计减少 2,919,360 字节。面数不变，剪纸与绣绷仍分别有 568,118 / 566,823 面，不能把文件压缩当成减面。

本机 Codex 内嵌浏览器、1280×720 视口、屏幕 DPR 1.5（渲染器上限 1.25），模型加载完成后连续渲染 10 秒：

| 场景 | 平均帧率 | 帧间隔 P95 | 最大帧间隔 |
| --- | ---: | ---: | ---: |
| 018/019/020/022 四个独立画布同时展示 | 36.98 FPS | 36.4 ms | 127.1 ms |
| 022 单件全屏 | 39.83 FPS | 30.4 ms | 48.6 ms |
| 022 单件全屏，临时渲染 DPR 降至 1 | 41.83 FPS | 30.3 ms | 42.6 ms |

这是开发环境中已有模型的热加载渲染测量，不是手机、ArkWeb、AR 或冷加载测试。降低像素密度的收益有限，因此没有据此降低正式展品清晰度。仍需目标设备检验旋转、切换和内存；不能承诺所有浏览器始终 60 FPS。

增量优化可用 `node scripts/optimize-heritage-models.mjs --ids=heritage-026,heritage-029`，所有目标必须已下载且存在于目录清单；其他模型报告保留，目标失败会替换旧通过结果。无参数继续全量优化。
