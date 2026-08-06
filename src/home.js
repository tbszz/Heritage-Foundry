import { CRAFTS_DATA, getGeneratorCraftId } from './utils/craftData.js';

const CHAPTERS = [
  {
    id: 'thread',
    title: '经纬成章',
    subtitle: '线与布的记忆',
    description: '从一根线开始，看图案、身份与祝愿如何被编进日常。',
    craftIds: ['tiger-head', 'embroidery', 'tie-dye', 'brocade']
  },
  {
    id: 'paper',
    title: '纸上万象',
    subtitle: '刀、墨、光与影',
    description: '一张纸可以成为窗花、戏台、风筝，也可以留下时代的笔迹。',
    craftIds: ['papercut', 'shadow', 'calligraphy', 'seal', 'kites', 'lanterns', 'new-year']
  },
  {
    id: 'earth',
    title: '火土新生',
    subtitle: '泥土与时间',
    description: '火候改变材料，也让器物拥有被长久使用和讲述的可能。',
    craftIds: ['porcelain', 'clay', 'tea']
  },
  {
    id: 'carving',
    title: '雕刻万物',
    subtitle: '减去，留下',
    description: '木、石、玉与矿彩，在手的判断中显露形状和精神。',
    craftIds: ['wood-carving', 'stone-carving', 'jade', 'tangka']
  }
];

let selectedCraft = null;
let returnFocus = null;
let sketchCorridorScene = null;
let sketchCorridorPromise = null;
let artifact3dStage = null;
let artifact3dPromise = null;

export function getHomepageCrafts(crafts = CRAFTS_DATA) {
  return crafts.filter((craft) => Boolean(craft.modelUrl));
}

