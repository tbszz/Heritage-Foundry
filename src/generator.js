import { ThreeScene } from './components/ThreeScene.js';
import {
  generateImage,
  generatePrompt,
  create3DGenerationTask,
  get3DCapabilities,
  get3DGenerationTask,
  getCraftInfo,
  getIPInfo,
  getCarrierInfo,
  getStyleInfo,
  saveCreation,
  listCreations
} from './utils/apiService.js';
import {
  summarizePattern,
  renderPatternHTML,
  calculateStats,
  imageToPattern,
  downloadPatternImage,
  downloadPatternCSV,
  DEFAULT_PATTERN_SIZE
} from './utils/patternGenerator.js';
import { getCraftById } from './utils/craftData.js';
import { PALETTE_COLORS, getColorKeyByHex, setActiveColorSystem } from './utils/colorSystem.js';
import {
  applyArtworkTexture,
  createLatestRunGate,
  getCarrierImageConfig,
  resolveThreeDStatus,
  shouldRetryThreeDTaskError,
  shouldApplyArtworkToCarrier
} from './utils/generatorState.js';

const THREE_D_POLL_INTERVAL_MS = 3000;
const THREE_D_MAX_POLLS = 200;
const THREE_D_MAX_TRANSIENT_FAILURES = 3;

let threeScene = null;
let currentImageUrl = null;
let currentPatternResult = null;
let currentSummary = {};
let currentStats = null;
let currentPrompt = '';
const imageRunGate = createLatestRunGate();
const patternRunGate = createLatestRunGate();
const threeDTaskRunGate = createLatestRunGate();
let imageAbortController = null;
let threeDTaskActive = false;
let productExportActive = false;
let patternImageExportActive = false;
let current3DModelUrl = null;
let currentThreeDErrorMessage = '';
let threeDCapabilities = {
  loaded: false,
  configured: false,
  ready: false,
  provider: null
};

function init() {
  bindEvents();
  enhanceSelects();
  applyUrlParams();
  updateProductInfo();
  updateStory();
  updateDownloadState();
  updateThreeDActionState();
  loadThreeDCapabilities();
  loadRecentCreations();
}

async function loadThreeDCapabilities() {
  try {
    const capabilities = await get3DCapabilities();
    threeDCapabilities = { ...capabilities, loaded: true };
  } catch (error) {
    console.warn('Failed to load 3D capabilities:', error);
    threeDCapabilities = {
      loaded: true,
      configured: false,
      ready: false,
      provider: error.provider || null
    };
  }
  updateThreeDActionState();
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const craft = params.get('craft');
  const carrier = params.get('carrier');

  if (craft) {
    const craftSelect = document.getElementById('craft');
    if (craftSelect) {
      craftSelect.value = craft;
      syncEnhancedSelect(craftSelect);
    }
  }

  if (carrier) {
    const carrierSelect = document.getElementById('carrier');
    if (carrierSelect) {
      carrierSelect.value = carrier;
      syncEnhancedSelect(carrierSelect);
    }
  }
}

function initGeneratorThreeScene() {
  if (threeScene) return;

  const container = document.getElementById('three-container');
  if (container) {
    threeScene = new ThreeScene(container);
    threeScene.init();
  }
}

