const DEFAULT_FALLBACK = Object.freeze({
  base: '#25282d',
  accent: '#c99a2e',
  line: 'rgba(231, 225, 215, 0.18)'
});

const TEXTURE_FALLBACKS = Object.freeze({
  'floor-stone': { base: '#303845', accent: '#b88a30', line: 'rgba(231, 225, 215, 0.14)' },
  'wall-cloud': { base: '#2a2d33', accent: '#c99a2e', line: 'rgba(231, 225, 215, 0.16)' },
  'ceiling-coffer': { base: '#342d25', accent: '#c99a2e', line: 'rgba(231, 225, 215, 0.14)' },
  'carpet-runner': { base: '#7d2e2a', accent: '#d5aa42', line: 'rgba(255, 232, 176, 0.28)' },
  'feature-wall': { base: '#2c201b', accent: '#d5aa42', line: 'rgba(231, 225, 215, 0.12)' },
  'red-lacquer': { base: '#8f3a31', accent: '#d4a83a', line: 'rgba(255, 232, 176, 0.18)' },
  'brick-gate': { base: '#42484f', accent: '#9ca5ad', line: 'rgba(231, 225, 215, 0.16)' },
  'wood-beam': { base: '#6f4534', accent: '#c99a2e', line: 'rgba(255, 232, 176, 0.16)' },
  'roof-tiles': { base: '#48505a', accent: '#a7a6a2', line: 'rgba(231, 225, 215, 0.14)' },
  'pedestal-stone': { base: '#3a4048', accent: '#c0c7cd', line: 'rgba(231, 225, 215, 0.18)' },
  'banner-silk': { base: '#332b2b', accent: '#b9913c', line: 'rgba(231, 225, 215, 0.14)' }
});

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
  anisotropy = 8
}) {
  const fallback = createMuseumFallbackTexture(THREE, name, repeat, anisotropy);
  const texture = loader.load(
    url,
    (loaded) => {
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
  return configureTexture(THREE, texture, repeat, anisotropy);
}
