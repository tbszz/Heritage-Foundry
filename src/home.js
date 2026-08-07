import { CRAFTS_DATA, getGeneratorCraftId } from './utils/craftData.js';
import { getCreationStats, listCreations, likeCreation } from './utils/apiService.js';
import { PROVINCE_PATHS, PROVINCE_STATS, NATIONAL_STATS } from './data/province-paths.js';

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

async function initHomePage() {
  const stage = document.getElementById('museum-stage');
  if (!stage) return;

  const mode = detectExperienceMode();
  document.body.dataset.experienceMode = mode;
  bindSketchCorridor();
  bindDialog();
  bindModeToggle();
  bindRevealObserver();
  bindFeatureOverlays();
  loadStats();
  loadCommunityGallery();
  bindCommunityGalleryTabs();
  renderHeritageMap();
  bindCompanionChat();

  const requestedId = new URLSearchParams(window.location.search).get('craft');
  const initialCraft = getInitialHomepageCraft(requestedId);
  if (requestedId && initialCraft?.id === requestedId) {
    window.setTimeout(() => openArtifact(initialCraft), 250);
  }

  document.addEventListener('visibilitychange', () => {
    document.body.dataset.paused = document.hidden ? 'true' : 'false';
  });
}

function animateNumber(el, target, duration = 1200) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function loadStats() {
  const craftCount = CRAFTS_DATA.length;
  const modelCount = CRAFTS_DATA.filter(c => c.modelUrl).length;

  animateNumber(document.getElementById('stat-craft-count'), craftCount);
  animateNumber(document.getElementById('stat-model-count'), modelCount);

  try {
    const stats = await getCreationStats();
    const creationEl = document.getElementById('stat-creation-count');
    const model3dEl = document.getElementById('stat-3d-count');
    if (creationEl) animateNumber(creationEl, stats.totalCreations || 0);
    if (model3dEl) animateNumber(model3dEl, stats.totalWithImage || 0);
  } catch {
    // 降级：Supabase 不可达时保持显示 —
    console.warn('Stats loading skipped, Supabase unavailable');
  }
}

function getVisitorId() {
  const key = 'hf-visitor-id';
  let id = window.localStorage?.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() || 'vid-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { window.localStorage?.setItem(key, id); } catch { /* noop */ }
  }
  return id;
}

async function loadCommunityGallery(sort = 'latest') {
  const grid = document.getElementById('community-grid');
  const empty = document.getElementById('community-empty');
  if (!grid || !empty) return;

  grid.innerHTML = '';
  empty.hidden = true;

  try {
    const creations = await listCreations(24, sort);
    if (!creations || creations.length === 0) {
      empty.hidden = false;
      return;
    }

    const visitorId = getVisitorId();
    const likedIds = new Set();
    try {
      const stored = window.localStorage?.getItem('hf-liked');
      if (stored) JSON.parse(stored).forEach(id => likedIds.add(id));
    } catch { /* noop */ }

    creations.forEach(c => {
      const card = document.createElement('article');
      card.className = 'community-card';
      card.dataset.id = c.id;
      card.innerHTML = `
        <div class="community-card-image">
          <img src="${escapeHtml(c.image_url || '')}" alt="${escapeHtml(c.title || '')}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'padding:40% 0;text-align:center;color:var(--muted)\\'>暂无图片</div>'">
        </div>
        <div class="community-card-body">
          <strong>${escapeHtml(c.title || '未命名作品')}</strong>
          <div class="community-card-tags">
            <span class="tag">${escapeHtml(c.craft_name || '非遗')}</span>
            <span class="tag">${escapeHtml(c.ip_name || 'IP')}</span>
          </div>
          <button class="like-btn${likedIds.has(c.id) ? ' liked' : ''}" data-id="${escapeHtml(c.id)}">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span class="like-count">${c.likes || 0}</span>
          </button>
        </div>`;
      grid.appendChild(card);
    });

    bindLikeButtons(visitorId);
  } catch {
    empty.hidden = false;
    empty.querySelector('p').textContent = '加载失败，请刷新重试';
  }
}

function bindLikeButtons(visitorId) {
  document.querySelectorAll('.like-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (btn.classList.contains('liked')) return;
      btn.classList.add('liked');
      const countEl = btn.querySelector('.like-count');
      const prev = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = prev + 1;

      const result = await likeCreation(id, visitorId);
      if (!result || !result.liked) {
        countEl.textContent = prev;
        if (result?.alreadyLiked) {
          btn.classList.add('liked');
        } else {
          btn.classList.remove('liked');
        }
      }

      try {
        const stored = window.localStorage?.getItem('hf-liked');
        const liked = stored ? JSON.parse(stored) : [];
        if (!liked.includes(id)) { liked.push(id); }
        localStorage.setItem('hf-liked', JSON.stringify(liked));
      } catch { /* noop */ }
    });
  });
}

