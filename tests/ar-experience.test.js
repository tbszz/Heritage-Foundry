import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import {
  calculateArScale,
  parseArRequest,
  resolveArActionState,
  waitForGeneratedModel
} from '../src/ar.js';

const arHtml = readFileSync(new URL('../src/ar.html', import.meta.url), 'utf8');

const EXPECTED_AR_PRESETS = {
  'tiger-head': ['floor', 0.28],
  papercut: ['wall', 0.4],
  shadow: ['floor', 0.45],
  embroidery: ['wall', 0.32],
  'tie-dye': ['wall', 0.6],
  porcelain: ['floor', 0.4],
  calligraphy: ['floor', 0.35],
  seal: ['floor', 0.12],
  brocade: ['wall', 0.6],
  clay: ['floor', 0.28],
  tea: ['floor', 0.24],
  kites: ['wall', 0.7],
  lanterns: ['floor', 0.36],
  'wood-carving': ['floor', 0.4],
  'stone-carving': ['wall', 0.45],
  'new-year': ['wall', 0.55],
  tangka: ['wall', 0.65],
  jade: ['floor', 0.24]
};

describe('AR request contract', () => {
  it('uses a generated task before the craft fallback', () => {
    expect(parseArRequest('?task=local%3Atask-1&craft=tangka')).toEqual({
      kind: 'task',
      taskId: 'local:task-1',
      craftId: 'tangka'
    });
  });

  it('does not turn an explicitly invalid task request into a collection request', () => {
    expect(parseArRequest('?task=&craft=jade')).toEqual({
      kind: 'task',
      taskId: '',
      craftId: 'jade'
    });
  });

  it('selects a known collection craft', () => {
    expect(parseArRequest('?craft=jade')).toEqual({
      kind: 'craft',
      craftId: 'jade'
    });
  });

  it('falls back to porcelain for an unknown craft', () => {
    expect(parseArRequest('?craft=unknown')).toEqual({
      kind: 'craft',
      craftId: 'porcelain'
    });
  });
});

describe('AR model scale', () => {
  it('scales the longest model edge to the target meter size', () => {
    expect(calculateArScale({ x: 0.5, y: 1, z: 0.25 }, 0.25)).toBeCloseTo(0.25);
  });

  it('keeps unit scale when dimensions or target size are invalid', () => {
    expect(calculateArScale({ x: 0, y: 0, z: 0 }, 0.25)).toBe(1);
    expect(calculateArScale({ x: 1, y: 1, z: 1 }, -1)).toBe(1);
  });
});

describe('AR capability action', () => {
  it('surfaces model errors instead of leaving the action in a loading state', () => {
    expect(resolveArActionState({
      modelLoaded: false,
      modelError: true,
      mobileLike: true,
      canActivateAR: true
    })).toEqual({
      mode: 'error',
      label: '模型暂不可用',
      disabled: true
    });
  });

  it('keeps the primary action disabled until the model loads', () => {
    expect(resolveArActionState({ modelLoaded: false, mobileLike: true, canActivateAR: true })).toEqual({
      mode: 'loading',
      label: '正在装载藏品',
      disabled: true
    });
  });

  it('offers spatial placement on a compatible mobile device', () => {
    expect(resolveArActionState({ modelLoaded: true, mobileLike: true, canActivateAR: true })).toEqual({
      mode: 'ar',
      label: '放进现实空间',
      disabled: false
    });
  });

  it('uses an honest 3D fallback on unsupported mobile devices', () => {
    expect(resolveArActionState({ modelLoaded: true, mobileLike: true, canActivateAR: false })).toEqual({
      mode: 'unsupported',
      label: '此设备暂不支持空间摆放',
      disabled: true
    });
  });

  it('offers a phone handoff on desktop', () => {
    expect(resolveArActionState({ modelLoaded: true, mobileLike: false, canActivateAR: false })).toEqual({
      mode: 'copy',
      label: '复制手机体验链接',
      disabled: false
    });
  });
});

