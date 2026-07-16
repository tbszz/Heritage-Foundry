// 共享 GLTF 加载器：public/models/ 下的 GLB 均经过 Draco 几何压缩 +
// WebP 纹理压缩（scripts/compress-models.mjs），必须挂 DRACOLoader 才能解码。
// 解码器文件在 public/draco/（复制自 three/examples/jsm/libs/draco/gltf/）。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let sharedDracoLoader = null;

function getDracoLoader() {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath('/draco/');
  }
  return sharedDracoLoader;
}

export function createGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  return loader;
}

// 空闲时预取模型文件，把字节暖进浏览器 HTTP 缓存（不做内存级 GLTF 缓存，
// 避免与场景切换时的 dispose 逻辑冲突）。弱网 / 省流量模式下自动跳过。
const prefetchedUrls = new Set();

export function prefetchModels(urls, { delayMs = 3000 } = {}) {
  if (typeof window === 'undefined') return;

  const connection = navigator.connection;
  if (connection?.saveData) return;
  if (/(^|-)2g$/.test(connection?.effectiveType || '')) return;

  const queue = urls.filter((url) => url && !prefetchedUrls.has(url));
  queue.forEach((url) => prefetchedUrls.add(url));

  const prefetchNext = () => {
    const url = queue.shift();
    if (!url) return;
    fetch(url, { priority: 'low' })
      .catch(() => prefetchedUrls.delete(url))
      .finally(() => scheduleIdle(prefetchNext));
  };

  const scheduleIdle = (fn) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 10000 });
    } else {
      window.setTimeout(fn, 1500);
    }
  };

  window.setTimeout(() => scheduleIdle(prefetchNext), delayMs);
}
