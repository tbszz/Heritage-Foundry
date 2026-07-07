import { ThreeScene } from './components/ThreeScene.js';
import {
  generateImage,
  generatePrompt,
  getCraftInfo,
  getIPInfo,
  getCarrierInfo,
  getStyleInfo,
  saveCreation,
  listCreations
} from './utils/apiService.js';
import {
  buildPattern,
  summarizePattern,
  renderPatternHTML,
  calculateStats,
  imageToPattern,
  downloadPatternImage,
  downloadPatternCSV
} from './utils/patternGenerator.js';
import { getCraftById } from './utils/craftData.js';
import { PALETTE_COLORS, getColorKeyByHex, setActiveColorSystem } from './utils/colorSystem.js';

const PATTERN_WIDTH = 18;
const PATTERN_HEIGHT = 12;

let threeScene = null;
let currentImageUrl = null;
let currentSeed = 1;
let currentPattern = null;
let currentSummary = {};
let currentStats = null;
let currentPrompt = '';

function init() {
  bindEvents();
  enhanceSelects();
  applyUrlParams();
  updateProductInfo();
  updateStory();
  updateDownloadState();
  loadRecentCreations();
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const craft = params.get('craft');
  const carrier = params.get('carrier');

  if (craft) {
    const craftSelect = document.getElementById('craft');
    if (craftSelect) craftSelect.value = craft;
  }

  if (carrier) {
    const carrierSelect = document.getElementById('carrier');
    if (carrierSelect) carrierSelect.value = carrier;
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
  const downloadImageBtn = document.getElementById('download-image-btn');
  const downloadCsvBtn = document.getElementById('download-csv-btn');
  const refreshCreationsBtn = document.getElementById('refreshCreationsBtn');

  const onSelectionChange = () => {
    updateProductInfo();
    updateStory();
    setWorkflowStep('idea');
  };

  craftSelect?.addEventListener('change', onSelectionChange);
  ipSelect?.addEventListener('change', updateProductInfo);
  carrierSelect?.addEventListener('change', updateProductInfo);
  styleSelect?.addEventListener('change', updateProductInfo);
  generateBtn?.addEventListener('click', handleGenerateImage);
  patternBtn?.addEventListener('click', handleGeneratePattern);
  saveCreationBtn?.addEventListener('click', handleSaveCreation);
  refreshCreationsBtn?.addEventListener('click', loadRecentCreations);

  colorSystemSelect?.addEventListener('change', () => {
    setActiveColorSystem(colorSystemSelect.value);
    if (currentPattern) {
      currentPattern = currentPattern.map((cell) => {
        if (!cell || typeof cell !== 'object' || cell.isExternal || !cell.hex) return cell;
        return {
          ...cell,
          key: getColorKeyByHex(cell.hex, colorSystemSelect.value)
        };
      });
      renderPattern(currentPattern);
    }
  });

  downloadImageBtn?.addEventListener('click', () => {
    if (currentPattern) {
      downloadPatternImage(currentPattern, PATTERN_WIDTH, PATTERN_HEIGHT, getColorSystem());
    }
  });

  downloadCsvBtn?.addEventListener('click', () => {
    if (currentPattern) {
      downloadPatternCSV(currentPattern, PATTERN_WIDTH, PATTERN_HEIGHT);
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
    currentPrompt = generatePrompt(selection.craftId, selection.ipId, selection.styleId, selection.carrierId);
    const result = await generateImage(currentPrompt, {
      style: selection.styleId,
      craft_type: selection.craftId,
      ip: selection.ipId,
      carrier: selection.carrierId
    });

    currentImageUrl = result.imageUrl;
    currentPattern = null;
    currentSummary = {};
    currentStats = null;
    updateDownloadState();

    imagePreview.innerHTML = `
      <img src="${currentImageUrl}" alt="生成的非遗文创设计">
      <p class="result-note">${result.message}</p>
    `;

    if (threeScene) {
      threeScene.setTexture(currentImageUrl);
    }
  } catch (error) {
    console.error('Failed to generate image:', error);
    imagePreview.innerHTML = `
      <div class="preview-placeholder">
        <p>生成失败，请重试</p>
      </div>
    `;
    showToast(error.message || '生成失败');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成AI图像';
  }
}

async function handleGeneratePattern() {
  const btn = document.getElementById('patternBtn');
  const patternContainer = document.getElementById('pattern-container');

  if (!btn || !patternContainer) return;

  btn.disabled = true;
  btn.textContent = '生成中...';
  setWorkflowStep('pattern');
  setActiveColorSystem(getColorSystem());

  patternContainer.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在生成拼豆图纸...</p>
    </div>
  `;

  try {
    currentSeed += 1;
    currentPattern = currentImageUrl
      ? await imageToPattern(currentImageUrl, PATTERN_WIDTH, PATTERN_HEIGHT)
      : buildPattern(PATTERN_WIDTH, PATTERN_HEIGHT, currentSeed);

    renderPattern(currentPattern);
    showToast(currentImageUrl ? '已从 AI 图像转译为拼豆图纸' : '已生成非遗对称拼豆图纸');
  } catch (error) {
    console.error('Failed to generate pattern:', error);
    patternContainer.innerHTML = `
      <div class="pattern-placeholder">
        <p>生成失败，请重试</p>
      </div>
    `;
    showToast('拼豆图纸生成失败');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成拼豆图纸';
  }
}

function renderPattern(pattern) {
  const patternContainer = document.getElementById('pattern-container');
  if (!patternContainer) return;

  currentSummary = summarizePattern(pattern);
  currentStats = calculateStats(currentSummary);

  patternContainer.innerHTML = `
    <div class="bead-pattern is-ready">
      ${renderPatternHTML(pattern, PATTERN_WIDTH)}
      <p class="result-note">图纸尺寸: ${PATTERN_WIDTH} × ${PATTERN_HEIGHT} | 色号体系: ${getColorSystem()} | 点击豆子可快速微调</p>
    </div>
  `;

  patternContainer.querySelectorAll('.bead-cell').forEach((cell, index) => {
    cell.addEventListener('click', () => cyclePatternCell(index));
  });

  updateMaterialList(currentSummary);
  updateStats(currentStats);
  updateDownloadState();
}

function cyclePatternCell(index) {
  if (!currentPattern) return;

  const cell = currentPattern[index];
  const editableColors = PALETTE_COLORS.slice(0, 10).map((color) => ({
    key: getColorKeyByHex(color.hex, getColorSystem()),
    name: color.name,
    hex: color.hex.toUpperCase(),
    isExternal: false
  }));

  const currentHex = typeof cell === 'object' ? cell.hex?.toUpperCase() : null;
  const currentIndex = editableColors.findIndex((color) => color.hex === currentHex);
  currentPattern[index] = editableColors[(currentIndex + 1) % editableColors.length];
  renderPattern(currentPattern);
}

function updateMaterialList(summary) {
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
        code: value.key || getColorKeyByHex(value.color, getColorSystem()),
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
        <span class="count">${item.count} 颗</span>
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
  const hasPattern = Boolean(currentPattern);
  document.getElementById('download-image-btn')?.toggleAttribute('disabled', !hasPattern);
  document.getElementById('download-csv-btn')?.toggleAttribute('disabled', !hasPattern);
  document.getElementById('saveCreationBtn')?.toggleAttribute('disabled', !hasPattern);
}

async function handleSaveCreation() {
  const btn = document.getElementById('saveCreationBtn');
  const selection = getCurrentSelection();

  if (!btn || !selection || !currentPattern) return;

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
      pattern: currentPattern,
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
  const order = ['idea', 'image', 'pattern', 'save'];
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
