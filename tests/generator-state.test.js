import { describe, expect, it, vi } from 'vitest';
import {
  applyArtworkTexture,
  createLatestRunGate,
  getCarrierImageConfig,
  resolveThreeDStatus,
  shouldRetryThreeDTaskError,
  shouldApplyArtworkToCarrier
} from '../src/utils/generatorState.js';

describe('generator request state', () => {
  it('rejects an old image response after the selection changes', () => {
    const gate = createLatestRunGate();
    const first = gate.start({ craftId: 'papercut', carrierId: 'bag' });

    gate.invalidate();
    const second = gate.start({ craftId: 'embroidery', carrierId: 'phone' });

    expect(gate.isCurrent(first, { craftId: 'papercut', carrierId: 'bag' })).toBe(false);
    expect(gate.isCurrent(second, { craftId: 'embroidery', carrierId: 'phone' })).toBe(true);
    expect(gate.isCurrent(second, { craftId: 'papercut', carrierId: 'bag' })).toBe(false);
  });

  it('rejects an old pattern result after the selection changes during image decoding', async () => {
    const gate = createLatestRunGate();
    const initialSelection = { craftId: 'papercut', carrierId: 'bag' };
    const changedSelection = { craftId: 'embroidery', carrierId: 'phone' };
    let currentSelection = initialSelection;
    const oldPattern = gate.start(initialSelection);
    let resolveDecodedImage;
    const decodedImage = new Promise((resolve) => { resolveDecodedImage = resolve; });
    const pendingCommit = decodedImage.then((pattern) => (
      gate.isCurrent(oldPattern, currentSelection) ? pattern : null
    ));

    gate.invalidate();
    currentSelection = changedSelection;
    resolveDecodedImage(['old-pattern']);

    await expect(pendingCommit).resolves.toBeNull();
  });

  it('invalidates a pattern result when its requested board size changes', () => {
    const gate = createLatestRunGate();
    const selection = { craftId: 'papercut', ipId: 'nezha', carrierId: 'keychain', styleId: 'chinese' };
    const token = gate.start({ ...selection, patternWidth: 48, patternHeight: 48 });

    expect(gate.isCurrent(token, { ...selection, patternWidth: 48, patternHeight: 48 })).toBe(true);
    expect(gate.isCurrent(token, { ...selection, patternWidth: 64, patternHeight: 64 })).toBe(false);
  });

  it('does not apply a completed 3D task after the carrier changes', async () => {
    const gate = createLatestRunGate();
    const figurineSelection = {
      craftId: 'clay',
      ipId: 'monkey-king',
      carrierId: 'figurine',
      styleId: 'cute'
    };
    let currentSelection = figurineSelection;
    const run = gate.start(figurineSelection);
    let resolveTask;
    const taskResult = new Promise((resolve) => { resolveTask = resolve; });
    const scene = { setGeneratedModel: vi.fn() };
    const pendingCommit = taskResult.then(async (task) => {
      if (!gate.isCurrent(run, currentSelection)) return { status: 'stale' };
      await scene.setGeneratedModel(task.modelUrl);
      return { status: 'applied' };
    });

    gate.invalidate();
    currentSelection = { ...figurineSelection, carrierId: 'bag' };
    resolveTask({ modelUrl: '/generated/stale-figurine.glb' });

    await expect(pendingCommit).resolves.toEqual({ status: 'stale' });
    expect(scene.setGeneratedModel).not.toHaveBeenCalled();
  });

  it('keeps a 3D provider error visible after the task stops', () => {
    expect(resolveThreeDStatus({
      carrierId: 'figurine',
      taskActive: false,
      imageUrl: 'data:image/jpeg;base64,abc',
      modelUrl: null,
      errorMessage: '真实 3D 服务尚未配置'
    })).toMatchObject({
      message: '真实 3D 服务尚未配置',
      isError: true
    });
  });

  it('uses carrier-specific generation proportions', () => {
    expect(getCarrierImageConfig('keychain')).toMatchObject({ aspectRatio: '1:1' });
    expect(getCarrierImageConfig('phone')).toMatchObject({ aspectRatio: '3:4' });
    expect(getCarrierImageConfig('figurine')).toMatchObject({ aspectRatio: '3:4' });
    expect(getCarrierImageConfig('bag')).toMatchObject({ aspectRatio: '1:1' });
    expect(getCarrierImageConfig('magnet')).toMatchObject({ aspectRatio: '1:1' });
  });

  it('keeps a figurine reference in the reference panel until a real GLB exists', () => {
    expect(shouldApplyArtworkToCarrier('figurine')).toBe(false);
    expect(shouldApplyArtworkToCarrier('bag')).toBe(true);
    expect(shouldApplyArtworkToCarrier('magnet')).toBe(true);
  });

  it('keeps a generated image usable when applying it to the 3D material fails', async () => {
    const textureError = new Error('texture decode failed');
    const scene = {
      setTexture: vi.fn().mockRejectedValue(textureError),
      clearTexture: vi.fn()
    };

    await expect(applyArtworkTexture(scene, 'data:image/png;base64,abc')).resolves.toEqual({
      ok: false,
      error: textureError
    });
    expect(scene.clearTexture).toHaveBeenCalledOnce();
  });

  it.each([
    [{ code: 'MESHY_NETWORK_ERROR' }, true],
    [{ code: 'MESHY_TIMEOUT' }, true],
    [{ code: 'MESHY_RATE_LIMITED' }, true],
    [{ statusCode: 503 }, true],
    [{ name: 'AbortError' }, true],
    [{ name: 'TypeError', message: 'Failed to fetch' }, true],
    [{ code: 'MESHY_AUTH_FAILED', statusCode: 502 }, false],
    [{ code: 'MESHY_CREDITS_EXHAUSTED', statusCode: 402 }, false],
    [{ code: 'MESHY_INVALID_REQUEST', statusCode: 400 }, false],
    [{ code: 'LOCAL_3D_NETWORK_ERROR' }, true],
    [{ code: 'LOCAL_3D_TIMEOUT' }, true],
    [{ code: 'LOCAL_3D_RATE_LIMITED' }, true],
    [{ code: 'LOCAL_3D_AUTH_FAILED', statusCode: 502 }, false],
    [{ code: 'LOCAL_3D_NOT_CONFIGURED', statusCode: 503 }, false],
    [{ code: 'LOCAL_3D_INVALID_RESPONSE', statusCode: 502 }, false]
  ])('classifies transient 3D polling error %j as retryable=%s', (error, expected) => {
    expect(shouldRetryThreeDTaskError(error)).toBe(expected);
  });
});