function bindEvents() {
  const craftSelect = document.getElementById('craft');
  const ipSelect = document.getElementById('ip');
  const carrierSelect = document.getElementById('carrier');
  const styleSelect = document.getElementById('style');
  const generateBtn = document.getElementById('generateBtn');
  const patternBtn = document.getElementById('patternBtn');
  const saveCreationBtn = document.getElementById('saveCreationBtn');
  const colorSystemSelect = document.getElementById('color-system-select');
  const patternResolutionSelect = document.getElementById('pattern-resolution-select');
  const downloadImageBtn = document.getElementById('download-image-btn');
  const downloadCsvBtn = document.getElementById('download-csv-btn');
  const refreshCreationsBtn = document.getElementById('refreshCreationsBtn');
  const generate3dBtn = document.getElementById('generate3dBtn');
  const exportProductGlbBtn = document.getElementById('export-product-glb-btn');

  const onSelectionChange = () => {
    imageRunGate.invalidate();
    imageAbortController?.abort();
    imageAbortController = null;
    threeDTaskRunGate.invalidate();
    threeDTaskActive = false;
    currentImageUrl = null;
    resetCreationArtifacts();
    threeScene?.clearTexture();
    resetThreeDResult();
    resetImagePreview();
    updateProductInfo();
    updateStory();
    setWorkflowStep('idea');
    const generateButton = document.getElementById('generateBtn');
    if (generateButton) generateButton.disabled = false;
    updateGenerateButtonLabel();
  };

  craftSelect?.addEventListener('change', onSelectionChange);
  ipSelect?.addEventListener('change', onSelectionChange);
  carrierSelect?.addEventListener('change', onSelectionChange);
  styleSelect?.addEventListener('change', onSelectionChange);
  generateBtn?.addEventListener('click', handleGenerateImage);
  generate3dBtn?.addEventListener('click', handleGenerate3D);
  exportProductGlbBtn?.addEventListener('click', handleExportProductGLB);
  patternBtn?.addEventListener('click', handleGeneratePattern);
  saveCreationBtn?.addEventListener('click', handleSaveCreation);
  refreshCreationsBtn?.addEventListener('click', loadRecentCreations);

  colorSystemSelect?.addEventListener('change', () => {
    setActiveColorSystem(colorSystemSelect.value);
    if (currentPatternResult) {
      const pattern = currentPatternResult.pattern.map((cell) => {
        if (!cell || typeof cell !== 'object' || cell.isExternal || !cell.hex) return cell;
        return {
          ...cell,
          key: getColorKeyByHex(cell.hex, colorSystemSelect.value)
        };
      });
      currentPatternResult = {
        ...currentPatternResult,
        pattern,
        colorSystem: colorSystemSelect.value
      };
      renderPattern(currentPatternResult);
    }
  });

  patternResolutionSelect?.addEventListener('change', async () => {
    if (currentImageUrl) {
      await handleGeneratePattern();
    }
  });

  downloadImageBtn?.addEventListener('click', async () => {
    if (currentPatternResult && !patternImageExportActive) {
      patternImageExportActive = true;
      updateDownloadState();
      try {
        await downloadPatternImage(
        currentPatternResult.pattern,
        currentPatternResult.width,
        currentPatternResult.height,
        currentPatternResult.colorSystem
        );
      } finally {
        patternImageExportActive = false;
        updateDownloadState();
      }
    }
  });

  downloadCsvBtn?.addEventListener('click', () => {
    if (currentPatternResult) {
      downloadPatternCSV(
        currentPatternResult.pattern,
        currentPatternResult.width,
        currentPatternResult.height,
        currentPatternResult.colorSystem
      );
    }
  });
}

function enhanceSelects() {
  document.querySelectorAll('.control-group select').forEach((select) => {
    const switcher = document.createElement('div');
    switcher.className = 'choice-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', select.previousElementSibling?.textContent || '选项');

    Array.from(select.options).forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-chip';
      button.dataset.value = option.value;
      button.textContent = option.textContent.split(' - ')[0];
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncChoiceButtons(select, switcher);
      });
      switcher.appendChild(button);
    });

    select.classList.add('enhanced-select');
    select.insertAdjacentElement('afterend', switcher);
    syncChoiceButtons(select, switcher);
    select.addEventListener('change', () => syncChoiceButtons(select, switcher));
  });
}

