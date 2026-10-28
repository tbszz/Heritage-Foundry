#!/usr/bin/env node
// 灵宠资产管线：把馆藏里已有的 GLB 上传 Tripo → 可绑骨检查 → 自动绑骨 → 预设动作重定向 → 下载。
// 每个付费阶段先落账 creating 再 POST，拿到 taskId 立即保存；重跑只继续查询，不重复扣费。
// 用法：
//   node --use-env-proxy scripts/rig-spirit-pet.cjs --source=<原始 GLB 路径>
//   node scripts/optimize-spirit-pet.mjs
// 原始 GLB 用 Tripo 批量账本里的未压缩文件（站点里的版本是 Draco + WebP，不保证 Tripo 能解）。
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const BASE = 'https://openapi.tripo3d.ai/v3';
const PET_ID = 'heritage-082'; // 山东布老虎：四足、腿分得开，走路动作不易扯坏网格
const DIR = path.join(ROOT, 'artifacts', 'spirit-pet', PET_ID);
const STATE = path.join(DIR, 'state.json');
const OUTPUT = path.join(DIR, 'rigged.raw.glb');
const MIN_CREDITS = 150;
const POLL_MS = 5000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

// v3.0 绑骨对非人形骨架沿用 v2.5 的效果；四足目前只有 walk 一个预设动作
const RIG_PAYLOAD = { model: 'v3.0-20260909', out_format: 'glb' };
const ANIMATIONS_BY_RIG = {
  biped: ['preset:idle', 'preset:walk', 'preset:run', 'preset:jump', 'preset:turn'],
  quadruped: ['preset:quadruped:walk']
};

async function request(route, { body, form } = {}) {
  if (!process.env.TRIPO_API_KEY) throw new Error('TRIPO_API_KEY is required');
  const headers = { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + route, {
    method: body || form ? 'POST' : 'GET',
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
    redirect: 'error', signal: AbortSignal.timeout(form ? 180000 : 45000)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.code !== 0) throw new Error(`Tripo HTTP ${response.status}; code ${json.code}; ${json.message || ''}`.trim());
  return json.data;
}

async function download(url, destination, maxBytes = 150 * 1024 * 1024) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Artifact URL must use HTTPS');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
  if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('Artifact exceeds size limit');
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Invalid GLB container');
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination + '.tmp', bytes);
  await fs.rename(destination + '.tmp', destination);
  return bytes.length;
}

async function load() {
  try { return JSON.parse(await fs.readFile(STATE, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { petId: PET_ID, stages: {} }; throw error; }
}
async function save(state) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(STATE, JSON.stringify(state, null, 2));
}

async function ensureCredits(paid) {
  if (!paid) return;
  const wallet = await request('/account/balance');
  const available = Number(wallet?.balance) - Number(wallet?.frozen || 0);
  if (!Number.isFinite(available) || available < MIN_CREDITS) throw new Error(`Tripo 可用额度不足（${available}），停止提交`);
  console.log(`Tripo 可用额度 ${available}`);
}

async function poll(taskId) {
  const started = Date.now();
  let networkFailures = 0;
  for (;;) {
    let task;
    try {
      task = await request(`/tasks/${encodeURIComponent(taskId)}`);
      networkFailures = 0;
    } catch (error) {
      // 查询是免费的：网络抖动只重试，不影响已提交的付费任务
      if (!/fetch failed|timeout|aborted/i.test(error.message) || ++networkFailures > 12) throw error;
      console.warn(`  查询失败（${error.message}），稍后重试 ${networkFailures}/12`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS * 2));
      continue;
    }
    const status = String(task?.status || '').toLowerCase();
    process.stdout.write(`  ${taskId} ${status} ${task?.progress ?? ''}\n`);
    if (status === 'success') return task;
    if (['failed', 'cancelled', 'canceled', 'banned', 'expired', 'unknown'].includes(status)) {
      throw new Error(`Task ${taskId} ended with ${status}: ${task?.error_message || task?.error_code || ''}`);
    }
    if (Date.now() - started > POLL_LIMIT_MS) throw new Error(`Task ${taskId} still ${status}; rerun later to keep polling`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// 付费 POST 边界：creating 未拿到 taskId 的阶段不自动重试，需人工去 Tripo 控制台核对。
async function runStage(state, name, route, payload, paid) {
  const stage = state.stages[name] || (state.stages[name] = {});
  if (stage.status === 'success') return stage;
  if (stage.status === 'creating' && !stage.taskId) {
    throw new Error(`阶段 ${name} 上次提交结果未知，请先在 Tripo 控制台核对，再手动修改 ${STATE}`);
  }
  if (!stage.taskId) {
    await ensureCredits(paid);
    Object.assign(stage, { status: 'creating', payload, createdAt: new Date().toISOString() });
    await save(state);
    const data = await request(route, { body: payload });
    stage.taskId = data?.task_id || data?.id;
    if (!stage.taskId) throw new Error(`阶段 ${name} 未返回 task_id`);
    stage.status = 'submitted';
    await save(state);
    console.log(`${name} 已提交 ${stage.taskId}`);
  }
  const task = await poll(stage.taskId);
  Object.assign(stage, { status: 'success', output: task.output, credits: task.credits_consumed ?? null });
  await save(state);
  return stage;
}

// 上传免费；file_token 有时效，绑骨成功后就不再需要
async function uploadSource(state, sourcePath) {
  if (state.fileToken) return state.fileToken;
  const bytes = await fs.readFile(sourcePath);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${sourcePath} 不是 GLB 文件`);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'model/gltf-binary' }), `${PET_ID}.glb`);
  const data = await request('/files', { form });
  state.fileToken = data?.file_token || data?.token;
  if (!state.fileToken) throw new Error('上传未返回 file_token');
  state.source = path.relative(ROOT, sourcePath);
  await save(state);
  console.log(`已上传 ${state.source}`);
  return state.fileToken;
}

async function main() {
  const state = await load();
  const sourceArg = (process.argv.find((arg) => arg.startsWith('--source=')) || '').slice(9);
  if (!state.stages.rig?.taskId && !sourceArg && !state.fileToken) throw new Error('首次运行需要 --source=<原始 GLB 路径>');

  const input = state.stages.rig?.taskId ? null : await uploadSource(state, path.resolve(sourceArg || state.source));
  const check = await runStage(state, 'rigcheck', '/animations/rig-check', { input }, false);
  if (check.output?.riggable === false) throw new Error('Tripo 判定该模型不可绑骨，请换一件藏品');
  const rigType = check.output?.rig_type || 'quadruped';
  const animations = ANIMATIONS_BY_RIG[rigType];
  if (!animations) throw new Error(`骨骼类型 ${rigType} 没有配置预设动作`);
  console.log(`可绑骨，骨骼类型 ${rigType}`);

  const rigged = await runStage(state, 'rig', '/animations/rig', { input, rig_type: rigType, ...RIG_PAYLOAD }, true);
  const animated = await runStage(state, 'retarget', '/animations/retarget', {
    input: rigged.taskId,
    ...(animations.length === 1 ? { animation: animations[0] } : { animations }),
    out_format: 'glb',
    animate_in_place: true
  }, true);
  const size = await download(animated.output.model_url, OUTPUT);
  state.outputPath = path.relative(ROOT, OUTPUT);
  await save(state);
  console.log(`已下载带动画的灵宠模型 ${state.outputPath}（${(size / 1024 / 1024).toFixed(2)} MiB）`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
