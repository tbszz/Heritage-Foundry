import { CRAFTS_DATA } from './utils/craftData.js';
import { ParticleMorphScene } from './components/ParticleMorphScene.js';

const GENERATOR_CRAFT_MAP = {
  'tiger-head': 'papercut',
  papercut: 'papercut',
  shadow: 'shadow',
  embroidery: 'embroidery',
  'tie-dye': 'tie-dye',
  porcelain: 'porcelain',
  calligraphy: 'calligraphy',
  seal: 'seal',
  brocade: 'brocade',
  clay: 'clay',
  tea: 'tea',
  kites: 'papercut',
  lanterns: 'papercut',
  'wood-carving': 'papercut',
  'stone-carving': 'papercut',
  'new-year': 'new-year',
  tangka: 'tangka',
  jade: 'papercut'
};

const MUSEUM_LINES = {
  'tiger-head': '虎纹守岁，布上生威，针线藏着平安愿。',
  papercut: '一剪见天地，红纸映万象，窗花开出人间喜。',
  shadow: '光幕后有乾坤，皮影起落，千年戏声未歇。',
  embroidery: '银针穿云，彩线织史，苗绣把族群记忆穿在身上。',
  'tie-dye': '青蓝入布，云纹自生，每一次晕染都不可复制。',
  porcelain: '白如玉、明如镜、薄如纸、声如磬，千年窑火不熄。',
  calligraphy: '笔走龙蛇，墨分五色，字里行间见山河气象。',
  seal: '方寸之间藏金石，刀锋落处见篆意精神。',
  brocade: '寸锦寸金，云霞入机，经纬之间织就皇家气象。',
  clay: '泥土有灵，塑成人间百态，烟火里见匠心。',
  tea: '一叶入盏，山水回甘，制茶工序凝成东方日常。',
  kites: '竹骨承风，纸鸢上青云，牵线处是童年与远方。',
  lanterns: '灯火映春，彩扎成梦，花灯点亮团圆夜。',
  'wood-carving': '木纹随刀醒来，层层雕刻里藏山川人物。',
  'stone-carving': '石上留痕，刀凿成史，沉默处有千年回响。',
  'new-year': '木版拓春，朱墨纳福，年画把吉庆贴进门庭。',
  tangka: '矿彩绘净土，线条持庄严，唐卡展开信仰宇宙。',
  jade: '琢玉成器，温润有光，方寸雕纹寄君子之德。'
};

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
  const generatorCraftId = GENERATOR_CRAFT_MAP[craftId] || 'papercut';
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
      museumLine: MUSEUM_LINES[craft.id] || craft.story,
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