function syncChoiceButtons(select, switcher) {
  switcher.querySelectorAll('.choice-chip').forEach((button) => {
    const isActive = button.dataset.value === select.value;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function syncEnhancedSelect(select) {
  const switcher = select.nextElementSibling;
  if (switcher?.classList.contains('choice-switch')) {
    syncChoiceButtons(select, switcher);
  }
}

function getCurrentSelection() {
  const craftSelect = document.getElementById('craft');
  const ipSelect = document.getElementById('ip');
  const carrierSelect = document.getElementById('carrier');
  const styleSelect = document.getElementById('style');

  if (!craftSelect || !ipSelect || !carrierSelect || !styleSelect) return null;

  return {
    craftId: craftSelect.value,
    ipId: ipSelect.value,
    carrierId: carrierSelect.value,
    styleId: styleSelect.value,
    craft: getCraftInfo(craftSelect.value),
    ip: getIPInfo(ipSelect.value),
    carrier: getCarrierInfo(carrierSelect.value),
    style: getStyleInfo(styleSelect.value)
  };
}

function getColorSystem() {
  return document.getElementById('color-system-select')?.value || 'MARD';
}

function getPatternSize() {
  const rawValue = document.getElementById('pattern-resolution-select')?.value || `${DEFAULT_PATTERN_SIZE}x${DEFAULT_PATTERN_SIZE}`;
  const [width, height] = rawValue.split('x').map(Number);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_PATTERN_SIZE,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_PATTERN_SIZE
  };
}

function updateProductInfo() {
  const selection = getCurrentSelection();
  if (!selection) return;

  const name = `${selection.craft.name} × ${selection.ip.name} - ${selection.carrier.name}`;
  const desc = `将${selection.craft.description}与${selection.ip.description}结合，打造${selection.style.description}风格的${selection.carrier.description}，让传统文化焕发新的活力。`;

  document.getElementById('product-name').textContent = name;
  document.getElementById('product-desc').textContent = desc;

  initGeneratorThreeScene();
  if (threeScene) {
    threeScene.setCarrier(selection.carrierId);
  }

  updateGenerateButtonLabel();
  updateThreeDActionState();
}

function updateStory() {
  const selection = getCurrentSelection();
  if (!selection) return;

  const craftData = getCraftById(selection.craftId);
  document.getElementById('story-content').textContent = craftData
    ? craftData.story
    : '每种非遗技艺都有独特的历史背景和文化内涵，选择非遗技艺后查看详细故事。';
}

async function handleGenerateImage() {
  const btn = document.getElementById('generateBtn');
  const imagePreview = document.getElementById('image-preview');
  const selection = getCurrentSelection();

  if (!btn || !imagePreview || !selection) return;

  imageAbortController?.abort();
  imageAbortController = new AbortController();
  const imageRun = imageRunGate.start(selection);
  threeDTaskRunGate.invalidate();
  threeDTaskActive = false;
  currentImageUrl = null;
  resetCreationArtifacts();
  threeScene?.clearTexture();
  if (selection.carrierId === 'figurine') {
    threeScene?.clearGeneratedModel();
  }
  resetThreeDResult();
  updateThreeDActionState();
  btn.disabled = true;
  btn.textContent = '生成中...';
  setWorkflowStep('image');

  imagePreview.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>AI正在创作中...</p>
    </div>
  `;

  try {
    const imageConfig = getCarrierImageConfig(selection.carrierId);
    currentPrompt = generatePrompt(selection.craftId, selection.ipId, selection.styleId, selection.carrierId);
    const result = await generateImage(currentPrompt, {
      aspect_ratio: imageConfig.aspectRatio,
      style: selection.styleId,
      craft_type: selection.craftId,
      ip: selection.ipId,
      carrier: selection.carrierId,
      signal: imageAbortController.signal
    });

    if (!imageRunGate.isCurrent(imageRun, getCurrentSelection())) return;

    currentImageUrl = result.imageUrl;

    imagePreview.innerHTML = `
      <img src="${currentImageUrl}" alt="生成的非遗文创设计">
      <p class="result-note">${result.message}</p>
    `;

    if (threeScene && shouldApplyArtworkToCarrier(selection.carrierId)) {
      const textureResult = await applyArtworkTexture(threeScene, currentImageUrl);
      if (!imageRunGate.isCurrent(imageRun, getCurrentSelection())) return;
      if (!textureResult.ok) {
        console.warn('Generated image could not be applied to the 3D carrier:', textureResult.error);
        showToast('图案已生成，但 3D 贴图加载失败；可重试生成');
      }
    }
    updateThreeDActionState();
  } catch (error) {
    if (!imageRunGate.isCurrent(imageRun, getCurrentSelection()) || error.name === 'AbortError') return;
    console.error('Failed to generate image:', error);
    currentImageUrl = null;
    threeScene?.clearTexture();
    updateThreeDActionState();
    imagePreview.innerHTML = `
      <div class="preview-placeholder">
        <p>生成失败，请重试</p>
      </div>
    `;
    showToast(error.message || '生成失败');
  } finally {
    if (imageRunGate.isCurrent(imageRun, getCurrentSelection())) {
      imageAbortController = null;
      btn.disabled = false;
      updateGenerateButtonLabel();
    }
  }
}

async function handleExportProductGLB() {
  const selection = getCurrentSelection();
  const button = document.getElementById('export-product-glb-btn');
  if (!selection || !button || !threeScene) return;
  if (selection.carrierId === 'figurine') {
    showToast('3D 手办请使用真实 3D 生成与下载流程');
    return;
  }
  if (!currentImageUrl || !threeScene.hasAppliedArtwork()) {
    showToast('请先生成图案并等待贴图完成');
    return;
  }

  productExportActive = true;
  button.disabled = true;
  button.textContent = '正在封装 GLB…';

  try {
    const glb = await threeScene.exportCurrentModel();
    const downloadUrl = URL.createObjectURL(glb);
    const download = document.createElement('a');
    const safeCraft = selection.craftId.replace(/[^a-z0-9-]/gi, '-');
    const safeCarrier = selection.carrierId.replace(/[^a-z0-9-]/gi, '-');
    download.href = downloadUrl;
    download.download = `heritage-${safeCraft}-${safeCarrier}.glb`;
    download.hidden = true;
    document.body.appendChild(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    showToast('带贴图的产品 GLB 已开始下载');
  } catch (error) {
    console.error('Failed to export product GLB:', error);
    showToast(error.message || '产品 GLB 导出失败');
  } finally {
    productExportActive = false;
    button.textContent = '下载产品 GLB';
    updateThreeDActionState();
  }
}

async function handleGenerate3D() {
  const selection = getCurrentSelection();
  const button = document.getElementById('generate3dBtn');

  if (!selection || !button) return;
  if (selection.carrierId !== 'figurine') {
    showToast('真实 3D 生成当前用于手办；其他载体已使用真实产品网格');
    return;
  }
  if (!currentImageUrl) {
    showToast('请先生成一张 3D 手办参考图');
    return;
  }
  if (!threeDCapabilities.ready) {
    showToast(threeDCapabilities.configured
      ? '真实 3D 服务已配置但尚未就绪'
      : '真实 3D 服务尚未配置；参考图仍可正常生成');
    return;
  }

  const runToken = threeDTaskRunGate.start(selection);
  threeDTaskActive = true;
  currentThreeDErrorMessage = '';
  button.disabled = true;
  button.textContent = '创建任务中...';
  setWorkflowStep('model');
  setThreeDStatus('正在把参考图提交到真实 3D 建模引擎…', 2, true);
  hideGlbDownload();

  try {
    let task = await create3DGenerationTask(currentImageUrl, {
      carrier: selection.carrierId
    });
    let threeDTransientFailures = 0;

    for (let pollCount = 0; pollCount < THREE_D_MAX_POLLS; pollCount += 1) {
      if (!threeDTaskRunGate.isCurrent(runToken, getCurrentSelection())) return;

      renderThreeDTask(task);
      if (task.status === 'succeeded') {
        if (!task.modelUrl) throw new Error('3D 任务已完成，但没有返回 GLB 模型');
        if (!threeScene) throw new Error('3D 预览引擎尚未就绪');
        await threeScene.setGeneratedModel(task.modelUrl);
        if (!threeDTaskRunGate.isCurrent(runToken, getCurrentSelection())) return;
        current3DModelUrl = task.modelUrl;
        currentThreeDErrorMessage = '';
        revealGlbDownload(task.modelUrl);
        setThreeDStatus('真实 3D 手办已生成，可旋转查看或下载 GLB。', 100, false);
        showToast('真实 3D 手办生成完成');
        return;
      }
      if (task.status === 'failed' || task.status === 'canceled') {
        throw new Error(task.error || '真实 3D 模型生成未完成');
      }

      await wait(THREE_D_POLL_INTERVAL_MS);
      if (!threeDTaskRunGate.isCurrent(runToken, getCurrentSelection())) return;
      try {
        task = await get3DGenerationTask(task.id);
        threeDTransientFailures = 0;
      } catch (error) {
        if (
          !shouldRetryThreeDTaskError(error)
          || threeDTransientFailures >= THREE_D_MAX_TRANSIENT_FAILURES
        ) {
          throw error;
        }
        threeDTransientFailures += 1;
        setThreeDStatus(
          `网络短暂波动，正在自动重试（${threeDTransientFailures}/${THREE_D_MAX_TRANSIENT_FAILURES}）…`,
          task.progress,
          true
        );
      }
    }

    throw new Error('3D 生成等待超时，请稍后重新查询');
  } catch (error) {
    if (!threeDTaskRunGate.isCurrent(runToken, getCurrentSelection())) return;
    const message = /(?:NOT_CONFIGURED|PROVIDER_INVALID)$/.test(String(error.code || ''))
      ? '真实 3D 服务尚未配置；当前参考图与产品网格仍可正常使用。'
      : error.message || '真实 3D 生成失败';
    currentThreeDErrorMessage = message;
    setThreeDStatus(message, 0, false, true);
    showToast(message);
  } finally {
    if (threeDTaskRunGate.isCurrent(runToken, getCurrentSelection())) {
      threeDTaskActive = false;
      button.textContent = '生成真实 3D';
      updateThreeDActionState();
    }
  }
}

function renderThreeDTask(task) {
  const progress = Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0;
  const message = task.status === 'queued'
    ? '任务已排队，正在准备网格…'
    : `正在重建网格、PBR 材质与表面色… ${Math.round(progress)}%`;
  setThreeDStatus(message, progress, true);
}

function setThreeDStatus(message, progress = 0, showProgress = false, isError = false) {
  const status = document.getElementById('three-d-status');
  const progressElement = document.getElementById('three-d-progress');

  if (status) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }
  if (progressElement) {
    progressElement.value = Math.max(0, Math.min(100, Number(progress) || 0));
    progressElement.hidden = !showProgress;
    progressElement.textContent = `${progressElement.value}%`;
  }
}

function updateThreeDActionState() {
  const selection = getCurrentSelection();
  const button = document.getElementById('generate3dBtn');
  const exportButton = document.getElementById('export-product-glb-btn');
  if (!selection || !button || !exportButton) return;

  const isFigurine = selection.carrierId === 'figurine';
  button.hidden = !isFigurine;
  button.disabled = threeDTaskActive
    || !isFigurine
    || !currentImageUrl
    || !threeDCapabilities.ready;
  if (!threeDTaskActive) {
    button.textContent = !threeDCapabilities.loaded
      ? '检查 3D 服务…'
      : (threeDCapabilities.ready
        ? '生成真实 3D'
        : (threeDCapabilities.configured ? '3D 服务未就绪' : '需配置 3D 服务'));
  }
  exportButton.hidden = isFigurine;
  exportButton.disabled = isFigurine
    || productExportActive
    || !currentImageUrl
    || !threeScene?.hasAppliedArtwork();

  const status = resolveThreeDStatus({
    carrierId: selection.carrierId,
    taskActive: threeDTaskActive,
    imageUrl: currentImageUrl,
    modelUrl: current3DModelUrl,
    errorMessage: currentThreeDErrorMessage || (
      isFigurine && threeDCapabilities.loaded && !threeDCapabilities.ready
        ? `真实 3D 后端${threeDCapabilities.configured ? '尚未就绪' : '尚未配置'}${threeDCapabilities.provider ? `（${threeDCapabilities.provider}）` : ''}；参考图仍可正常生成。`
        : ''
    )
  });
  if (status) setThreeDStatus(status.message, 0, false, status.isError);
}

function updateGenerateButtonLabel() {
  const selection = getCurrentSelection();
  const button = document.getElementById('generateBtn');
  if (!selection || !button || button.disabled) return;
  button.textContent = selection.carrierId === 'figurine' ? '生成3D参考图' : '生成AI图案';
}

function resetThreeDResult() {
  current3DModelUrl = null;
  currentThreeDErrorMessage = '';
  hideGlbDownload();
  const progress = document.getElementById('three-d-progress');
  if (progress) {
    progress.value = 0;
    progress.hidden = true;
  }
}

function resetCreationArtifacts() {
  patternRunGate.invalidate();
  currentPatternResult = null;
  currentSummary = {};
  currentStats = null;
  currentPrompt = '';

  const patternContainer = document.getElementById('pattern-container');
  if (patternContainer) {
    patternContainer.innerHTML = `
      <div class="pattern-placeholder">
        <p>生成图案后，可继续转译为拼豆图纸</p>
      </div>
    `;
  }

  const materials = document.querySelector('#material-list .materials');
  if (materials) materials.innerHTML = '<p class="result-note">生成图纸后显示材料清单</p>';

  const patternButton = document.getElementById('patternBtn');
  if (patternButton) {
    patternButton.disabled = false;
    patternButton.textContent = '生成拼豆图纸';
  }

  updateStats({ beadCount: 0, colorCount: 0, timeCost: '0 分钟', difficulty: '入门' });
  updateDownloadState();
}

function resetImagePreview() {
  const imagePreview = document.getElementById('image-preview');
  if (!imagePreview) return;
  imagePreview.innerHTML = `
    <div class="preview-placeholder">
      <p>点击“生成AI图案”按钮</p>
      <p>生成适配当前载体的非遗文创设计</p>
    </div>
  `;
}

function revealGlbDownload(modelUrl) {
  const link = document.getElementById('download-glb-link');
  if (!link) return;
  link.href = modelUrl;
  link.hidden = false;
}

function hideGlbDownload() {
  const link = document.getElementById('download-glb-link');
  if (!link) return;
  link.hidden = true;
  link.removeAttribute('href');
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function handleGeneratePattern() {
  const btn = document.getElementById('patternBtn');
  const patternContainer = document.getElementById('pattern-container');
  const selection = getCurrentSelection();

  if (!btn || !patternContainer || !selection) return;

  const sourceImageUrl = currentImageUrl;

  if (!sourceImageUrl) {
    patternContainer.innerHTML = `
      <div class="pattern-placeholder">
        <p>请先生成 AI 图像，再转译为拼豆图纸</p>
      </div>
    `;
    showToast('请先生成 AI 图像');
    return;
  }

  const size = getPatternSize();
  const patternRequest = {
    ...selection,
    patternWidth: size.width,
    patternHeight: size.height
  };
  const patternToken = patternRunGate.start(patternRequest);
  const requestColorSystem = getColorSystem();
  const isCurrentPatternRequest = () => {
    const latestSelection = getCurrentSelection();
    const latestSize = getPatternSize();
    return Boolean(latestSelection && patternRunGate.isCurrent(patternToken, {
      ...latestSelection,
      patternWidth: latestSize.width,
      patternHeight: latestSize.height
    }));
  };

  btn.disabled = true;
  btn.textContent = '生成中...';
  setWorkflowStep('pattern');
  setActiveColorSystem(requestColorSystem);
  document.getElementById('download-image-btn')?.setAttribute('disabled', '');
  document.getElementById('download-csv-btn')?.setAttribute('disabled', '');
  document.getElementById('saveCreationBtn')?.setAttribute('disabled', '');

  patternContainer.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在生成拼豆图纸...</p>
    </div>
  `;

  try {
    const nextPattern = await imageToPattern(
      sourceImageUrl,
      size.width,
      size.height,
      {
        colorSystem: requestColorSystem,
        removeBackground: true,
        fitSubject: true,
        subjectPadding: 0.06
      }
    );

    if (!isCurrentPatternRequest()) return;

    const activeColorSystem = getColorSystem();
    const pattern = nextPattern.map((cell) => {
      if (!cell || typeof cell !== 'object' || cell.isExternal || !cell.hex) return cell;
      return { ...cell, key: getColorKeyByHex(cell.hex, activeColorSystem) };
    });
    currentPatternResult = {
      pattern,
      width: size.width,
      height: size.height,
      colorSystem: activeColorSystem
    };
    renderPattern(currentPatternResult);
    showToast('已从 AI 图像转译为可制作拼豆图纸');
  } catch (error) {
    if (!isCurrentPatternRequest()) return;
    console.error('Failed to generate pattern:', error);
    if (currentPatternResult) {
      renderPattern(currentPatternResult);
      showToast('新图纸生成失败，已保留上一版');
    } else {
      patternContainer.innerHTML = `
        <div class="pattern-placeholder">
          <p>生成失败，请重试</p>
        </div>
      `;
      showToast('拼豆图纸生成失败');
    }
  } finally {
    if (isCurrentPatternRequest()) {
      btn.disabled = false;
      btn.textContent = '生成拼豆图纸';
      updateDownloadState();
    }
  }
}

function renderPattern(result) {
  const patternContainer = document.getElementById('pattern-container');
  if (!patternContainer) return;

  const { pattern, width, height, colorSystem } = result;
  currentSummary = summarizePattern(pattern);
  currentStats = calculateStats(currentSummary);

  patternContainer.innerHTML = `
    <div class="bead-pattern is-ready">
      ${renderPatternHTML(pattern, width)}
      <p class="result-note">图纸尺寸: ${width} × ${height} | 色号体系: ${colorSystem} | 悬停查看色号，点击豆位可微调</p>
    </div>
  `;

  const grid = patternContainer.querySelector('.bead-grid');
  grid?.addEventListener('click', (event) => {
    const cell = event.target.closest('.bead-cell');
    if (cell) cyclePatternCell(Number(cell.dataset.index));
  });
  grid?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const cell = event.target.closest('.bead-cell');
    if (!cell) return;
    event.preventDefault();
    cyclePatternCell(Number(cell.dataset.index));
  });

  updateMaterialList(currentSummary, colorSystem);
  updateStats(currentStats);
  updateDownloadState();
}

