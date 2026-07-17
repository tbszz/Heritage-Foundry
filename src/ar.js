// AR 体验页（报告 4.1：<model-viewer> 包现有展品，初赛 POC + 复赛主力）。
// model-viewer 由 /vendor/model-viewer.min.js 提供（自包含 bundle，内置 three），
// 与站内 three@0.160 互不干扰；安卓/鸿蒙走 WebXR / Scene Viewer，桌面端 3D 预览。
import { CRAFTS_DATA, getCraftById } from './utils/craftData.js';

const AR_CRAFTS = CRAFTS_DATA.filter((craft) => Boolean(craft.modelUrl));

export function getInitialArCraft(search = '') {
  const params = new URLSearchParams(search);
  const requested = params.get('craft');
  return (
    AR_CRAFTS.find((craft) => craft.id === requested)
    || AR_CRAFTS.find((craft) => craft.id === 'porcelain')
    || AR_CRAFTS[0]
    || null
  );
}

async function configureDracoDecoder() {
  // public/models/ 下的 GLB 都是 Draco 压缩的，把解码器指向自托管路径，
  // 否则 model-viewer 会去请求 Google CDN，离线演示会挂。
  // 慢网络下 vendor 脚本可能晚于本模块执行，所以等自定义元素注册完成
  await customElements.whenDefined('model-viewer');
  customElements.get('model-viewer').dracoDecoderLocation = '/draco/';
}

function renderCraftStrip(strip, activeCraftId, onSelect) {
  strip.innerHTML = '';
  AR_CRAFTS.forEach((craft) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ar-craft-chip';
    chip.dataset.craftId = craft.id;
    chip.setAttribute('role', 'tab');
    chip.textContent = `${craft.emoji} ${craft.name}`;
    chip.classList.toggle('active', craft.id === activeCraftId);
    chip.addEventListener('click', () => onSelect(craft));
    strip.appendChild(chip);
  });
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || '';
}

function showCraft(craft) {
  if (!craft) return;

  const viewer = document.getElementById('ar-viewer');
  if (viewer) {
    viewer.setAttribute('src', craft.modelUrl);
    viewer.setAttribute('alt', `${craft.name}三维模型`);
  }

  setText('ar-craft-name', craft.name);
  setText('ar-craft-category', craft.category);
  setText('ar-craft-story', craft.story);
  const emoji = document.getElementById('ar-story-emoji');
  if (emoji) emoji.textContent = craft.emoji;

  document.querySelectorAll('.ar-craft-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.craftId === craft.id);
  });

  const url = new URL(window.location.href);
  url.searchParams.set('craft', craft.id);
  window.history.replaceState(null, '', url);
}

function initArPage() {
  const strip = document.getElementById('ar-craft-strip');
  const initialCraft = getInitialArCraft(window.location.search);
  if (strip) {
    renderCraftStrip(strip, initialCraft?.id, showCraft);
  }
  // 文案先展示；模型 src 等解码器路径配置完成后再设置，避免与 CDN 默认值竞态
  configureDracoDecoder().then(() => showCraft(initialCraft));
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initArPage);
}
