import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function createMinimalGlb() {
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }],
    buffers: [{ byteLength: 36 }]
  };
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const binary = Buffer.alloc(36);
  const glb = Buffer.alloc(12 + 8 + paddedLength + 8 + binary.length, 0x20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  const binaryHeader = 20 + paddedLength;
  glb.writeUInt32LE(binary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb;
}

function createEmptyGlb() {
  const json = Buffer.from('{"asset":{"version":"2.0"}}', 'utf8');
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(12 + 8 + paddedLength, 0x20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  return glb;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Meshy 3D service', () => {
  it('creates a textured PBR GLB task from an image data URL', async () => {
    process.env.MESHY_API_KEY = 'server-only-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'task-123' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = await import('../services/threeDService.js');
    const task = await service.createImageTo3DTask('data:image/png;base64,abc123', {
      pose_mode: 'a-pose'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.meshy.ai/openapi/v1/image-to-3d',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer server-only-test-key',
          'Content-Type': 'application/json'
        })
      })
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      image_url: 'data:image/png;base64,abc123',
      ai_model: 'latest',
      model_type: 'standard',
      should_texture: true,
      enable_pbr: true,
      hd_texture: true,
      remove_lighting: true,
      should_remesh: true,
      target_polycount: 100000,
      auto_size: true,
      origin_at: 'bottom',
      pose_mode: 'a-pose',
      target_formats: ['glb']
    });
    expect(task).toEqual({
      id: 'task-123',
      provider: 'meshy',
      status: 'queued',
      progress: 0,
      modelUrl: null,
      previewUrl: null,
      error: null
    });
  });

  it.each([
    ['PENDING', 'queued'],
    ['IN_PROGRESS', 'processing'],
    ['SUCCEEDED', 'succeeded'],
    ['FAILED', 'failed'],
    ['CANCELED', 'canceled'],
    ['CANCELLED', 'canceled']
  ])('normalizes Meshy status %s to %s', async (providerStatus, expectedStatus) => {
    process.env.MESHY_API_KEY = 'test-key';
    const service = await import('../services/threeDService.js');

    expect(service.normalizeMeshyStatus(providerStatus)).toBe(expectedStatus);
  });

  it('extracts the GLB and preview URL from a completed task', async () => {
    process.env.MESHY_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'task-456',
        status: 'SUCCEEDED',
        progress: 100,
        model_urls: { glb: 'https://cdn.example/model.glb' },
        thumbnail_url: 'https://cdn.example/preview.png'
      })
    }));

    const service = await import('../services/threeDService.js');
    const task = await service.getImageTo3DTask('task-456');

    expect(task).toEqual({
      id: 'task-456',
      provider: 'meshy',
      status: 'succeeded',
      progress: 100,
      modelUrl: 'https://cdn.example/model.glb',
      previewUrl: 'https://cdn.example/preview.png',
      error: null
    });
  });

  it('marks a completed provider task without a GLB as failed', async () => {
    process.env.MESHY_API_KEY = 'test-key';
    const service = await import('../services/threeDService.js');

    expect(service.normalizeMeshyTask({
      id: 'task-missing-glb',
      status: 'SUCCEEDED',
      progress: 100,
      model_urls: {}
    })).toMatchObject({
      status: 'failed',
      modelUrl: null,
      error: '3D 任务已完成，但没有返回 GLB 模型'
    });
  });

  it.each([undefined, '', 'MYSTERY_STATE'])(
    'rejects a Meshy task with invalid provider status %s',
    async (status) => {
      process.env.MESHY_API_KEY = 'test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'task-invalid-status', status })
      }));
      const service = await import('../services/threeDService.js');

      await expect(service.getImageTo3DTask('task-invalid-status')).rejects.toMatchObject({
        statusCode: 502,
        code: 'MESHY_INVALID_RESPONSE'
      });
    }
  );

  it('reports malformed provider JSON as an invalid response', async () => {
    process.env.MESHY_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); }
    }));
    const service = await import('../services/threeDService.js');

    await expect(service.getImageTo3DTask('bad-json')).rejects.toMatchObject({
      statusCode: 502,
      code: 'MESHY_INVALID_RESPONSE'
    });
  });

  it('fails with a safe 503 when the server key is missing', async () => {
    delete process.env.MESHY_API_KEY;
    const service = await import('../services/threeDService.js');

    await expect(service.createImageTo3DTask('https://example.com/reference.png'))
      .rejects.toMatchObject({
        statusCode: 503,
        code: 'MESHY_NOT_CONFIGURED'
      });
  });

  it('uses the local sidecar without sending the Meshy key when explicitly selected', async () => {
    process.env.THREE_D_PROVIDER = ' local ';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    process.env.LOCAL_3D_API_KEY = 'local-server-token';
    process.env.MESHY_API_KEY = 'must-not-leak';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'local-task-1', status: 'queued', progress: 0 })
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    const task = await service.createImageTo3DTask('data:image/png;base64,bG9jYWwtcmVmZXJlbmNl', {
      target_polycount: 80000
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7861/v1/image-to-3d',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer local-server-token',
          'Content-Type': 'application/json'
        })
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('must-not-leak');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      image_url: 'data:image/png;base64,bG9jYWwtcmVmZXJlbmNl',
      output_format: 'glb',
      texture: true,
      pbr: true,
      remesh: true,
      target_polycount: 80000
    });
    expect(task).toEqual({
      id: 'local:bG9jYWwtdGFzay0x',
      provider: 'local',
      status: 'queued',
      progress: 0,
      modelUrl: null,
      previewUrl: null,
      error: null
    });
  });

  it('keeps local task routing stable and exposes only a same-origin GLB proxy while polling', async () => {
    process.env.THREE_D_PROVIDER = 'meshy';
    process.env.LOCAL_3D_BASE_URL = 'http://localhost:7861';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'job/with?chars#1',
        status: 'succeeded',
        progress: 100,
        model_url: '/models/figurine.glb',
        preview_url: '/previews/figurine.png',
        debug: { api_key: 'never-return-this' }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    const task = await service.getImageTo3DTask('local:am9iL3dpdGg_Y2hhcnMjMQ');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7861/v1/image-to-3d/job%2Fwith%3Fchars%231',
      expect.any(Object)
    );
    expect(task).toEqual({
      id: 'local:am9iL3dpdGg_Y2hhcnMjMQ',
      provider: 'local',
      status: 'succeeded',
      progress: 100,
      modelUrl: '/api/generate-3d/local%3Aam9iL3dpdGg_Y2hhcnMjMQ/artifacts/model.glb',
      previewUrl: null,
      error: null
    });
    expect(JSON.stringify(task)).not.toContain('never-return-this');
  });

  it('preserves a bounded local engine failure reason for the figurine status UI', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'failed-local-task',
        status: 'failed',
        progress: 42,
        error: 'GPU 显存不足，请关闭占用显卡的程序后重试'
      })
    }));
    const service = await import('../services/threeDService.js');

    const task = await service.getImageTo3DTask('local:ZmFpbGVkLWxvY2FsLXRhc2s');

    expect(task).toMatchObject({
      status: 'failed',
      progress: 42,
      error: 'GPU 显存不足，请关闭占用显卡的程序后重试'
    });
  });

  it.each([
    [{ THREE_D_PROVIDER: 'local' }, 'LOCAL_3D_NOT_CONFIGURED'],
    [{ THREE_D_PROVIDER: 'unknown' }, 'THREE_D_PROVIDER_INVALID']
  ])('rejects invalid provider configuration without contacting an upstream', async (settings, code) => {
    delete process.env.MESHY_API_KEY;
    delete process.env.LOCAL_3D_BASE_URL;
    Object.assign(process.env, settings);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    await expect(service.createImageTo3DTask('https://example.com/reference.png'))
      .rejects.toMatchObject({ statusCode: 503, code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-loopback local sidecar unless remote access is explicitly enabled', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://169.254.169.254/latest';
    delete process.env.LOCAL_3D_ALLOW_REMOTE;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    await expect(service.createImageTo3DTask('https://example.com/reference.png'))
      .rejects.toMatchObject({ statusCode: 503, code: 'LOCAL_3D_INVALID_BASE_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports provider capabilities without exposing keys or the sidecar URL', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861/private';
    process.env.LOCAL_3D_API_KEY = 'capability-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1',
        ready: true,
        imageTo3D: { formats: ['glb'], pbr: true, texturing: true }
      })
    }));
    const service = await import('../services/threeDService.js');

    const capabilities = await service.getCapabilities();

    expect(capabilities).toEqual({
      provider: 'local',
      configured: true,
      ready: true,
      outputFormat: 'glb',
      textured: true,
      pbr: true
    });
    expect(JSON.stringify(capabilities)).not.toContain('capability-secret');
    expect(JSON.stringify(capabilities)).not.toContain('127.0.0.1');
  });

  it('accepts honest vertex-color PBR output without claiming a texture map', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1',
        ready: true,
        imageTo3D: {
          formats: ['glb'],
          pbr: true,
          texturing: false,
          vertexColors: true
        }
      })
    }));
    const service = await import('../services/threeDService.js');

    await expect(service.getCapabilities()).resolves.toEqual({
      provider: 'local',
      configured: true,
      ready: true,
      outputFormat: 'glb',
      textured: false,
      vertexColored: true,
      pbr: true
    });
  });

  it('keeps local generation disabled when the sidecar capability contract is incompatible', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '2',
        ready: true,
        imageTo3D: { formats: ['obj'], pbr: false, texturing: false }
      })
    }));
    const service = await import('../services/threeDService.js');

    await expect(service.getCapabilities()).resolves.toEqual({
      provider: 'local',
      configured: true,
      ready: false,
      outputFormat: 'glb',
      textured: false,
      pbr: true
    });
  });

  it('keeps an upstream local-prefixed task id byte-for-byte through public encoding', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'local:abc', status: 'queued', progress: 0 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'local:abc', status: 'processing', progress: 30 })
      });
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    const created = await service.createImageTo3DTask('data:image/png;base64,YWJj');
    expect(created.id).toBe('local:bG9jYWw6YWJj');

    const polled = await service.getImageTo3DTask(created.id);
    expect(polled.id).toBe(created.id);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7861/v1/image-to-3d/local%3Aabc',
      expect.any(Object)
    );
  });

  it('rejects a sidecar redirect as a non-retryable security failure', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('unexpected redirect')));
    const service = await import('../services/threeDService.js');

    await expect(service.createImageTo3DTask('data:image/png;base64,YWJj'))
      .rejects.toMatchObject({
        code: 'LOCAL_3D_REDIRECT_REJECTED',
        category: 'security',
        retryable: false
      });
  });

  it('maps an interrupted local JSON body read to a safe retryable timeout', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new DOMException('private socket path', 'AbortError'); }
    }));
    const service = await import('../services/threeDService.js');

    await expect(service.createImageTo3DTask('data:image/png;base64,YWJj'))
      .rejects.toMatchObject({
        code: 'LOCAL_3D_TIMEOUT',
        category: 'timeout',
        retryable: true
      });
  });

  it('validates GLB chunk structure instead of accepting a header-shaped blob', async () => {
    const module = await import('../services/threeD/providers/localHttp.js');
    const provider = module.default || module;
    const valid = createMinimalGlb();
    const wrongType = Buffer.from(valid);
    wrongType.writeUInt32LE(0x004e4942, 16);
    const unalignedChunk = Buffer.from(valid);
    unalignedChunk.writeUInt32LE(3, 12);
    const overflowChunk = Buffer.from(valid);
    overflowChunk.writeUInt32LE(valid.length, 12);

    expect(provider.validateGlb(valid)).toBe(true);
    expect(provider.validateGlb(createEmptyGlb())).toBe(false);
    expect(provider.validateGlb(valid.subarray(0, 12))).toBe(false);
    expect(provider.validateGlb(wrongType)).toBe(false);
    expect(provider.validateGlb(unalignedChunk)).toBe(false);
    expect(provider.validateGlb(overflowChunk)).toBe(false);
  });

  it.each([
    ['256-byte ASCII', 'x'.repeat(256)],
    ['255-byte UTF-8', '手'.repeat(85)]
  ])('round-trips the maximum supported %s local task id', async (_label, upstreamId) => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: upstreamId, status: 'queued', progress: 0 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: upstreamId, status: 'processing', progress: 25 })
      });
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    const created = await service.createImageTo3DTask('data:image/png;base64,YWJj');
    const polled = await service.getImageTo3DTask(created.id);

    expect(polled.id).toBe(created.id);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:7861/v1/image-to-3d/${encodeURIComponent(upstreamId)}`,
      expect.any(Object)
    );
  });

  it('coalesces concurrent capability probes and reuses a short-lived result', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    let resolveFetch;
    const pendingResponse = new Promise((resolve) => { resolveFetch = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('../services/threeDService.js');

    const first = service.getCapabilities();
    const second = service.getCapabilities();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveFetch({
      ok: true,
      json: async () => ({
        apiVersion: '1',
        ready: true,
        imageTo3D: { formats: ['glb'], pbr: true, texturing: true }
      })
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await service.getCapabilities();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
