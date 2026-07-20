import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function createApp() {
  const routeModule = await import('../routes/generate3d.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', routeModule.default || routeModule);
  return app;
}

function parseBinary(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

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
  const jsonChunk = Buffer.alloc(paddedLength, 0x20);
  json.copy(jsonChunk);
  const binary = Buffer.alloc(36);
  const glb = Buffer.alloc(12 + 8 + paddedLength + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryHeader = 20 + paddedLength;
  glb.writeUInt32LE(binary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('3D generation routes', () => {
  it('returns 202 with a queued task for a valid reference image', async () => {
    process.env.MESHY_API_KEY = 'route-test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'route-task-1' })
    }));
    const app = await createApp();

    const response = await request(app)
      .post('/api/generate-3d')
      .send({ image_url: 'data:image/png;base64,abc123', pose_mode: 'a-pose' });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      success: true,
      task: {
        id: 'route-task-1',
        provider: 'meshy',
        status: 'queued'
      }
    });
  });

  it('returns the normalized task when polling', async () => {
    process.env.MESHY_API_KEY = 'route-test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'route-task-2',
        status: 'IN_PROGRESS',
        progress: 42,
        model_urls: {}
      })
    }));
    const app = await createApp();

    const response = await request(app).get('/api/generate-3d/route-task-2');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      task: {
        id: 'route-task-2',
        status: 'processing',
        progress: 42,
        modelUrl: null
      }
    });
  });

  it('rejects an empty image before contacting the provider', async () => {
    process.env.MESHY_API_KEY = 'route-test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await request(app).post('/api/generate-3d').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_IMAGE'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 without exposing a key when Meshy is not configured', async () => {
    delete process.env.MESHY_API_KEY;
    const app = await createApp();

    const response = await request(app)
      .post('/api/generate-3d')
      .send({ image: 'https://example.com/reference.png' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'MESHY_NOT_CONFIGURED'
    });
    expect(JSON.stringify(response.body)).not.toContain('Bearer');
  });

  it('rejects an out-of-range polygon budget before contacting Meshy', async () => {
    process.env.MESHY_API_KEY = 'route-test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await request(app)
      .post('/api/generate-3d')
      .send({ image_url: 'data:image/png;base64,abc123', target_polycount: 9999999 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_POLYCOUNT'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses separate limits for creating a paid 3D task and polling its status', async () => {
    process.env.MESHY_API_KEY = 'route-test-key';
    process.env.THREE_D_RATE_LIMIT_MAX = '1';
    process.env.THREE_D_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.THREE_D_STATUS_RATE_LIMIT_MAX = '1';
    process.env.THREE_D_STATUS_RATE_LIMIT_WINDOW_MS = '60000';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'route-task-rate-limit',
        status: 'IN_PROGRESS',
        progress: 20,
        model_urls: {}
      })
    }));
    const app = await createApp();

    expect((await request(app).post('/api/generate-3d').send({})).status).toBe(400);
    expect((await request(app).post('/api/generate-3d').send({})).status).toBe(429);

    expect((await request(app).get('/api/generate-3d/route-task-rate-limit')).status).toBe(200);
    const limitedPoll = await request(app).get('/api/generate-3d/route-task-rate-limit');
    expect(limitedPoll.status).toBe(429);
    expect(limitedPoll.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });

  it('creates a local sidecar task while ignoring client attempts to choose an upstream', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'route-local-1', status: 'queued', progress: 0 })
    }));
    const app = await createApp();

    const response = await request(app)
      .post('/api/generate-3d')
      .send({
        image_url: 'data:image/png;base64,abc123',
        provider: 'meshy',
        base_url: 'http://169.254.169.254/latest'
      });

    expect(response.status).toBe(202);
    expect(response.body.task).toMatchObject({
      id: 'local:cm91dGUtbG9jYWwtMQ',
      provider: 'local',
      status: 'queued'
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:7861/v1/image-to-3d',
      expect.any(Object)
    );
  });

  it('exposes a safe 3D capability summary without provider secrets', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861/internal';
    process.env.LOCAL_3D_API_KEY = 'route-capability-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1',
        ready: true,
        imageTo3D: { formats: ['glb'], pbr: true, texturing: true }
      })
    }));
    const app = await createApp();

    const response = await request(app).get('/api/3d-capabilities');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      capabilities: {
        provider: 'local',
        configured: true,
        ready: true,
        outputFormat: 'glb',
        textured: true,
        pbr: true
      }
    });
    expect(JSON.stringify(response.body)).not.toContain('route-capability-secret');
    expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
  });

  it('proxies only the completed local task GLB and validates the binary header', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    const glb = createMinimalGlb();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'artifact-task',
          status: 'succeeded',
          progress: 100,
          model_url: '/artifacts/artifact-task.glb'
        })
      })
      .mockResolvedValueOnce(new Response(glb, {
        status: 200,
        headers: {
          'content-type': 'model/gltf-binary',
          'content-length': String(glb.length)
        }
      }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    const response = await request(app)
      .get('/api/generate-3d/local%3AYXJ0aWZhY3QtdGFzaw/artifacts/model.glb')
      .buffer(true)
      .parse(parseBinary);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('model/gltf-binary');
    expect(response.body).toEqual(glb);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7861/artifacts/artifact-task.glb',
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('rejects a header-only pseudo-GLB from the local sidecar', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    const headerOnly = Buffer.alloc(12);
    headerOnly.writeUInt32LE(0x46546c67, 0);
    headerOnly.writeUInt32LE(2, 4);
    headerOnly.writeUInt32LE(headerOnly.length, 8);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'artifact-task',
          status: 'succeeded',
          progress: 100,
          model_url: '/artifacts/artifact-task.glb'
        })
      })
      .mockResolvedValueOnce(new Response(headerOnly, { status: 200 })));
    const app = await createApp();

    const response = await request(app)
      .get('/api/generate-3d/local%3AYXJ0aWZhY3QtdGFzaw/artifacts/model.glb');

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'LOCAL_3D_INVALID_RESPONSE',
      retryable: false
    });
  });

  it('stops a chunked local GLB stream as soon as it exceeds the configured limit', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    process.env.LOCAL_3D_MAX_MODEL_BYTES = '24';
    const oversizedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(16));
        controller.enqueue(new Uint8Array(16));
        controller.close();
      }
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'artifact-task',
          status: 'succeeded',
          progress: 100,
          model_url: '/artifacts/artifact-task.glb'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '1' }),
        body: oversizedStream
      }));
    const app = await createApp();

    const response = await request(app)
      .get('/api/generate-3d/local%3AYXJ0aWZhY3QtdGFzaw/artifacts/model.glb');

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'LOCAL_3D_INVALID_RESPONSE' });
  });

  it('maps an interrupted local GLB body read to a safe retryable timeout', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    const abortedStream = new ReadableStream({
      pull() {
        throw new DOMException('internal socket details', 'AbortError');
      }
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'artifact-task',
          status: 'succeeded',
          progress: 100,
          model_url: '/artifacts/artifact-task.glb'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: abortedStream
      }));
    const app = await createApp();

    const response = await request(app)
      .get('/api/generate-3d/local%3AYXJ0aWZhY3QtdGFzaw/artifacts/model.glb');

    expect(response.status).toBe(504);
    expect(response.body).toMatchObject({
      code: 'LOCAL_3D_TIMEOUT',
      retryable: true
    });
    expect(JSON.stringify(response.body)).not.toContain('internal socket details');
  });

  it('rate-limits capability probes independently from paid task creation', async () => {
    process.env.THREE_D_PROVIDER = 'local';
    process.env.LOCAL_3D_BASE_URL = 'http://127.0.0.1:7861';
    process.env.THREE_D_CAPABILITY_RATE_LIMIT_MAX = '1';
    process.env.THREE_D_CAPABILITY_RATE_LIMIT_WINDOW_MS = '60000';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiVersion: '1',
        ready: true,
        imageTo3D: { formats: ['glb'], pbr: true, texturing: true }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    expect((await request(app).get('/api/3d-capabilities')).status).toBe(200);
    const limited = await request(app).get('/api/3d-capabilities');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
