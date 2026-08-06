// 非遗创造面板控制器：generator 页与 3D 博物馆展台卡片共用同一套创造流程。
// 元素 ID 与 generator.html 保持一致，选择器作用域限定在 root 内。
import {
  generateImage,
  generatePrompt,
  getCraftInfo,
  getIPInfo,
  getCarrierInfo,
  getStyleInfo,
  saveCreation,
  listCreations
} from '../utils/apiService.js';
import {
  summarizePattern,
  renderPatternHTML,
  calculateStats,
  imageToPattern,
  downloadPatternImage,
  downloadPatternCSV,
  DEFAULT_PATTERN_SIZE
} from '../utils/patternGenerator.js';
import { getCraftById, getGeneratorCrafts } from '../utils/craftData.js';
import { PALETTE_COLORS, getColorKeyByHex, setActiveColorSystem } from '../utils/colorSystem.js';

export function initCreationPanel(root, {
  onTexture,
  onSelectionChange,
  applyUrlParams = false
} = {}) {
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));

  let currentImageUrl = null;
  let currentPatternResult = null;
  let currentSummary = {};
  let currentStats = null;
  let currentPrompt = '';

  function init() {
    populateCraftOptions();
    bindEvents();
    if (applyUrlParams) {
      applyUrlParamsFromLocation();
    }
    updateProductInfo();
    updateStory();
    updateDownloadState();
    loadRecentCreations();
  }

  function populateCraftOptions() {
    const craftSelect = $('#craft');
    if (!craftSelect || craftSelect.options.length > 0) return;

    getGeneratorCrafts().forEach((craft) => {
      const option = document.createElement('option');
      option.value = craft.id;
      option.textContent = `${craft.name} - ${craft.blurb || craft.description}`;
      craftSelect.appendChild(option);
    });
  }

  function applyUrlParamsFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const craft = params.get('craft');
    const carrier = params.get('carrier');

    if (craft) {
      const craftSelect = $('#craft');
      if (craftSelect) {
        craftSelect.value = craft;
        craftSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (carrier) {
      const carrierSelect = $('#carrier');
      if (carrierSelect) {
        carrierSelect.value = carrier;
        carrierSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function bindEvents() {
    const craftSelect = $('#craft');
    const ipSelect = $('#ip');
    const carrierSelect = $('#carrier');
    const styleSelect = $('#style');
    const generateBtn = $('#generateBtn');
    const patternBtn = $('#patternBtn');
    const saveCreationBtn = $('#saveCreationBtn');
    const colorSystemSelect = $('#color-system-select');
    const patternResolutionSelect = $('#pattern-resolution-select');
    const downloadImageBtn = $('#download-image-btn');
    const downloadCsvBtn = $('#download-csv-btn');
    const refreshCreationsBtn = $('#refreshCreationsBtn');

    const onCraftChange = () => {
      updateProductInfo();
      updateStory();
      setWorkflowStep('idea');
    };

    craftSelect?.addEventListener('change', onCraftChange);
    ipSelect?.addEventListener('change', updateProductInfo);
    carrierSelect?.addEventListener('change', updateProductInfo);
    styleSelect?.addEventListener('change', updateProductInfo);
    generateBtn?.addEventListener('click', handleGenerateImage);
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

    patternResolutionSelect?.addEventListener('change', () => {
      if (currentImageUrl) handleGeneratePattern();
    });

    downloadImageBtn?.addEventListener('click', () => {
      if (currentPatternResult) {
        downloadPatternImage(
          currentPatternResult.pattern,
          currentPatternResult.width,
          currentPatternResult.height,
          currentPatternResult.colorSystem
        );
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

  function getCurrentSelection() {
    const craftSelect = $('#craft');
    const ipSelect = $('#ip');
    const carrierSelect = $('#carrier');
    const styleSelect = $('#style');

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
    return $('#color-system-select')?.value || 'MARD';
  }

  function getPatternSize() {
    const rawValue = $('#pattern-resolution-select')?.value
      || `${DEFAULT_PATTERN_SIZE}x${DEFAULT_PATTERN_SIZE}`;
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

    const productName = $('#product-name');
    const productDesc = $('#product-desc');
    if (productName) productName.textContent = name;
    if (productDesc) productDesc.textContent = desc;

    onSelectionChange?.(selection);
  }

  function updateStory() {
    const selection = getCurrentSelection();
    if (!selection) return;

    const craftData = getCraftById(selection.craftId);
    const storyContent = $('#story-content');
    if (storyContent) {
      storyContent.textContent = craftData
        ? craftData.story
        : '每种非遗技艺都有独特的历史背景和文化内涵，选择非遗技艺后查看详细故事。';
    }
  }

  async function handleGenerateImage() {
    const btn = $('#generateBtn');
    const imagePreview = $('#image-preview');
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
      currentPatternResult = null;
      currentSummary = {};
      currentStats = null;
      updateDownloadState();

      imagePreview.innerHTML = `
        <img src="${currentImageUrl}" alt="生成的非遗文创设计">
        <p class="result-note">${result.message}</p>
      `;

      onTexture?.(currentImageUrl);
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
    const btn = $('#patternBtn');
    const patternContainer = $('#pattern-container');

    if (!btn || !patternContainer) return;
    if (!currentImageUrl) {
      patternContainer.innerHTML = `
        <div class="pattern-placeholder">
          <p>请先生成 AI 图像，再转译为拼豆图纸</p>
        </div>
      `;
      showToast('请先生成 AI 图像');
      return;
    }

    btn.disabled = true;
    btn.textContent = '生成中...';
    setWorkflowStep('pattern');
    setActiveColorSystem(getColorSystem());
    const size = getPatternSize();
    const colorSystem = getColorSystem();

    patternContainer.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>正在生成拼豆图纸...</p>
      </div>
    `;

    try {
      const pattern = await imageToPattern(
        currentImageUrl,
        size.width,
        size.height,
        {
          colorSystem,
          removeBackground: true,
          fitSubject: true,
          subjectPadding: 0.06
        }
      );
      currentPatternResult = {
        pattern,
        width: size.width,
        height: size.height,
        colorSystem
      };
      renderPattern(currentPatternResult);
      showToast('已从 AI 图像转译为可制作拼豆图纸');
    } catch (error) {
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
      btn.disabled = false;
      btn.textContent = '生成拼豆图纸';
    }
  }

  function renderPattern(result) {
    const patternContainer = $('#pattern-container');
    if (!patternContainer) return;

    const { pattern, width, colorSystem } = result;
    currentSummary = summarizePattern(pattern);
    currentStats = calculateStats(currentSummary);

    patternContainer.innerHTML = `
      <div class="bead-pattern is-ready">
        ${renderPatternHTML(pattern, width)}
        <p class="result-note">图纸尺寸: ${result.width} × ${result.height} | 色号体系: ${colorSystem} | 悬停查看色号，点击豆位可微调</p>
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
    const currentCell = $(`.bead-cell[data-index="${index}"]`);
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
    const materialList = $('#material-list .materials');
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
          code: value.key || getColorKeyByHex(value.color, colorSystem),
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
    const beadCount = $('#bead-count');
    const colorCount = $('#color-count');
    const timeCost = $('#time-cost');
    const difficulty = $('#difficulty');

    if (beadCount) beadCount.textContent = stats.beadCount;
    if (colorCount) colorCount.textContent = `${stats.colorCount} 色`;
    if (timeCost) timeCost.textContent = stats.timeCost;
    if (difficulty) difficulty.textContent = stats.difficulty;
  }

  function updateDownloadState() {
    const hasPattern = Boolean(currentPatternResult);
    $('#download-image-btn')?.toggleAttribute('disabled', !hasPattern);
    $('#download-csv-btn')?.toggleAttribute('disabled', !hasPattern);
    $('#saveCreationBtn')?.toggleAttribute('disabled', !hasPattern);
  }

  async function handleSaveCreation() {
    const btn = $('#saveCreationBtn');
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
    const section = $('#recent-section');
    const container = $('#recent-creations');
    if (!section || !container) return;

    let creations = [];
    try {
      creations = await listCreations(6);
    } catch (error) {
      // API 未启动（如纯静态预览）时静默跳过，不污染控制台
      console.warn('List creations failed:', error);
    }
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
    $$('.workflow-step').forEach((item) => {
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

  init();

  return {
    // 博物馆展台卡片打开时同步技艺下拉
    setCraft(craftId) {
      const craftSelect = $('#craft');
      if (!craftSelect || !craftId) return;
      craftSelect.value = craftId;
      craftSelect.dispatchEvent(new Event('change', { bubbles: true }));
    },
    getCurrentSelection
  };
}
