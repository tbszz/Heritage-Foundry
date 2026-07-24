import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  create3DGenerationTask,
  generateImage,
  get3DCapabilities,
  get3DGenerationTask
} from '../src/utils/apiService.js';

const generatorJs = readFileSync(new URL('../src/generator.js', import.meta.url), 'utf8');

describe('real 3D generator client', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a 3D task from the generated reference image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        task: { id: 'task-1', status: 'queued', progress: 0 }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const task = await create3DGenerationTask('data:image/png;base64,reference', {
      carrier: 'figurine'
    });

    expect(task).toEqual({ id: 'task-1', status: 'queued', progress: 0 });
    expect(fetchMock).toHaveBeenCalledWith('/api/generate-3d', expect.objectContaining({
      method: 'POST'
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      image_url: 'data:image/png;base64,reference',
      carrier: 'figurine'
    });
  });

  it('explains how to recover when the local image API is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new TypeError('Failed to fetch')
    ));

    await expect(generateImage('test prompt')).rejects.toThrow(
      '无法连接本地生成服务，请确认已通过 npm run dev 启动前后端'
    );
  });

  it('loads a provider-safe 3D capability summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        capabilities: {
          provider: 'local',
          configured: false,
          ready: false,
          outputFormat: 'glb',
          textured: true,
          pbr: true
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(get3DCapabilities()).resolves.toMatchObject({
      provider: 'local',
      configured: false,
      ready: false
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/3d-capabilities', expect.any(Object));
  });

  it('polls an encoded task id and returns its normalized GLB result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        task: {
          id: 'task/id',
          status: 'succeeded',
          progress: 100,
          modelUrl: 'https://assets.example/figurine.glb'
        }
      })
    }));

    const task = await get3DGenerationTask('task/id');

    expect(fetch).toHaveBeenCalledWith('/api/generate-3d/task%2Fid', expect.any(Object));
    expect(task.modelUrl).toBe('https://assets.example/figurine.glb');
  });

  it('keeps a run token so stale task results cannot replace the current carrier', () => {
    expect(generatorJs).toContain('threeDTaskRunGate');
    expect(generatorJs).toContain('threeDTaskRunGate.isCurrent');
    expect(generatorJs).not.toContain('threeDTaskRunId');
    expect(generatorJs).toContain('threeScene.setGeneratedModel(task.modelUrl)');
    expect(generatorJs).toContain('threeScene?.clearTexture()');
  });

  it('waits for artwork application and revokes the local product GLB download URL', () => {
    expect(generatorJs).toContain('await applyArtworkTexture(threeScene, currentImageUrl)');
    expect(generatorJs).toContain('await threeScene.exportCurrentModel()');
    expect(generatorJs).toContain('URL.revokeObjectURL(downloadUrl)');
  });

  it('keeps the successful image when only the downstream 3D texture application fails', () => {
    expect(generatorJs).toContain('图案已生成，但 3D 贴图加载失败');
  });

  it('retries a bounded number of transient Meshy polling failures', () => {
    expect(generatorJs).toContain('threeDTransientFailures');
    expect(generatorJs).toContain('shouldRetryThreeDTaskError(error)');
    expect(generatorJs).toContain('THREE_D_MAX_TRANSIENT_FAILURES');
  });

  it('checks server-side 3D capabilities before enabling figurine generation', () => {
    expect(generatorJs).toContain('loadThreeDCapabilities');
    expect(generatorJs).toContain('threeDCapabilities.ready');
    expect(generatorJs).not.toContain("error.code === 'MESHY_NOT_CONFIGURED'");
  });

  it('guards decoded pattern results with a latest-selection token', () => {
    expect(generatorJs).toContain('const patternRunGate = createLatestRunGate()');
    expect(generatorJs).toContain('patternRunGate.invalidate()');
    expect(generatorJs).toContain('const isCurrentPatternRequest = () =>');
    expect(generatorJs).toContain('patternWidth: latestSize.width');
    expect(generatorJs).toContain('patternHeight: latestSize.height');
    expect(generatorJs).toContain('patternRunGate.isCurrent(patternToken, {');
  });

  it('synchronizes enhanced choice chips after applying URL parameters', () => {
    expect(generatorJs).toContain('syncEnhancedSelect(craftSelect)');
    expect(generatorJs).toContain('syncEnhancedSelect(carrierSelect)');
  });
});
