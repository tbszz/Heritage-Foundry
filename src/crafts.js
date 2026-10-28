import { CRAFTS_DATA, getCraftById, getGeneratorCraftId } from './utils/craftData.js';
import { askDocent } from './utils/apiService.js';

let craftThreeScene = null;
let craftThreeScenePromise = null;
let currentCraft = null;
const docentHistory = [];

// 3D 展台按需加载：先渲染典藏列表，引擎在浏览器空闲时再拉取并套用当前展品。
function ensureCraftThreeScene() {
  if (!craftThreeScenePromise) {
    craftThreeScenePromise = import('./components/ThreeScene.js')
      .then(({ ThreeScene }) => {
        if (craftThreeScene) return craftThreeScene;
        const container = document.getElementById('craft-three-container');
        if (!container) return null;
        craftThreeScene = new ThreeScene(container);
        craftThreeScene.init();
        if (currentCraft) craftThreeScene.setCraft(currentCraft);
        return craftThreeScene;
      })
      .catch((error) => {
        craftThreeScenePromise = null;
        console.warn('Failed to load the craft 3D stage:', error);
        return null;
      });
  }
  return craftThreeScenePromise;
}

function scheduleCraftThreeSceneInit() {
  const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 150));
  idle(() => {
    ensureCraftThreeScene();
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getDocentHistory() {
  return docentHistory.slice();
}

export function appendDocentMessage(role, text) {
  docentHistory.push({ role, text: String(text || '').slice(0, 300) });
  while (docentHistory.length > 6) docentHistory.shift();
}

function renderDocentMessage({ role, html }) {
  const thread = document.getElementById('docent-thread');
  if (!thread) return;
  const hint = thread.querySelector('.docent-hint');
  if (hint) hint.remove();
  const message = document.createElement('div');
  message.className = `docent-message docent-${role}`;
  message.innerHTML = html;
  thread.appendChild(message);
  thread.scrollTop = thread.scrollHeight;
}

export async function handleDocentQuestion(question) {
  const trimmed = String(question || '').trim();
  if (!trimmed) return;

  renderDocentMessage({
    role: 'user',
    html: `<p>${escapeHtml(trimmed)}</p>`
  });
  appendDocentMessage('user', trimmed);

  const button = document.getElementById('docent-ask-btn');
  if (button) button.disabled = true;
  renderDocentMessage({
    role: 'pending',
    html: '<p class="docent-pending">讲解员翻阅资料中…</p>'
  });

  try {
    const { answer, sources } = await askDocent(trimmed, {
      craftId: currentCraft?.id,
      history: docentHistory.slice(0, -1)
    });
    const sourceChips = sources.length
      ? `<div class="docent-sources">${sources.map((source) => `<span>典藏 · ${escapeHtml(source.name)}</span>`).join('')}</div>`
      : '';
    const pending = document.querySelector('.docent-pending')?.closest('.docent-message');
    pending?.remove();
    renderDocentMessage({
      role: 'answer',
      html: `<p>${escapeHtml(answer)}</p>${sourceChips}`
    });
    appendDocentMessage('docent', answer);
  } catch (error) {
    console.warn('Docent failed:', error);
    const pending = document.querySelector('.docent-pending')?.closest('.docent-message');
    pending?.remove();
    const fallback = error.code === 'GEMINI_NOT_CONFIGURED'
      ? '讲解员服务尚未配置，可先浏览典藏资料。'
      : `讲解员暂时无法回答（${escapeHtml(error.message)}），请稍后再试。`;
    renderDocentMessage({ role: 'error', html: `<p>${fallback}</p>` });
  } finally {
    if (button) button.disabled = false;
    const input = document.getElementById('docent-input');
    if (input) input.value = '';
  }
}

function init() {
  initCraftSidebar();
  const category = document.getElementById('craft-category');
  for (const name of new Set(CRAFTS_DATA.filter(c => c.id.startsWith('heritage-')).map(c => c.category))) {
    const option = document.createElement('option'); option.value = name; option.textContent = name; category?.appendChild(option);
  }
  document.getElementById('craft-search')?.addEventListener('input', initCraftSidebar);
  category?.addEventListener('change', initCraftSidebar);
  bindEvents();
  selectInitialCraft();
  scheduleCraftThreeSceneInit();
}

function initCraftSidebar() {
  const sidebarList = document.getElementById('craft-sidebar-list');
  if (!sidebarList) return;
  sidebarList.replaceChildren();
  const query = document.getElementById('craft-search')?.value.trim() || '';
  const category = document.getElementById('craft-category')?.value || '';

  CRAFTS_DATA.filter(craft => craft.id.startsWith('heritage-')).forEach((craft) => {
    if ((query && !craft.name.includes(query)) || (category && craft.category !== category)) return;
    const item = document.createElement('div');
    item.className = 'craft-sidebar-item';
    item.dataset.id = craft.id;
    
    item.innerHTML = `
      <div class="craft-sidebar-icon"><img src="${craft.previewUrl}" alt="" loading="lazy" width="48" height="48" style="object-fit:contain"></div>
      <div class="craft-sidebar-info">
        <h4>${craft.name}</h4>
        <span>${craft.category}</span>
      </div>
    `;

    item.addEventListener('click', () => selectCraft(craft));
    sidebarList.appendChild(item);
  });
}

export function getInitialCraftId(search = '') {
  const params = new URLSearchParams(search);
  return params.get('craft') || CRAFTS_DATA.find(craft => craft.id.startsWith('heritage-'))?.id || CRAFTS_DATA[0]?.id || '';
}

function selectInitialCraft() {
  const craftId = getInitialCraftId(window.location.search);
  const craft = getCraftById(craftId) || CRAFTS_DATA[0];
  if (craft) {
    selectCraft(craft);
  }
}

function selectCraft(craft) {
  currentCraft = craft;

  document.querySelectorAll('.craft-sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`.craft-sidebar-item[data-id="${craft.id}"]`)?.classList.add('active');

  const arLink = document.getElementById('ar-view-link');
  if (arLink) {
    arLink.href = `ar.html?craft=${encodeURIComponent(craft.id)}`;
  }

  animateContentChange(() => {
    document.getElementById('content-title').textContent = craft.name;
    document.getElementById('content-subtitle').textContent = craft.category;
    document.getElementById('craft-description').textContent = craft.description;
    document.getElementById('craft-story').textContent = craft.story;

    if (craftThreeScene) {
      craftThreeScene.setCraft(craft);
    }
  });
}

function animateContentChange(callback) {
  const contentArea = document.querySelector('.content-center');
  if (!contentArea) {
    callback();
    return;
  }

  contentArea.style.opacity = '0';
  contentArea.style.transform = 'translateX(10px)';
  contentArea.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

  setTimeout(() => {
    callback();
    contentArea.style.opacity = '1';
    contentArea.style.transform = 'translateX(0)';
  }, 150);
}

function bindEvents() {
  const rotateBtn = document.getElementById('rotate-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      if (craftThreeScene && craftThreeScene.controls) {
        craftThreeScene.controls.autoRotate = !craftThreeScene.controls.autoRotate;
        rotateBtn.textContent = craftThreeScene.controls.autoRotate ? '⏸️ 停止旋转' : '🔄 旋转';
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (craftThreeScene && craftThreeScene.controls) {
        craftThreeScene.controls.reset();
      }
    });
  }

  document.querySelectorAll('.product-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const product = e.target.dataset.product;
      handleCreateProduct(product);
    });
  });

  document.getElementById('docent-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('docent-input');
    handleDocentQuestion(input?.value || '');
  });
}

const VALID_CARRIERS = ['keychain', 'bag', 'phone', 'sticker', 'magnet'];

function handleCreateProduct(product) {
  const carrier = VALID_CARRIERS.includes(product) ? product : 'keychain';
  const craft = getGeneratorCraftId(currentCraft?.id);

  window.location.href = `generator.html?craft=${craft}&carrier=${carrier}`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
