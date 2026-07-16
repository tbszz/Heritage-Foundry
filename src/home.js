import { CRAFTS_DATA, getGeneratorCraftId } from './utils/craftData.js';
import { ParticleMorphScene } from './components/ParticleMorphScene.js';
import { prefetchModels } from './utils/modelLoader.js';

let homeScene = null;
let currentCraft = null;
let selectionVersion = 0;
let homeTourStops = [];

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

function initHomePage() {
  const selector = document.getElementById('heritage-selector');
  const stage = document.getElementById('home-particle-stage');
  if (!selector || !stage) return;

  const crafts = getHomepageCrafts();
  homeTourStops = getMuseumTourStops(crafts);
  renderCraftSelector(selector, homeTourStops);

  homeScene = new ParticleMorphScene(stage);
  homeScene.init();

  const params = new URLSearchParams(window.location.search);
  const initialCraft = getInitialHomepageCraft(params.get('craft'), homeTourStops);
  selectCraft(initialCraft);

  // 首屏只加载当前展品，其余模型空闲时预取进 HTTP 缓存（报告 4.3 P3）
  prefetchModels(
    homeTourStops
      .map((craft) => craft.modelUrl)
      .filter((url) => url && url !== initialCraft?.modelUrl)
  );
}

function renderCraftSelector(selector, crafts) {
  const tourStops = crafts.every((craft) => typeof craft.index === 'number')
    ? crafts
    : getMuseumTourStops(crafts);
  selector.innerHTML = tourStops.map((craft) => `
    <button class="heritage-chip" type="button" data-craft-id="${craft.id}" aria-pressed="false">
      <span class="chip-frame" aria-hidden="true"></span>
      <img class="chip-icon" src="${craft.iconUrl}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'chip-mark', textContent: '${craft.emoji}' }))">
      <span class="chip-name">${craft.name}</span>
      <small>${craft.stopLabel} · ${craft.category}</small>
    </button>
  `).join('');

  selector.querySelectorAll('.heritage-chip').forEach((button) => {
    button.addEventListener('click', () => {
      const craft = tourStops.find((item) => item.id === button.dataset.craftId);
      selectCraft(craft);
    });
  });
}

function selectCraft(craft) {
  const selection = resolveHomepageSelection(currentCraft, craft);
  if (!selection.shouldUpdate) return;

  const version = selectionVersion + 1;
  selectionVersion = version;
  craft = selection.nextCraft;
  currentCraft = craft;

  const tourCraft = getTourCraft(craft);
  setCopyTransition(true);
  setSelectorBusy(true);
  window.setTimeout(() => {
    if (version !== selectionVersion) return;
    updateCraftCopy(tourCraft);
    requestAnimationFrame(() => setCopyTransition(false));
  }, 180);

  document.querySelectorAll('.heritage-chip').forEach((button) => {
    const isActive = button.dataset.craftId === tourCraft.id;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  document.querySelector('.home-hero')?.setAttribute('data-active-craft', tourCraft.id);

  const links = getHomepageCraftLinks(tourCraft.id);
  const craftLink = document.getElementById('home-craft-link');
  if (craftLink) {
    craftLink.href = links.craftHref;
  }

  const generatorLink = document.getElementById('home-generator-link');
  if (generatorLink) {
    generatorLink.href = links.generatorHref;
  }

  const transition = homeScene?.setCraft(tourCraft);
  if (transition?.finally) {
    transition.finally(() => {
      if (version === selectionVersion) setSelectorBusy(false);
    });
  } else {
    window.setTimeout(() => {
      if (version === selectionVersion) setSelectorBusy(false);
    }, 650);
  }
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || '';
}

function updateCraftCopy(craft) {
  const intro = getHomepageCraftIntro(craft);
  setText('home-craft-name', intro.name);
  setText('home-craft-category', intro.category);
  setText('home-description', '选择一项技艺，数字粒子即刻聚合成它的三维形态。');
  setText('home-craft-story', craft.museumLine || intro.story);
  const icon = document.getElementById('home-craft-icon');
  if (icon) {
    icon.src = craft.iconUrl || `/assets/generated/craft-icons/${craft.id}.png`;
  }
}

function setSelectorBusy(isBusy) {
  document.querySelectorAll('.heritage-chip').forEach((button) => {
    button.classList.toggle('is-busy', isBusy);
  });
}

function getTourCraft(craft) {
  if (!craft) return craft;
  return homeTourStops.find((item) => item.id === craft.id) || craft;
}

function setCopyTransition(isTransitioning) {
  document.getElementById('home-copy-panel')?.classList.toggle('is-switching', isTransitioning);
  document.querySelector('.heritage-info-rail')?.classList.toggle('is-switching', isTransitioning);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initHomePage);
}
