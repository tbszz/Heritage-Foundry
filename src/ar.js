// 统一 AR 看展页：馆藏使用 craft 参数，AI 生成作品使用受控 task 参数。
// model-viewer 负责 WebXR / Scene Viewer / Quick Look 的平台选择；本模块负责状态、尺寸与降级体验。
import { get3DGenerationTask } from './utils/apiService.js';
import { CRAFTS_DATA, getCraftById } from './utils/craftData.js';

const AR_CRAFTS = CRAFTS_DATA.filter((craft) => Boolean(craft.modelUrl));
const DEFAULT_AR_CRAFT_ID = 'porcelain';
const GENERATED_AR_SIZE_METERS = 0.25;
const TASK_POLL_INTERVAL_MS = 3000;
const TASK_POLL_TIMEOUT_MS = 60000;
const TASK_MAX_TRANSIENT_FAILURES = 3;

const pageState = {
  viewer: null,
  request: null,
  source: null,
  modelLoaded: false,
  modelError: false,
  mobileLike: false,
  reducedMotion: false,
  loadVersion: 0
};

export function parseArRequest(search = '') {
  const params = new URLSearchParams(search);
  const requestedCraft = params.get('craft');
  const craft = AR_CRAFTS.find((item) => item.id === requestedCraft)
    || AR_CRAFTS.find((item) => item.id === DEFAULT_AR_CRAFT_ID)
    || AR_CRAFTS[0]
    || null;
  const hasTask = params.has('task');
  const taskId = params.get('task')?.trim() || '';

  if (hasTask) {
    return {
      kind: 'task',
      taskId,
      craftId: craft?.id || DEFAULT_AR_CRAFT_ID
    };
  }

  return {
    kind: 'craft',
    craftId: craft?.id || DEFAULT_AR_CRAFT_ID
  };
}

export function calculateArScale(dimensions, targetMeters) {
  const edges = [dimensions?.x, dimensions?.y, dimensions?.z].map(Number);
  const longestEdge = Math.max(...edges);
  const target = Number(targetMeters);

  if (!Number.isFinite(longestEdge) || longestEdge <= 0 || !Number.isFinite(target) || target <= 0) {
    return 1;
  }

  return target / longestEdge;
}

export function resolveArActionState({ modelLoaded, modelError = false, mobileLike, canActivateAR }) {
  if (modelError) {
    return { mode: 'error', label: '模型暂不可用', disabled: true };
  }
  if (!modelLoaded) {
    return { mode: 'loading', label: '正在装载藏品', disabled: true };
  }
  if (!mobileLike) {
    return { mode: 'copy', label: '复制手机体验链接', disabled: false };
  }
  if (canActivateAR) {
    return { mode: 'ar', label: '放进现实空间', disabled: false };
  }
  return { mode: 'unsupported', label: '此设备暂不支持空间摆放', disabled: true };
}

function createTerminalTaskError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForGeneratedModel(taskId, options = {}) {
  if (!String(taskId || '').trim()) {
    throw createTerminalTaskError('缺少 3D 任务编号');
  }

  const {
    fetchTask = get3DGenerationTask,
    pause = delay,
    now = Date.now,
    timeoutMs = TASK_POLL_TIMEOUT_MS,
    intervalMs = TASK_POLL_INTERVAL_MS,
    maxTransientFailures = TASK_MAX_TRANSIENT_FAILURES,
    onProgress = () => {}
  } = options;
  const deadline = now() + timeoutMs;
  let transientFailures = 0;

  while (now() <= deadline) {
    try {
      const task = await fetchTask(taskId, { timeoutMs: 8000 });
      transientFailures = 0;
      onProgress(task);

      if (task.status === 'succeeded') {
        if (!task.modelUrl) {
          throw createTerminalTaskError('3D 任务已完成，但没有返回 GLB 模型');
        }
        return task;
      }
      if (task.status === 'failed' || task.status === 'canceled') {
        throw createTerminalTaskError(task.error || '生成作品模型未能完成');
      }
    } catch (error) {
      const code = String(error?.code || '');
      if (error?.retryable === false || /(?:TASK_NOT_FOUND|INVALID_TASK_ID)$/.test(code)) throw error;
      transientFailures += 1;
      if (transientFailures > maxTransientFailures) throw error;
    }

    if (now() >= deadline) break;
    await pause(intervalMs);
  }

  const timeoutError = new Error('3D 作品仍在生成，请稍后重新查询');
  timeoutError.retryable = true;
  throw timeoutError;
}