function cyclePatternCell(index) {
  if (
    !currentPatternResult
    || !Number.isInteger(index)
    || index < 0
    || index >= currentPatternResult.pattern.length
  ) return;

  const cell = currentPatternResult.pattern[index];
  const editableColors = PALETTE_COLORS.map((color) => ({
    key: getColorKeyByHex(color.hex, currentPatternResult.colorSystem),
    name: color.name,
    hex: color.hex.toUpperCase(),
    isExternal: false
  }));

  const currentHex = typeof cell === 'object' ? cell.hex?.toUpperCase() : null;
  const currentIndex = editableColors.findIndex((color) => color.hex === currentHex);
  const pattern = [...currentPatternResult.pattern];
  pattern[index] = editableColors[(currentIndex + 1) % editableColors.length];
  currentPatternResult = { ...currentPatternResult, pattern };
  updatePatternCellElement(index);
  currentSummary = summarizePattern(pattern);
  currentStats = calculateStats(currentSummary);
  updateMaterialList(currentSummary, currentPatternResult.colorSystem);
  updateStats(currentStats);
  updateDownloadState();
}

function updatePatternCellElement(index) {
  const currentCell = document.querySelector(`.bead-cell[data-index="${index}"]`);
  const patternCell = currentPatternResult?.pattern[index];
  if (!currentCell || !patternCell) return;

  const template = document.createElement('template');
  template.innerHTML = renderPatternHTML([patternCell], 1);
  const replacement = template.content.querySelector('.bead-cell');
  if (!replacement) return;

  replacement.dataset.index = String(index);
  replacement.tabIndex = currentCell.tabIndex;
  currentCell.replaceWith(replacement);
}