function bindCommunityGalleryTabs() {
  document.querySelectorAll('.community-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.community-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadCommunityGallery(tab.dataset.sort);
    });
  });
}

// ===== F5: 山河图志（真实省界 + 官方非遗统计） =====
function renderHeritageMap() {
  const container = document.getElementById('heritage-map-svg');
  const detail = document.getElementById('heritage-map-detail');
  const nationwideEl = document.getElementById('heritage-map-nationwide');
  if (!container || !detail) return;

  // 按 region 分组本馆馆藏非遗
  const regionMap = new Map();
  CRAFTS_DATA.forEach(craft => {
    if (!craft.region || craft.region === 'nationwide') return;
    if (!regionMap.has(craft.region)) regionMap.set(craft.region, []);
    regionMap.get(craft.region).push(craft);
  });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 780');
  svg.setAttribute('aria-label', '中国非遗地域分布地图');

  // 绘制所有省份（真实省界）
  Object.entries(PROVINCE_PATHS).forEach(([key, data]) => {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', data.d);
    path.setAttribute('data-region', key);
    path.classList.add('province-path');
    // 本馆有馆藏的省份描金高亮
    if (regionMap.has(key)) path.classList.add('has-heritage');
    // 有官方统计数字的省份淡金填充
    if (PROVINCE_STATS[key]?.count) path.classList.add('has-stats');
    svg.appendChild(path);

    // 省份标签
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', data.cx);
    text.setAttribute('y', data.cy);
    text.classList.add('province-label');
    if (regionMap.has(key)) text.classList.add('has-heritage');
    text.textContent = data.label;
    svg.appendChild(text);
  });

  // 点击省份
  svg.addEventListener('click', (e) => {
    const path = e.target.closest('.province-path');
    if (!path) return;
    const region = path.dataset.region;
    const crafts = regionMap.get(region) || [];
    svg.querySelectorAll('.province-path.active').forEach(p => p.classList.remove('active'));
    path.classList.add('active');
    showRegionDetail(region, crafts, detail);
  });

  // hover tooltip：官方统计（如有）+ 本馆馆藏数
  let tooltip = null;
  svg.addEventListener('mouseover', (e) => {
    const path = e.target.closest('.province-path');
    if (!path) return;
    const region = path.dataset.region;
    const label = PROVINCE_PATHS[region]?.label || region;
    const stats = PROVINCE_STATS[region];
    const crafts = regionMap.get(region) || [];
    const parts = [];
    if (stats?.count) parts.push(`国家级子项 ${stats.count}`);
    if (crafts.length) parts.push(`本馆馆藏 ${crafts.length} 项`);
    if (!parts.length && stats?.famous?.length) parts.push(stats.famous[0]);
    if (tooltip) tooltip.remove();
    tooltip = document.createElement('div');
    tooltip.className = 'heritage-map-tooltip';
    tooltip.textContent = `${label} · ${parts.join(' · ')}`;
    container.style.position = 'relative';
    container.appendChild(tooltip);
  });
  svg.addEventListener('mousemove', (e) => {
    if (!tooltip) return;
    const rect = container.getBoundingClientRect();
    tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
    tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  });

  container.innerHTML = '';
  container.appendChild(svg);

  // 全国总览：官方统计数字 + 全国性馆藏
  if (nationwideEl) {
    const nationwideCrafts = CRAFTS_DATA.filter(c => c.region === 'nationwide');
    nationwideEl.innerHTML = `
      <div class="national-stats">
        <div class="national-stat"><strong>${NATIONAL_STATS.unesco}</strong><span>项列入联合国教科文组织非遗名录 · 世界第一</span></div>
        <div class="national-stat"><strong>${NATIONAL_STATS.nationalProjects}</strong><span>项国家级非遗代表性项目</span></div>
        <div class="national-stat"><strong>${NATIONAL_STATS.subItems}</strong><span>个国家级非遗子项 · ${NATIONAL_STATS.categories} 大门类</span></div>
        <div class="national-stat"><strong>${NATIONAL_STATS.inheritors}</strong><span>名国家级代表性传承人</span></div>
        <div class="national-stat"><strong>${NATIONAL_STATS.allLevels}</strong><span>项国家、省、市、县四级非遗项目</span></div>
      </div>
      <p class="national-stats-source">${NATIONAL_STATS.source}</p>
      <div class="nationwide-crafts"><span>全国性馆藏：</span>${
        nationwideCrafts.map(c =>
          `<a class="nationwide-tag" href="crafts.html?craft=${encodeURIComponent(c.id)}">${c.emoji || ''} ${c.name}</a>`
        ).join('')
      }</div>`;
  }
}