export function getHomepageCraftIntro(craft) {
  if (!craft) {
    return {
      name: '',
      category: '',
      description: '选择一件馆藏，发现它背后的材料、手艺与生活。',
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
      iconWebpUrl: `/assets/generated/craft-icons-webp/${craft.id}.webp`,
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

export function getMuseumChapters(crafts = CRAFTS_DATA) {
  const modeledCrafts = getHomepageCrafts(crafts);
  const byId = new Map(modeledCrafts.map((craft) => [craft.id, craft]));
  const claimed = new Set(CHAPTERS.flatMap((chapter) => chapter.craftIds));
  const unclaimed = modeledCrafts.filter((craft) => !claimed.has(craft.id));

  return CHAPTERS.map((chapter, index) => ({
    ...chapter,
    crafts: [
      ...chapter.craftIds.map((id) => byId.get(id)).filter(Boolean),
      ...(index === CHAPTERS.length - 1 ? unclaimed : [])
    ]
  }));
}

export function getMuseumExperienceMode({
  reducedMotion = false,
  saveData = false,
  hardwareConcurrency = 8,
  deviceMemory = 8
} = {}) {
  if (reducedMotion || saveData) return 'still';
  if (hardwareConcurrency <= 4 || deviceMemory <= 4) return 'lite';
  return 'cinematic';
}

export function resolveHomepageSelection(current, requested) {
  return {
    nextCraft: requested || current,
    shouldUpdate: Boolean(requested && current?.id !== requested.id)
  };
}

function initHomePage() {
  const stage = document.getElementById('museum-stage');
  if (!stage) return;

  const mode = detectExperienceMode();
  document.body.dataset.experienceMode = mode;
  bindSketchCorridor();
  bindDialog();
  bindModeToggle();
  bindRevealObserver();

  const requestedId = new URLSearchParams(window.location.search).get('craft');
  const initialCraft = getInitialHomepageCraft(requestedId);
  if (requestedId && initialCraft?.id === requestedId) {
    window.setTimeout(() => openArtifact(initialCraft), 250);
  }

  document.addEventListener('visibilitychange', () => {
    document.body.dataset.paused = document.hidden ? 'true' : 'false';
  });
}

function detectExperienceMode() {
  const saved = window.localStorage?.getItem('museum-experience-mode');
  if (saved === 'still' || saved === 'cinematic') return saved;

  return getMuseumExperienceMode({
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    saveData: navigator.connection?.saveData,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory
  });
}

// 手绘 3D 走廊：仅 cinematic 模式动态挂载，Three.js 保持在首页入口 bundle 之外；
// 挂载失败（WebGL 不可用等）静默回退到静态丝绢 hero。
function bindSketchCorridor() {
  if (sketchCorridorScene || sketchCorridorPromise) return;
  const stage = document.getElementById('museum-stage');
  const container = document.getElementById('sketch-corridor');
  if (!stage || !container) return;
  if (document.body.dataset.experienceMode !== 'cinematic') return;

  stage.classList.add('is-corridor-loading');
  sketchCorridorPromise = import('./components/SketchCorridorScene.js')
    .then(({ SketchCorridorScene }) => {
      sketchCorridorScene = new SketchCorridorScene(container);
      sketchCorridorScene.init({
        chapters: getMuseumChapters(),
        onRoomEnter: () => {
          stage.classList.add('is-in-room');
          updateCorridorHud('滚轮走近展品 · 点击展品看详情');
          const back = document.getElementById('corridor-back');
          if (back) back.hidden = false;
        },
        onRoomExit: () => {
          stage.classList.remove('is-in-room');
          updateCorridorHud('滚轮逛长廊 · 点击木门进入展厅');
          const back = document.getElementById('corridor-back');
          if (back) back.hidden = true;
        },
        onSelectCraft: (craft) => {
          if (craft) openArtifact(craft);
        },
        onReady: () => {
          stage.classList.remove('is-corridor-loading');
          stage.classList.add('is-corridor-live');
        }
      });

      // 出视口暂停渲染，滚回首屏时恢复
      const observer = new IntersectionObserver((entries) => {
        sketchCorridorScene?.setRenderPaused(!entries.some((entry) => entry.isIntersecting));
      }, { threshold: 0.02 });
      observer.observe(stage);

      document.getElementById('corridor-back')?.addEventListener('click', () => {
        sketchCorridorScene?.exitRoom();
      });
      return sketchCorridorScene;
    })
    .catch(() => {
      stage.classList.remove('is-corridor-loading');
      return null;
    })
    .finally(() => {
      sketchCorridorPromise = null;
    });
}

function updateCorridorHud(text) {
  const hud = document.getElementById('sketch-corridor-hud');
  if (hud) hud.textContent = text;
}

// 详情弹窗内的 3D 模型查看器：复用活态展厅的 ArtifactStage（拖拽旋转 + 滚轮缩放），
// 动态 import 保持首页入口 bundle 不含 Three.js；弹窗关闭时 IntersectionObserver 自动停渲染。
async function loadArtifact3dStage() {
  if (artifact3dStage) return artifact3dStage;
  if (artifact3dPromise) return artifact3dPromise;

  artifact3dPromise = import('./components/ArtifactStage.js')
    .then(({ ArtifactStage }) => {
      const container = document.getElementById('artifact-3d-stage');
      if (!container) return null;
      artifact3dStage = new ArtifactStage(container, {
        onLoadingChange: (loading) => {
          const loader = document.getElementById('artifact-3d-loader');
          if (loader) loader.hidden = !loading;
        },
        onError: () => {
          const loader = document.getElementById('artifact-3d-loader');
          if (loader) loader.hidden = true;
        }
      });
      artifact3dStage.init();
      return artifact3dStage;
    })
    .catch(() => null)
    .finally(() => {
      artifact3dPromise = null;
    });

  return artifact3dPromise;
}

function bindDialog() {
  const dialog = document.getElementById('artifact-dialog');
  if (!dialog) return;

  dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    selectedCraft = null;
    if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    resumeCorridorIfVisible();
  });
}

// 详情弹窗关闭后，仅当走廊仍停留在首屏视口内才恢复渲染（省流模式下不恢复）
function resumeCorridorIfVisible() {
  if (!sketchCorridorScene) return;
  if (document.body.dataset.experienceMode !== 'cinematic') return;
  const stage = document.getElementById('museum-stage');
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < (window.innerHeight || 0);
  sketchCorridorScene.setRenderPaused(!visible);
}

function openArtifact(craft, trigger = document.activeElement) {
  const dialog = document.getElementById('artifact-dialog');
  if (!dialog || !craft) return;

  selectedCraft = craft;
  returnFocus = trigger;
  // 弹窗打开期间暂停走廊渲染，避免 WebGL 循环在弹层下空转
  sketchCorridorScene?.setRenderPaused(true);
  const intro = getHomepageCraftIntro(craft);
  const links = getHomepageCraftLinks(craft.id);

  setText('artifact-name', intro.name);
  setText('artifact-category', intro.category);
  setText('artifact-description', craft.museumLine || intro.description);
  setText('artifact-story', intro.story);

  // 左侧换成可旋转的真实 3D 模型（复用 ArtifactStage，弹窗关闭时其渲染循环自动停止）
  if (craft.modelUrl) {
    loadArtifact3dStage().then((stage) => stage?.setModel(craft.modelUrl));
  }

  const craftLink = document.getElementById('artifact-craft-link');
  const createLink = document.getElementById('artifact-create-link');
  if (craftLink) craftLink.href = links.craftHref;
  if (createLink) createLink.href = links.generatorHref;

  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-close-dialog]')?.focus({ preventScroll: true });
}

function bindModeToggle() {
  const button = document.getElementById('experience-mode-toggle');
  if (!button) return;

  const syncLabel = () => {
    const isStill = document.body.dataset.experienceMode === 'still';
    button.textContent = isStill ? '开启动态场景' : '切换省流模式';
    button.setAttribute('aria-pressed', String(isStill));
  };

  syncLabel();
  button.addEventListener('click', () => {
    const nextMode = document.body.dataset.experienceMode === 'still' ? 'cinematic' : 'still';
    document.body.dataset.experienceMode = nextMode;
    window.localStorage?.setItem('museum-experience-mode', nextMode);
    const stage = document.getElementById('museum-stage');
    if (nextMode === 'cinematic') {
      bindSketchCorridor();
      sketchCorridorScene?.setRenderPaused(false);
      stage?.classList.toggle('is-corridor-live', Boolean(sketchCorridorScene));
    } else {
      sketchCorridorScene?.setRenderPaused(true);
      stage?.classList.remove('is-corridor-live');
    }
    syncLabel();
  });
}

function bindRevealObserver() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;
  if (document.body.dataset.experienceMode === 'still' || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  items.forEach((item) => observer.observe(item));
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text || '';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initHomePage);
}