function updateMaterialList(summary, colorSystem = getColorSystem()) {
  const materialList = document.querySelector('#material-list .materials');
  if (!materialList) return;

  const entries = Object.entries(summary)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        const palette = {
          r: { name: '朱砂红', code: 'A-12', color: '#d3382f', count: value },
          g: { name: '孔雀绿', code: 'C-34', color: '#1f7a6d', count: value },
          y: { name: '鎏金黄', code: 'S-08', color: '#c99a2e', count: value },
          b: { name: '靛青蓝', code: 'M-22', color: '#2f5f9f', count: value }
        };
        return palette[key];
      }

      return {
        name: value.name || '拼豆色',
        code: getColorKeyByHex(value.color, colorSystem),
        color: value.color,
        count: value.count
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);

  materialList.innerHTML = entries.length
    ? entries.map((item) => `
      <div class="material-item">
        <div class="color-dot" style="background: ${item.color}"></div>
        <span>${item.name} (${item.code})</span>
        <span class="count">${item.count} 颗 <small>备 ${Math.ceil(item.count * 1.05)}</small></span>
      </div>
    `).join('')
    : '<p class="result-note">生成图纸后显示材料清单</p>';
}

function updateStats(stats) {
  const beadCount = document.getElementById('bead-count');
  const colorCount = document.getElementById('color-count');
  const timeCost = document.getElementById('time-cost');
  const difficulty = document.getElementById('difficulty');

  if (beadCount) beadCount.textContent = stats.beadCount;
  if (colorCount) colorCount.textContent = `${stats.colorCount} 色`;
  if (timeCost) timeCost.textContent = stats.timeCost;
  if (difficulty) difficulty.textContent = stats.difficulty;
}

