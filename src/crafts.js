import { ThreeScene } from './components/ThreeScene.js';
import { CRAFTS_DATA, getCraftById } from './utils/craftData.js';

let craftThreeScene = null;
let currentCraft = null;

function init() {
  initCraftSidebar();
  bindEvents();
  initCraftThreeScene();
  selectInitialCraft();
}

function initCraftThreeScene() {
  if (craftThreeScene) return;
  
  const container = document.getElementById('craft-three-container');
  if (container) {
    craftThreeScene = new ThreeScene(container);
    craftThreeScene.init();
  }
}

function initCraftSidebar() {
  const sidebarList = document.getElementById('craft-sidebar-list');
  if (!sidebarList) return;

  CRAFTS_DATA.forEach((craft) => {
    const item = document.createElement('div');
    item.className = 'craft-sidebar-item';
    item.dataset.id = craft.id;
    
    item.innerHTML = `
      <div class="craft-sidebar-icon">${craft.emoji}</div>
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
  return params.get('craft') || CRAFTS_DATA[0]?.id || '';
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

  initCraftThreeScene();

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
}

function handleCreateProduct(product) {
  const carrierMap = {
    keychain: 'keychain',
    bag: 'bag',
    phone: 'phone',
    sticker: 'sticker',
    magnet: 'magnet'
  };
  
  const craftMap = {
    'tiger-head': 'papercut',
    'papercut': 'papercut',
    'shadow': 'shadow',
    'embroidery': 'embroidery',
    'tie-dye': 'tie-dye',
    'porcelain': 'porcelain',
    'calligraphy': 'calligraphy',
    'seal': 'seal',
    'brocade': 'brocade',
    'clay': 'clay',
    'tea': 'tea',
    'kites': 'papercut',
    'lanterns': 'papercut',
    'wood-carving': 'papercut',
    'stone-carving': 'papercut',
    'new-year': 'new-year',
    'tangka': 'tangka',
    'jade': 'papercut'
  };
  
  const carrier = carrierMap[product] || 'keychain';
  const craft = craftMap[currentCraft?.id] || 'papercut';
  
  window.location.href = `generator.html?craft=${craft}&carrier=${carrier}`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
