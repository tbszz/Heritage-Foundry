const CARRIER_IMAGE_CONFIG = Object.freeze({
  keychain: Object.freeze({ aspectRatio: '1:1' }),
  bag: Object.freeze({ aspectRatio: '1:1' }),
  phone: Object.freeze({ aspectRatio: '3:4' }),
  sticker: Object.freeze({ aspectRatio: '1:1' }),
  magnet: Object.freeze({ aspectRatio: '1:1' }),
  figurine: Object.freeze({ aspectRatio: '3:4' })
});

function getSelectionFingerprint(selection = {}) {
  return [
    selection.craftId,
    selection.ipId,
    selection.carrierId,
    selection.styleId,
    selection.patternWidth,
    selection.patternHeight
  ].map((value) => value || '').join('|');
}

export function createLatestRunGate() {
  let version = 0;

  return {
    start(selection) {
      version += 1;
      return {
        version,
        fingerprint: getSelectionFingerprint(selection)
      };
    },
    invalidate() {
      version += 1;
      return version;
    },
    isCurrent(token, selection) {
      return Boolean(
        token
        && token.version === version
        && token.fingerprint === getSelectionFingerprint(selection)
      );
    }
  };
}

export function getCarrierImageConfig(carrierId) {
  return CARRIER_IMAGE_CONFIG[carrierId] || CARRIER_IMAGE_CONFIG.bag;
}

export function shouldApplyArtworkToCarrier(carrierId) {
  return carrierId !== 'figurine';
}

export async function applyArtworkTexture(scene, imageUrl) {
  try {
    const result = await scene.setTexture(imageUrl);
    return { ok: result?.status === 'loaded', result };
  } catch (error) {
    scene.clearTexture();
    return { ok: false, error };
  }
}

export function shouldRetryThreeDTaskError(error = {}) {
  if (typeof error.retryable === 'boolean') return error.retryable;

  const code = String(error.code || '');
  if (/(?:AUTH_FAILED|CREDITS_EXHAUSTED|INVALID_REQUEST|INVALID_RESPONSE|TASK_NOT_FOUND|NOT_CONFIGURED)$/.test(code)) {
    return false;
  }
  if (/(?:NETWORK_ERROR|TIMEOUT|RATE_LIMITED|UPSTREAM_ERROR)$/.test(code)) return true;
  if (code === 'INVALID_TASK_ID') return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  if (
    error.name === 'TypeError'
    && /failed to fetch|networkerror|network request failed/i.test(String(error.message || ''))
  ) {
    return true;
  }

  const statusCode = Number(error.statusCode);
  return [502, 503, 504].includes(statusCode);
}

export function resolveThreeDStatus({
  carrierId,
  taskActive,
  imageUrl,
  modelUrl,
  errorMessage
} = {}) {
  if (taskActive) return null;
  if (carrierId !== 'figurine') {
    return {
      message: '当前载体使用真实产品网格；图案只进入印花层，完成后可下载带贴图 GLB。',
      isError: false
    };
  }
  if (errorMessage) {
    return { message: errorMessage, isError: true };
  }
  if (!imageUrl) {
    return {
      message: '先生成一张完整、干净背景的手办参考图，再创建真正的 GLB 模型。',
      isError: false
    };
  }
  if (modelUrl) {
    return {
      message: '真实 3D 手办已生成，可旋转查看或下载 GLB。',
      isError: false
    };
  }
  return {
    message: '参考图已就绪，可以提交真实 3D 建模。',
    isError: false
  };
}