export function getInitialArCraft(search = '') {
  const request = parseArRequest(search);
  return getCraftById(request.craftId) || null;
}

async function configureModelViewer() {
  await customElements.whenDefined('model-viewer');
  customElements.get('model-viewer').dracoDecoderLocation = '/draco/';
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || '';
}

function setStatus(message, tone = 'neutral') {
  const status = document.getElementById('ar-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setRetryAction({ label = '重新加载模型', action = 'reload-model', hidden = false } = {}) {
  const retry = document.getElementById('ar-retry-button');
  if (!retry) return;
  retry.textContent = label;
  retry.dataset.action = action;
  retry.hidden = hidden;
}

function isMobileLike() {
  return Number(navigator.maxTouchPoints) > 0
    || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

function placementCopy(placement) {
  return placement === 'wall' ? '墙面' : '桌面 / 地面';
}

function formatMeters(meters) {
  return `${Math.round(Number(meters) * 100)} cm`;
}

function updatePrimaryAction() {
  const button = document.getElementById('ar-primary-action');
  if (!button || !pageState.viewer) return;

  const action = resolveArActionState({
    modelLoaded: pageState.modelLoaded,
    modelError: pageState.modelError,
    mobileLike: pageState.mobileLike,
    canActivateAR: Boolean(pageState.viewer.canActivateAR)
  });
  button.textContent = action.label;
  button.disabled = action.disabled;
  button.dataset.mode = action.mode;

  if (!pageState.modelLoaded) return;
  if (action.mode === 'ar') {
    setStatus(`空间摆放已就绪，请寻找${placementCopy(pageState.source?.placement)}。`, 'ready');
  } else if (action.mode === 'copy') {
    setStatus('电脑端可旋转鉴赏；复制链接后可在手机上进入空间摆放。', 'ready');
  } else if (action.mode === 'unsupported') {
    setStatus('当前浏览器暂不支持空间摆放，仍可拖动和缩放查看完整 3D。', 'warning');
  }
}

function refreshCapabilityState() {
  updatePrimaryAction();
  window.setTimeout(updatePrimaryAction, 350);
  window.setTimeout(updatePrimaryAction, 1000);
}

function updateMeasureLabel(source) {
  setText('ar-size-value', formatMeters(source.targetMeters));
  setText('ar-placement-value', placementCopy(source.placement));
  setText('ar-ring-size', `参考最长边 ${formatMeters(source.targetMeters)}`);
  setText('ar-ring-placement', source.placement === 'wall' ? '寻找垂直墙面' : '寻找稳定平面');
}

function updateCraftTabs(activeCraftId) {
  document.querySelectorAll('.ar-craft-chip').forEach((chip) => {
    const active = chip.dataset.craftId === activeCraftId;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-selected', String(active));
    chip.tabIndex = active ? 0 : -1;
  });
}

function renderCraftStrip(strip, activeCraftId, onSelect) {
  strip.replaceChildren(...AR_CRAFTS.map((craft) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ar-craft-chip';
    chip.dataset.craftId = craft.id;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', String(craft.id === activeCraftId));
    chip.tabIndex = craft.id === activeCraftId ? 0 : -1;
    chip.textContent = `${craft.emoji} ${craft.name}`;
    chip.addEventListener('click', () => onSelect(craft));
    return chip;
  }));
}

function handleCraftStripKeydown(event) {
  const tabs = Array.from(document.querySelectorAll('.ar-craft-chip'));
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

function showCraftDetails(craft, generated = false) {
  setText('ar-story-emoji', craft.emoji);
  setText('ar-craft-name', generated ? `你的${craft.name} 3D 手办` : craft.name);
  setText('ar-craft-category', generated ? 'AI 造物 · 空间预览' : craft.category);
  setText(
    'ar-craft-story',
    generated
      ? `这件作品由造物案台生成，并沿用${craft.name}的纹样语言。你可以先旋转检查细节，再把它放到现实空间中。`
      : craft.story
  );
}

function setSourceMode(generated) {
  const sourceSection = document.getElementById('ar-source-section');
  const generatedReturn = document.getElementById('ar-generated-return');
  if (sourceSection) sourceSection.hidden = generated;
  if (generatedReturn) generatedReturn.hidden = !generated;
  document.body.dataset.arSource = generated ? 'generated' : 'collection';
}

function beginModelLoad(source, { forceReload = false } = {}) {
  pageState.source = source;
  pageState.modelLoaded = false;
  pageState.modelError = false;
  pageState.loadVersion += 1;
  const version = pageState.loadVersion;
  const viewer = pageState.viewer;
  if (!viewer) return;

  viewer.scale = '1 1 1';
  viewer.setAttribute('ar-placement', source.placement);
  viewer.setAttribute('alt', `${source.name}三维模型`);
  if (forceReload) {
    viewer.removeAttribute('src');
    window.requestAnimationFrame(() => {
      if (version === pageState.loadVersion) viewer.setAttribute('src', source.modelUrl);
    });
  } else {
    viewer.setAttribute('src', source.modelUrl);
  }
  updateMeasureLabel(source);
  setRetryAction({ hidden: true });
  setStatus(`正在装载${source.name}模型…`);
  updatePrimaryAction();
}

async function applyModelScale() {
  const viewer = pageState.viewer;
  const source = pageState.source;
  const version = pageState.loadVersion;
  if (!viewer || !source) return;

  viewer.scale = '1 1 1';
  await viewer.updateComplete;
  if (version !== pageState.loadVersion) return;
  const scale = calculateArScale(viewer.getDimensions(), source.targetMeters);
  viewer.scale = `${scale} ${scale} ${scale}`;
  await viewer.updateComplete;
  if (version !== pageState.loadVersion) return;
  viewer.updateFraming();
  pageState.modelLoaded = true;
  refreshCapabilityState();
}

function showCraft(craft, { updateUrl = true } = {}) {
  if (!craft?.modelUrl) return;
  pageState.request = { kind: 'craft', craftId: craft.id };
  setSourceMode(false);
  showCraftDetails(craft);
  updateCraftTabs(craft.id);
  beginModelLoad({
    kind: 'craft',
    name: craft.name,
    modelUrl: craft.modelUrl,
    placement: craft.arPlacement,
    targetMeters: craft.arSizeMeters
  });

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    url.searchParams.set('craft', craft.id);
    window.history.replaceState(null, '', url);
  }
}

function renderTaskProgress(task) {
  const progress = Number.isFinite(Number(task.progress)) ? Math.round(Number(task.progress)) : 0;
  setStatus(`正在准备生成作品模型… ${progress}%`);
}

function showGeneratedTaskError(error) {
  pageState.modelLoaded = false;
  pageState.modelError = true;
  setText('ar-craft-name', '生成作品暂不可用');
  setText('ar-craft-category', 'AI 造物 · 模型恢复');
  setText('ar-craft-story', error.message || '无法读取这件生成作品，请返回造物案台重新生成。');
  setStatus(error.message || '生成作品模型读取失败', 'error');
  updatePrimaryAction();
  setRetryAction(error.retryable === false
    ? { label: '重新生成 3D', action: 'return-generator' }
    : { label: '重新查询任务', action: 'reload-task' });
}

async function loadGeneratedRequest(request) {
  const craft = getCraftById(request.craftId) || getCraftById(DEFAULT_AR_CRAFT_ID);
  pageState.request = request;
  setSourceMode(true);
  showCraftDetails(craft, true);
  updateMeasureLabel({ placement: 'floor', targetMeters: GENERATED_AR_SIZE_METERS });
  setRetryAction({ hidden: true });
  setStatus('正在读取生成作品任务…');

  try {
    const task = await waitForGeneratedModel(request.taskId, { onProgress: renderTaskProgress });
    beginModelLoad({
      kind: 'task',
      name: `你的${craft.name} 3D 手办`,
      modelUrl: task.modelUrl,
      placement: 'floor',
      targetMeters: GENERATED_AR_SIZE_METERS
    });
  } catch (error) {
    showGeneratedTaskError(error);
  }
}

async function copyExperienceLink() {
  const fallback = document.getElementById('ar-share-fallback');
  const input = document.getElementById('ar-share-link');
  if (input) input.value = window.location.href;

  try {
    await navigator.clipboard.writeText(window.location.href);
    if (fallback) fallback.hidden = true;
    setStatus('手机体验链接已复制。', 'ready');
  } catch {
    if (fallback) fallback.hidden = false;
    input?.focus();
    input?.select();
    setStatus('浏览器未允许自动复制，请手动复制下方链接。', 'warning');
  }
}

function handlePrimaryAction() {
  const button = document.getElementById('ar-primary-action');
  const mode = button?.dataset.mode;
  if (mode === 'ar') {
    setStatus('正在启动空间摆放…');
    // 必须在用户点击的同步调用栈内启动，Quick Look / Scene Viewer 才不会被浏览器拦截。
    try {
      const activation = pageState.viewer.activateAR();
      Promise.resolve(activation).catch(() => {
        setStatus('空间摆放启动失败，请更新浏览器后重试。', 'error');
      });
    } catch {
      setStatus('空间摆放启动失败，请更新浏览器后重试。', 'error');
    }
  } else if (mode === 'copy') {
    copyExperienceLink();
  }
}

function handleRetryAction() {
  const retry = document.getElementById('ar-retry-button');
  const action = retry?.dataset.action;
  if (action === 'return-generator') {
    const craftId = pageState.request?.craftId || DEFAULT_AR_CRAFT_ID;
    window.location.href = `generator.html?craft=${encodeURIComponent(craftId)}&carrier=figurine`;
  } else if (action === 'reload-task' && pageState.request?.kind === 'task') {
    loadGeneratedRequest(pageState.request);
  } else if (action === 'reload-page') {
    window.location.reload();
  } else if (pageState.source) {
    beginModelLoad(pageState.source, { forceReload: true });
  }
}

function bindViewerEvents() {
  const viewer = pageState.viewer;
  viewer.addEventListener('progress', (event) => {
    if (pageState.modelLoaded || event.detail?.reason === 'usdz-conversion') return;
    const progress = Math.round((event.detail?.totalProgress || 0) * 100);
    setStatus(`正在装载${pageState.source?.name || '藏品'}模型… ${progress}%`);
  });
  viewer.addEventListener('load', () => {
    applyModelScale().catch(() => {
      pageState.modelError = true;
      setStatus('模型尺寸校准失败，请重新加载。', 'error');
      setRetryAction();
      updatePrimaryAction();
    });
  });
  viewer.addEventListener('error', () => {
    pageState.modelLoaded = false;
    pageState.modelError = true;
    setStatus('模型加载失败，请检查网络后重试。', 'error');
    setRetryAction();
    updatePrimaryAction();
  });
  viewer.addEventListener('ar-status', (event) => {
    const status = event.detail?.status;
    if (status === 'session-started') {
      setStatus(`移动手机，寻找${placementCopy(pageState.source?.placement)}。`);
    } else if (status === 'object-placed') {
      setStatus('藏品已放入现实空间，可移动或缩放查看。', 'ready');
    } else if (status === 'failed') {
      setStatus('空间追踪启动失败，请回到 3D 展台后重试。', 'error');
    } else if (status === 'not-presenting' && pageState.modelLoaded) {
      refreshCapabilityState();
    }
  });
  viewer.addEventListener('ar-tracking', (event) => {
    const hint = document.getElementById('ar-tracking-hint');
    const missing = event.detail?.status === 'not-tracking';
    if (hint) hint.hidden = !missing;
    if (missing) setStatus('暂未识别平面，请缓慢移动手机并增加环境光线。', 'warning');
  });
}

function bindPageEvents() {
  document.getElementById('ar-primary-action')?.addEventListener('click', handlePrimaryAction);
  document.getElementById('ar-retry-button')?.addEventListener('click', handleRetryAction);
  document.getElementById('ar-craft-strip')?.addEventListener('keydown', handleCraftStripKeydown);
  document.getElementById('ar-share-link')?.addEventListener('click', (event) => event.currentTarget.select());
}

async function initArPage() {
  pageState.viewer = document.getElementById('ar-viewer');
  pageState.mobileLike = isMobileLike();
  pageState.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  pageState.request = parseArRequest(window.location.search);
  if (!pageState.viewer) return;

  if (pageState.reducedMotion) pageState.viewer.removeAttribute('auto-rotate');
  bindViewerEvents();
  bindPageEvents();

  const strip = document.getElementById('ar-craft-strip');
  if (strip) renderCraftStrip(strip, pageState.request.craftId, showCraft);

  try {
    await configureModelViewer();
    if (pageState.request.kind === 'task') {
      await loadGeneratedRequest(pageState.request);
    } else {
      showCraft(getCraftById(pageState.request.craftId), { updateUrl: false });
    }
  } catch {
    pageState.modelError = true;
    setStatus('AR 预览组件加载失败，请刷新页面重试。', 'error');
    setRetryAction({ label: '刷新页面', action: 'reload-page' });
    updatePrimaryAction();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initArPage);
}