describe('generated AR task polling', () => {
  it('rejects a missing task id without polling', async () => {
    const fetchTask = vi.fn();
    await expect(waitForGeneratedModel('', { fetchTask })).rejects.toMatchObject({
      message: '缺少 3D 任务编号',
      retryable: false
    });
    expect(fetchTask).not.toHaveBeenCalled();
  });

  it('polls a processing task until its model is available', async () => {
    const fetchTask = vi.fn()
      .mockResolvedValueOnce({ id: 'task-1', status: 'processing', progress: 64 })
      .mockResolvedValueOnce({ id: 'task-1', status: 'succeeded', progress: 100, modelUrl: '/model.glb' });
    const pause = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    await expect(waitForGeneratedModel('task-1', {
      fetchTask,
      pause,
      now: () => 0,
      onProgress
    })).resolves.toMatchObject({ modelUrl: '/model.glb' });
    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(3000);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ progress: 64 }));
  });

  it('does not silently fall back when a generated task fails', async () => {
    await expect(waitForGeneratedModel('task-2', {
      fetchTask: async () => ({ id: 'task-2', status: 'failed', error: '建模失败' }),
      pause: async () => {},
      now: () => 0
    })).rejects.toMatchObject({ message: '建模失败', retryable: false });
  });

  it('treats a missing backend task as terminal even without a retryable flag', async () => {
    const error = Object.assign(new Error('3D 生成任务不存在'), { code: 'TASK_NOT_FOUND' });
    const fetchTask = vi.fn().mockRejectedValue(error);

    await expect(waitForGeneratedModel('gone-task', {
      fetchTask,
      pause: async () => {},
      now: () => 0
    })).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    expect(fetchTask).toHaveBeenCalledTimes(1);
  });

  it('tolerates at most three consecutive transient read failures', async () => {
    const fetchTask = vi.fn()
      .mockRejectedValueOnce(new Error('network-1'))
      .mockRejectedValueOnce(new Error('network-2'))
      .mockRejectedValueOnce(new Error('network-3'))
      .mockResolvedValueOnce({ id: 'task-3', status: 'succeeded', modelUrl: '/model.glb' });

    await expect(waitForGeneratedModel('task-3', {
      fetchTask,
      pause: async () => {},
      now: () => 0
    })).resolves.toMatchObject({ modelUrl: '/model.glb' });

    await expect(waitForGeneratedModel('task-4', {
      fetchTask: async () => { throw new Error('network'); },
      pause: async () => {},
      now: () => 0
    })).rejects.toThrow('network');
  });
});

describe('AR collection metadata', () => {
  it('defines the approved placement and size for every GLB collection item', () => {
    const presets = Object.fromEntries(
      CRAFTS_DATA
        .filter((craft) => craft.modelUrl)
        .map((craft) => [craft.id, [craft.arPlacement, craft.arSizeMeters]])
    );

    expect(presets).toEqual(EXPECTED_AR_PRESETS);
  });
});

describe('AR page markup', () => {
  it('exposes capability and recovery status controls', () => {
    expect(arHtml).toContain('id="ar-status"');
    expect(arHtml).toContain('id="ar-primary-action"');
    expect(arHtml).toContain('id="ar-retry-button"');
    expect(arHtml).toContain('aria-live="polite"');
  });

  it('uses the museum AR layout and its dedicated responsive styles', () => {
    expect(arHtml).toContain('href="ar.css"');
    expect(arHtml).toContain('class="ar-layout"');
    expect(arHtml).toContain('class="ar-measure-ring"');
    expect(arHtml).toContain('id="ar-source-section"');
  });

  it('keeps the cross-platform AR modes and touch scrolling contract', () => {
    expect(arHtml).toContain('ar-modes="webxr scene-viewer quick-look"');
    expect(arHtml).toContain('touch-action="pan-y"');
    expect(arHtml).not.toContain('iOS 的 AR Quick Look 需 USDZ 模型（规划中）');
  });
});
