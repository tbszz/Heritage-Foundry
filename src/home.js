import { CRAFTS_DATA, getGeneratorCraftId } from './utils/craftData.js';
import { MuseumScene, getStandLayout } from './components/MuseumScene.js';
import { initCreationPanel } from './components/creationPanel.js';
import { prefetchModels } from './utils/modelLoader.js';

let museumScene = null;
let creationApi = null;
let focusedStand = null;
let panelHideTimer = null;

export function getHomepageCrafts(crafts = CRAFTS_DATA) {
  return crafts.filter((craft) => Boolean(craft.modelUrl));
}

export function getHomepageCraftIntro(craft) {
  if (!craft) {
    return {
      name: '',
      category: '',
      description: '选择一项技艺，数字粒子即刻聚合成它的三维形态。',
      story: ''
    };
  }

  return {
    name: craft.name,
    category: craft.category,
    description: craft.description,
    story: craft.story
  };
}

export function getInitialHomepageCraft(requestedId, crafts = CRAFTS_DATA) {
  const homepageCrafts = getHomepageCrafts(crafts);
  return homepageCrafts.find((craft) => craft.id === requestedId)
    || homepageCrafts.find((craft) => craft.id === 'porcelain')
    || homepageCrafts[0]
    || null;
}

export function getHomepageCraftLinks(craftId) {
  const generatorCraftId = getGeneratorCraftId(craftId);
  return {
    craftHref: `crafts.html?craft=${encodeURIComponent(craftId)}`,
    generatorHref: `generator.html?craft=${encodeURIComponent(generatorCraftId)}`
  };
}

export function getMuseumTourStops(crafts = CRAFTS_DATA) {
  const homepageCrafts = getHomepageCrafts(crafts);
  return homepageCrafts.map((craft, index) => {
    const angle = (index / Math.max(homepageCrafts.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = 2.65;
    return {
      ...craft,
      index,
      assetKey: craft.id,
      stopLabel: String(index + 1).padStart(2, '0'),
      iconUrl: `/assets/generated/craft-icons/${craft.id}.png`,
      museumLine: craft.museumLine || craft.story,
      camera: {
        x: Number((Math.cos(angle) * radius).toFixed(3)),
        y: 1.74,
        z: Number((Math.sin(angle) * 0.9 + 7.55).toFixed(3))
      },
      spotlight: {
        x: Number((Math.cos(angle) * 1.45).toFixed(3)),
        y: 2.4,
        z: Number((Math.sin(angle) * 1.45).toFixed(3))
      }
    };
  });
}

export function resolveHomepageSelection(current, requested) {
  return {
    nextCraft: requested || current,
    shouldUpdate: Boolean(requested && current?.id !== requested.id)
  };
}

// ---------- 3D 博物馆首页 ----------

function initHomePage() {
  const container = document.getElementById('museum-container');
  if (!container) return;

  const layout = getStandLayout(getHomepageCrafts());

  museumScene = new MuseumScene(container);
  museumScene.init({
    layout,
    onStateChange: handleStateChange,
    onFocusStand: handleFocusStand,
    onSelectStand: openCraftPanel
  });

  // 调试/自动化测试句柄
  window.__museum = museumScene;

  const panel = document.getElementById('craft-panel');
  if (panel) {
    creationApi = initCreationPanel(panel);
  }

  document.getElementById('craft-panel-close')?.addEventListener('click', closeCraftPanel);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCraftPanel();
  });

  // 其余模型空闲时预取进 HTTP 缓存，走近展台时解码更快
  prefetchModels(layout.map((stand) => stand.craft.modelUrl));
}

function handleStateChange(state) {
  const gateHint = document.getElementById('gate-hint');
  const hud = document.getElementById('museum-hud');

  if (state === 'entering') {
    gateHint?.classList.add('is-hidden');
  }

  if (state === 'explore') {
    if (gateHint) {
      gateHint.classList.add('is-hidden');
      window.setTimeout(() => { gateHint.style.display = 'none'; }, 700);
    }
    if (hud) hud.hidden = false;

    // ?craft= 深链：进场后直接打开对应展台卡片
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get('craft');
    if (requestedId && museumScene) {
      const stand = museumScene.getStandById(requestedId);
      if (stand) {
        window.setTimeout(() => openCraftPanel(stand), 350);
      }
    }
  }
}

function handleFocusStand(stand) {
  focusedStand = stand;
  const tip = document.getElementById('hud-focus-tip');
  if (!tip) return;

  if (stand) {
    tip.innerHTML = `<kbd>E</kbd> 查看 ${stand.craft.name} · 非遗创造`;
    tip.classList.add('is-active');
  } else {
    tip.innerHTML = '<kbd>E</kbd> 与展台互动';
    tip.classList.remove('is-active');
  }
}

function openCraftPanel(stand) {
  const panel = document.getElementById('craft-panel');
  if (!panel || !stand) return;

  const { craft } = stand;
  const intro = getHomepageCraftIntro(craft);

  setText('panel-craft-name', intro.name);
  setText('panel-craft-category', `${stand.stopLabel} · ${intro.category}`);
  setText('panel-craft-story', craft.museumLine || intro.story);

  const icon = document.getElementById('panel-craft-icon');
  if (icon) {
    icon.src = `/assets/generated/craft-icons/${craft.id}.png`;
    icon.alt = intro.name;
  }

  const links = getHomepageCraftLinks(craft.id);
  const craftLink = document.getElementById('panel-craft-link');
  if (craftLink) craftLink.href = links.craftHref;

  // 创造面板同步到当前展台的技艺（映射到工作台支持的技艺）
  creationApi?.setCraft(getGeneratorCraftId(craft.id));

  if (panelHideTimer) {
    window.clearTimeout(panelHideTimer);
    panelHideTimer = null;
  }
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('open'));
  museumScene?.setInputEnabled(false);
}

function closeCraftPanel() {
  const panel = document.getElementById('craft-panel');
  if (!panel || panel.hidden) return;

  panel.classList.remove('open');
  museumScene?.setInputEnabled(true);

  if (panelHideTimer) window.clearTimeout(panelHideTimer);
  panelHideTimer = window.setTimeout(() => {
    panel.hidden = true;
  }, 480);
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || '';
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initHomePage);
}