function showRegionDetail(region, crafts, detailEl) {
  const provinceData = PROVINCE_PATHS[region];
  const stats = PROVINCE_STATS[region];
  const label = provinceData?.label || region;
  detailEl.innerHTML = `
    <h3 class="heritage-map-detail-title">${label}</h3>
    ${stats?.count
      ? `<p class="heritage-map-detail-count">国家级非遗代表性项目子项 <strong>${stats.count}</strong> 个</p>`
      : ''}
    ${stats?.note ? `<p class="heritage-map-detail-note">${stats.note}</p>` : ''}
    ${stats?.famous?.length
      ? `<p class="heritage-map-detail-famous">代表非遗：${stats.famous.join('、')}</p>`
      : ''}
    ${crafts.length ? `
      <p class="heritage-map-detail-subtitle">本馆馆藏 ${crafts.length} 项</p>
      <ul class="heritage-map-detail-list">
        ${crafts.map(c => `
          <li>
            <a href="crafts.html?craft=${encodeURIComponent(c.id)}">
              <span class="craft-emoji">${c.emoji || ''}</span>
              <span>${c.name}</span>
            </a>
          </li>
        `).join('')}
      </ul>` : '<p class="heritage-map-detail-empty">本馆暂未收录该地区技艺，敬请期待。</p>'}
  `;
}

// ===== F4: 灵宠聊天浮窗 =====
function bindCompanionChat() {
  const chat = document.getElementById('companion-chat');
  const trigger = document.createElement('button');
  trigger.className = 'companion-trigger';
  trigger.setAttribute('aria-label', '打开小天犬导览');
  trigger.innerHTML = '<span aria-hidden="true">灵</span>';
  trigger.title = '按 C 键或点击打开小天犬导览员';
  document.body.appendChild(trigger);

  const messages = document.getElementById('companion-chat-messages');
  const input = document.getElementById('companion-chat-input');
  const sendBtn = document.getElementById('companion-chat-send');
  const closeBtn = document.getElementById('companion-chat-close');
  let chatHistory = [];

  function openChat() {
    chat.hidden = false;
    trigger.hidden = true;
    input?.focus();
    if (!messages.children.length) {
      addMessage('model', '汪汪！我是小天犬，这座非遗博物馆的导览员~ 有什么关于非遗的问题都可以问我哦！');
    }
  }

  function closeChat() {
    chat.hidden = true;
    trigger.hidden = false;
  }

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `companion-chat-msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addThinking() {
    const div = document.createElement('div');
    div.className = 'companion-chat-msg thinking';
    div.textContent = '小天犬正在思考…';
    div.id = 'companion-thinking';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeThinking() {
    const el = document.getElementById('companion-thinking');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    chatHistory.push({ role: 'user', text });

    sendBtn.disabled = true;
    input.disabled = true;
    addThinking();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory })
      });
      const data = await response.json();
      removeThinking();
      if (data.success && data.reply) {
        addMessage('model', data.reply);
        chatHistory.push({ role: 'model', text: data.reply });
      } else {
        addMessage('model', getFallbackReply());
      }
    } catch {
      removeThinking();
      addMessage('model', getFallbackReply());
    } finally {
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  function getFallbackReply() {
    const replies = [
      '哎呀，我好像走神了~ 你可以问我关于剪纸、皮影、陶瓷等非遗技艺的问题哦！',
      '汪汪！试试问我："剪纸是怎么做的？"或者"推荐一个展厅给我吧"~',
      '现在博物馆里最受欢迎的是景德镇陶瓷展厅，要不要去看看？',
      '你知道吗？中国有44项非遗入选联合国教科文组织人类非物质文化遗产代表作名录哦！'
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  trigger.addEventListener('click', openChat);
  companionChatOpener = openChat;
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // 快捷键 C 切换聊天
  document.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (chat.hidden) openChat();
      else closeChat();
    }
    if (e.key === 'Escape' && !chat.hidden) {
      closeChat();
    }
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

// 暗夜展厅 3D 长廊：仅 cinematic 模式动态挂载，Three.js 保持在首页入口 bundle 之外；
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
        onOpenFeature: (featureId) => {
          openFeatureOverlay(featureId);
        },
        onCompanion: () => {
          companionChatOpener?.();
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

// ===== 功能展厅覆盖层（共创画廊 / 山河图志，由长廊功能门开启） =====
let companionChatOpener = null;
let openOverlayId = null;

function openFeatureOverlay(featureId) {
  const dialog = document.getElementById(`${featureId}-overlay`);
  if (!dialog) return;
  openOverlayId = featureId;
  // 覆盖层打开期间暂停走廊渲染，避免 WebGL 循环在弹层下空转
  sketchCorridorScene?.setRenderPaused(true);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-close-overlay]')?.focus({ preventScroll: true });
}

function bindFeatureOverlays() {
  document.querySelectorAll('.feature-overlay').forEach((dialog) => {
    dialog.querySelector('[data-close-overlay]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      // 点击内容区以外的背板关闭
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      const featureId = openOverlayId;
      openOverlayId = null;
      // 把长廊里那扇功能门带回关上，再视情况恢复渲染
      sketchCorridorScene?.closeFeatureDoor(featureId);
      resumeCorridorIfVisible();
    });
  });
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
