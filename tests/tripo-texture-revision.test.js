import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const provider = require('../services/threeD/providers/tripo.js');
const revisionPath = path.resolve('scripts/revise-heritage-model.cjs');
const revisionSource = readFileSync(revisionPath, 'utf8');
const originalEnv = { ...process.env };
const image = 'data:image/png;base64,YWJjZA==';
const ok = data => ({ ok: true, json: async () => ({ code: 0, data }) });
afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });

describe('Tripo geometry-preserving texture provider', () => {
  it.each([undefined, 'remove the dark patch; preserve ceramic texture'])('uploads before the sole paid texture request, with exclusive prompt mode: %s', async text => {
    process.env.TRIPO_API_KEY = 'test-only-key';
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ file_token: 'file_reference' })).mockResolvedValueOnce(ok({ task_id: 'texture_task' }));
    vi.stubGlobal('fetch', fetchMock);
    const prepared = vi.fn(async (payload, endpoint) => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(endpoint).toBe('/models/texture');
      expect(payload.input).toBe('original_task');
    });
    const result = await provider.createTextureTask('original_task', image, { text, onPrepared: prepared });
    expect(result.id).toBe('texture_task');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://openapi.tripo3d.ai/v3/files', 'https://openapi.tripo3d.ai/v3/models/texture']);
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload).toMatchObject({ input: 'original_task', model: 'v3.0-20250812', pbr: true, texture_quality: 'detailed', texture_alignment: 'geometry', bake: false });
    expect(payload.texture_prompt).toEqual(text ? { text, style_image: { file_token: 'file_reference' } } : { image: { file_token: 'file_reference' } });
    expect(payload.face_limit).toBeUndefined();
    expect(payload.auto_size).toBeUndefined();
    expect(prepared).toHaveBeenCalledOnce();
  });

  it('classifies failed image upload before the texture paid boundary', async () => {
    process.env.TRIPO_API_KEY = 'test-only-key';
    const fetchMock = vi.fn().mockRejectedValue(new Error('socket failure'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider.createTextureTask('source_task', image)).rejects.toMatchObject({ tripoStage: 'upload', tripoPaidCreateAttempted: false, tripoPaidCreateEndpoint: '/models/texture' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['timeout', 'missing-id'])('never retries ambiguous paid texture submissions: %s', async failure => {
    process.env.TRIPO_API_KEY = 'test-only-key';
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ file_token: 'file_reference' }));
    if (failure === 'timeout') fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    else fetchMock.mockResolvedValueOnce(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider.createTextureTask('source_task', image)).rejects.toMatchObject({ tripoStage: 'paid_create', tripoPaidCreateAttempted: true, tripoPaidCreateEndpoint: '/models/texture' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not spend when persisting the exact request fails', async () => {
    process.env.TRIPO_API_KEY = 'test-only-key';
    const fetchMock = vi.fn().mockResolvedValue(ok({ file_token: 'file_reference' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider.createTextureTask('source_task', image, { onPrepared: async () => { throw new Error('disk full'); } })).rejects.toMatchObject({ tripoStage: 'preflight', tripoPaidCreateAttempted: false, tripoPaidCreateEndpoint: '/models/texture' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates source and local image requirements before upload', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(provider.createTextureTask('https://example/source.glb', image)).rejects.toMatchObject({ tripoStage: 'preflight', tripoPaidCreateAttempted: false });
    await expect(provider.createTextureTask('source', 'https://example/image.png')).rejects.toMatchObject({ tripoStage: 'preflight', tripoPaidCreateAttempted: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function cliHarness(args = [], failPaid = false) {
  const dir = path.resolve('mock-ledger');
  const files = new Map([
    [path.join(dir, 'state.json'), JSON.stringify({ items: [{ id: 'heritage-013', name: '陶俑', status: 'downloaded', taskId: 'source_task' }] })],
    [path.join(dir, 'visual-review.json'), JSON.stringify([{ id: 'heritage-013', verdict: 'needs_revision' }])],
    ['reference.json', JSON.stringify({ approved: true, source: 'museum', evidence: 'reviewed', imagePath: 'ref.png' })],
    [path.resolve('ref.png'), Buffer.from('image-bytes')],
    [path.resolve('prompt.txt'), Buffer.from('保留几何，仅修复后脑材质', 'utf8')],
    [path.join(dir, 'heritage-013.glb'), Buffer.from('original-model')],
    [path.join(dir, 'heritage-013.preview'), Buffer.from('original-preview')]
  ]);
  const fsMock = {
    readFile: vi.fn(async file => { if (!files.has(file)) throw new Error(`Unexpected read: ${file}`); return files.get(file); }),
    writeFile: vi.fn(async (file, value) => { files.set(file, value); }),
    rename: vi.fn(async (a, b) => { files.set(b, files.get(a)); files.delete(a); }),
    copyFile: vi.fn(async (a, b) => { files.set(b, files.get(a)); }),
    mkdir: vi.fn(async () => {}), unlink: vi.fn(async () => {}),
    open: vi.fn(async () => ({ writeFile: async () => {}, close: async () => {} }))
  };
  const submit = vi.fn(async (source, dataUrl, options) => {
    const payload = provider.buildTexturePayload(source, 'file_reference', options);
    await options.onPrepared(payload, '/models/texture');
    const saved = JSON.parse(files.get(path.join(dir, 'state.json'))).items[0];
    expect(saved).toMatchObject({ sourceTaskId: 'source_task', mode: 'texture', payload });
    if (failPaid) throw Object.assign(new Error('ambiguous'), { tripoPaidCreateAttempted: true, tripoStage: 'paid_create', tripoPaidCreateEndpoint: '/models/texture' });
    return { id: 'new_texture_task' };
  });
  const module = { exports: {} };
  // Isolate credential loading and the live ledger: no .env is opened by this test.
  const isolatedRequire = id => {
    if (id === 'node:fs/promises') return fsMock;
    if (id === 'dotenv') return { config: () => {} };
    if (id.includes('providers/tripo')) return { isConfigured: () => true, createTextureTask: submit, createImageTo3DTask: vi.fn() };
    if (id === './generate-heritage-models.cjs') return { availableCredits: () => 1000, applySubmissionFailure: (item, error) => { item.status = error.tripoPaidCreateAttempted === false ? 'preflight_failed' : 'submission_unknown'; } };
    return require(id);
  };
  vm.runInNewContext(revisionSource, { require: isolatedRequire, module, __dirname: path.dirname(revisionPath), process: { argv: ['node', 'script', ...args], env: { TRIPO_BATCH_DIR: dir } }, Buffer, TextDecoder, AbortSignal, fetch: vi.fn(async () => ok({ balance: 1000, frozen: 0 })), console: { log: () => {} } });
  return { revision: module.exports, files, dir, submit, fsMock };
}

describe('explicit texture revision CLI', () => {
  it('preserves default geometry regeneration and rejects an implicit text mode', () => {
    const { revision } = cliHarness();
    expect(revision.parseRevisionArgs(['heritage-013', 'reference.json'])).toMatchObject({ texture: false });
    expect(() => revision.parseRevisionArgs(['heritage-013', 'reference.json', '--prompt-file=prompt.txt'])).toThrow('--texture');
    expect(() => revision.parseRevisionArgs(['heritage-013', 'reference.json', '--texture', '--other'])).toThrow('Unknown');
  });

  it.each([false, true])('archives the source, persists exact payload, and leaves old model bytes untouched (ambiguous=%s)', async failPaid => {
    const harness = cliHarness(['heritage-013', 'reference.json', '--texture', '--prompt-file=prompt.txt'], failPaid);
    if (failPaid) await expect(harness.revision.main()).rejects.toThrow('ambiguous');
    else await harness.revision.main();
    const item = JSON.parse(harness.files.get(path.join(harness.dir, 'state.json'))).items[0];
    expect(item.status).toBe(failPaid ? 'submission_unknown' : 'submitted');
    expect(item.payload.texture_prompt).toEqual({ text: '保留几何，仅修复后脑材质', style_image: { file_token: 'file_reference' } });
    expect(harness.files.get(path.join(harness.dir, 'heritage-013.glb')).toString()).toBe('original-model');
    const archived = JSON.parse(harness.files.get(path.join(harness.dir, 'attempts/heritage-013/source_task/revision-request.json')));
    expect(archived).toMatchObject({ sourceTaskId: 'source_task', mode: 'texture', endpoint: '/models/texture', payload: item.payload });
    expect(harness.submit).toHaveBeenCalledOnce();
    if (failPaid) {
      await expect(harness.revision.main()).rejects.toThrow('Reconcile ambiguous');
      expect(harness.submit).toHaveBeenCalledOnce();
    }
  });
});
