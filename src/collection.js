const $ = (id) => document.getElementById(id);
let items = [];
let selectedId = '';
let stage = null;
let loadingStage = null;
let version = 0;

function safeAsset(url, prefix, extension) {
  return typeof url === 'string' && url.startsWith(prefix) && !url.includes('..') && new RegExp(`^${prefix}[a-z0-9-]+\\.${extension}$`).test(url);
}

function renderList() {
  const query = $('search').value.trim();
  const category = $('category').value;
  const filtered = items.filter(item => (!category || item.category === category) && `${item.name}${item.category}`.includes(query));
  $('catalog').replaceChildren();
  for (const item of filtered) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'artifact'; button.dataset.id = item.id;
    button.setAttribute('aria-pressed', String(item.id === selectedId));
    const img = document.createElement('img'); img.src = item.previewUrl; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    const caption = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = item.name;
    const categoryText = document.createElement('small'); categoryText.textContent = item.category;
    caption.append(name, categoryText); button.append(img, caption);
    button.addEventListener('click', () => selectItem(item));
    $('catalog').append(button);
  }
  if (!filtered.length) {
    const message = document.createElement('p'); message.textContent = items.length ? '没有找到匹配的器物。' : '新馆正在准备展品，审核后的模型会在这里展出。';
    $('catalog').append(message);
  }
}

async function selectItem(item) {
  selectedId = item.id;
  const run = ++version;
  renderList();
  $('item-name').textContent = item.name;
  $('item-category').textContent = item.category;
  $('item-description').textContent = item.description;
  $('viewer-status').textContent = '正在装载展品…';
  $('download').hidden = true;
  $('retry').hidden = true;
  try {
    if (!loadingStage) loadingStage = import('./components/ArtifactStage.js').then(({ ArtifactStage }) => {
      stage = new ArtifactStage($('stage'), {
        onLoadingChange: (loading) => {
          if (!loading && stage?.model) {
            $('viewer-status').textContent = '拖动旋转 · 双指缩放';
            $('download').href = items.find(entry => entry.id === selectedId).modelUrl;
            $('download').hidden = false;
          }
        },
        onError: () => { $('viewer-status').textContent = '模型加载失败，请重试。'; $('download').hidden = true; $('retry').hidden = false; }
      });
      stage.init();
      stage.setAutoMotionEnabled(false);
      return stage;
    }).catch(error => { loadingStage = null; throw error; });
    await loadingStage;
    if (run !== version) return;
    // Release the previous asset before loading the next: one resident model only.
    if (stage.model) { stage.scene.remove(stage.model); stage.disposeObject(stage.model); stage.model = null; stage.renderOnce(); }
    stage.setModel(item.modelUrl);
    history.replaceState(null, '', `?item=${encodeURIComponent(item.id)}`);
  } catch (_error) { $('viewer-status').textContent = '三维展示暂不可用，请重试。'; $('retry').hidden = false; }
}

$('search').addEventListener('input', renderList);
$('category').addEventListener('change', renderList);
$('retry').addEventListener('click', () => { const item = items.find(item => item.id === selectedId); if (item) selectItem(item); });
window.addEventListener('pagehide', () => { version++; stage?.dispose(); stage = null; loadingStage = null; });
window.addEventListener('pageshow', (event) => { if (event.persisted) { const item = items.find(item => item.id === selectedId); if (item) selectItem(item); } });

async function loadCatalog() {
try {
  const response = await fetch('/data/heritage-collection.json');
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (!Array.isArray(catalog.items)) throw new Error('Invalid catalog');
  items = catalog.items.filter(item => (item.visualReview === 'approved' || (item.publicationStatus === 'published' && item.technicalCheck === 'passed')) && safeAsset(item.modelUrl, '/models/heritage/', 'glb') && safeAsset(item.previewUrl, '/assets/heritage/', 'webp'));
  $('collection-count').textContent = `${items.length} 件已入馆 · 持续收藏百工之美`;
  for (const category of new Set(items.map(item => item.category))) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('category').append(option); }
  renderList();
  const requested = new URLSearchParams(location.search).get('item');
  const initial = items.find(item => item.id === requested) || items[0];
  if (initial) selectItem(initial);
} catch (_error) { $('collection-count').textContent = '馆藏目录暂时无法读取，请刷新重试。'; }
}
loadCatalog();
