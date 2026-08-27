const DEFAULT_FALLBACK = Object.freeze({
  base: '#25282d',
  accent: '#c99a2e',
  line: 'rgba(231, 225, 215, 0.18)'
});

const TEXTURE_FALLBACKS = Object.freeze({
  'floor-stone': { base: '#363431', accent: '#88745a', line: 'rgba(224, 215, 201, 0.12)' },
  'wall-cloud': { base: '#8a7e6e', accent: '#786249', line: 'rgba(242, 233, 219, 0.12)' },
  'ceiling-coffer': { base: '#3e3027', accent: '#82694a', line: 'rgba(235, 218, 191, 0.12)' },
  'carpet-runner': { base: '#493d38', accent: '#8b493e', line: 'rgba(206, 184, 151, 0.2)' },
  'feature-wall': { base: '#51433a', accent: '#9a7650', line: 'rgba(231, 225, 215, 0.12)' },
  'red-lacquer': { base: '#713b34', accent: '#947451', line: 'rgba(235, 205, 170, 0.14)' },
  'wood-beam': { base: '#49362c', accent: '#725641', line: 'rgba(232, 214, 190, 0.12)' },
  'pedestal-stone': { base: '#323333', accent: '#706c65', line: 'rgba(225, 222, 214, 0.12)' },
  'banner-silk': { base: '#34383a', accent: '#8b4a3f', line: 'rgba(224, 211, 190, 0.12)' }
});

export function getMuseumRenderBudget({
  experienceMode = 'cinematic',
  devicePixelRatio = 1,
  maxAnisotropy = 4
} = {}) {
  const lite = experienceMode === 'lite';
  const ratioCap = lite ? 1.15 : 1.5;
  const anisotropyCap = lite ? 2 : 4;
  return {
    pixelRatio: Math.min(Math.max(Number(devicePixelRatio) || 1, 1), ratioCap),
    anisotropy: Math.min(Math.max(Number(maxAnisotropy) || 1, 1), anisotropyCap)
  };
}

export function getMuseumTextureFallbackColors(name) {
  return {
    ...DEFAULT_FALLBACK,
    ...(TEXTURE_FALLBACKS[name] || {})
  };
}

function configureTexture(THREE, texture, repeat = [1, 1], anisotropy = 8) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createMuseumFallbackTexture(THREE, name, repeat = [1, 1], anisotropy = 8) {
  if (typeof document === 'undefined') return null;

  const colors = getMuseumTextureFallbackColors(name);
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 192, 192);
  gradient.addColorStop(0, colors.base);
  gradient.addColorStop(1, '#1f2328');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 192);

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  for (let offset = -192; offset <= 192; offset += 32) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 192, 192);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = name === 'carpet-runner' || name === 'feature-wall' ? 0.36 : 0.22;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(96, 96, 42, Math.PI * 0.15, Math.PI * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(96, 96, 22, Math.PI * 0.3, Math.PI * 1.7);
  ctx.stroke();
  ctx.globalAlpha = 1;

  return configureTexture(THREE, new THREE.CanvasTexture(canvas), repeat, anisotropy);
}

export function loadManagedMuseumTexture({
  THREE,
  loader,
  renderer,
  url,
  name,
  repeat = [1, 1],
  anisotropy = 8,
  cache = null
}) {
  const cacheKey = `${url}|${repeat[0]}x${repeat[1]}|${anisotropy}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const fallback = createMuseumFallbackTexture(THREE, name, repeat, anisotropy);
  const texture = loader.load(
    url,
    (loaded) => {
      // 回退图(192px)首次上传时 WebGL2 用 texStorage2D 按 192 不可变分配；
      // 真实贴图尺寸不同，直接换 image 会让 texSubImage2D 因尺寸不匹配报 GL_INVALID_VALUE，
      // 导致 GPU 永远停在回退图。先 dispose 释放旧分配，让 three 按真实尺寸重新分配。
      loaded.dispose();
      configureTexture(THREE, loaded, repeat, anisotropy);
      renderer?.initTexture?.(loaded);
    },
    undefined,
    () => {
      if (!fallback?.image) return;
      texture.image = fallback.image;
      configureTexture(THREE, texture, repeat, anisotropy);
      renderer?.initTexture?.(texture);
    }
  );

  if (fallback?.image) {
    texture.image = fallback.image;
  }
  configureTexture(THREE, texture, repeat, anisotropy);
  cache?.set(cacheKey, texture);
  return texture;
}