function updateDownloadState() {
  const hasPattern = Boolean(currentPatternResult);
  document.getElementById('download-image-btn')?.toggleAttribute(
    'disabled',
    !hasPattern || patternImageExportActive
  );
  document.getElementById('download-csv-btn')?.toggleAttribute('disabled', !hasPattern);
  document.getElementById('saveCreationBtn')?.toggleAttribute('disabled', !hasPattern);
}

async function handleSaveCreation() {
  const btn = document.getElementById('saveCreationBtn');
  const selection = getCurrentSelection();

  if (!btn || !selection || !currentPatternResult) return;

  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const craftData = getCraftById(selection.craftId);
    await saveCreation({
      title: `${selection.craft.name} × ${selection.ip.name} - ${selection.carrier.name}`,
      craftId: selection.craftId,
      craftName: selection.craft.name,
      ipId: selection.ipId,
      ipName: selection.ip.name,
      carrierId: selection.carrierId,
      carrierName: selection.carrier.name,
      styleId: selection.styleId,
      styleName: selection.style.name,
      prompt: currentPrompt,
      imageUrl: currentImageUrl,
      pattern: currentPatternResult.pattern,
      materials: Object.values(currentSummary),
      stats: currentStats,
      story: craftData?.story || ''
    });
    setWorkflowStep('save');
    showToast('作品已保存到 Supabase');
    await loadRecentCreations();
  } catch (error) {
    console.warn('Save creation failed:', error);
    showToast(error.code === 'SUPABASE_NOT_CONFIGURED' ? 'Supabase 未配置，作品暂未云端保存' : error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '保存作品';
  }
}

async function loadRecentCreations() {
  const section = document.getElementById('recent-section');
  const container = document.getElementById('recent-creations');
  if (!section || !container) return;

  const creations = await listCreations(6);
  if (!creations.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  container.innerHTML = creations.map((creation) => `
    <article class="recent-card">
      ${creation.image_url ? `<img src="${creation.image_url}" alt="${creation.title || '非遗作品'}">` : '<div class="recent-card-fallback"></div>'}
      <div>
        <h4>${creation.title || '非遗文创方案'}</h4>
        <p>${creation.craft_name || '非遗'} · ${creation.carrier_name || '文创'} · ${creation.stats?.beadCount || 0} 颗</p>
      </div>
    </article>
  `).join('');
}

function setWorkflowStep(step) {
  const order = ['idea', 'image', 'model', 'pattern', 'save'];
  const activeIndex = order.indexOf(step);
  document.querySelectorAll('.workflow-step').forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('active', index <= activeIndex);
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add('is-visible'), 20);
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

document.addEventListener('DOMContentLoaded', init);
