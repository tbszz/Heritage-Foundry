import { describe, expect, it, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import catalog from '../scripts/heritage-model-catalog.cjs';
import pipeline from '../scripts/generate-heritage-models.cjs';
import revision from '../scripts/revise-heritage-model.cjs';
import runner from '../scripts/run-heritage-batch.cjs';
afterEach(() => vi.unstubAllGlobals());
describe('heritage model commissioning', () => {
  const prior = { id: 'heritage-004', status: 'downloaded', taskId: 'existing-task' };
  const rejected = { id: 'heritage-004', verdict: 'needs_revision' };
  const reference = { approved: true, imagePath: 'reference.png', source: 'Museum attribution', evidence: 'Hollow tube ears visually inspected' };
  async function withTempReferences(files, callback) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'heritage-reference-'));
    const references = path.join(dir, 'references');
    await fs.mkdir(references, { recursive: true });
    try {
      for (const file of files) {
        const target = path.join(references, file.name);
        if (file.json) await fs.writeFile(target, JSON.stringify(file.json));
        else await fs.writeFile(target, file.bytes);
      }
      return await callback(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  it.each(['submitted', 'creating', 'submission_unknown', 'running', 'success'])('does not replace a task before recovery: %s', status => {
    expect(() => revision.validateRevision({ ...prior, status }, rejected, reference)).toThrow('downloaded');
  });
  it('requires reference evidence and an explicit rejection before paid revision', () => {
    expect(() => revision.validateRevision(prior, { ...rejected, verdict: 'approved' }, reference)).toThrow('needs_revision');
    expect(() => revision.validateRevision(prior, rejected, { ...reference, approved: false })).toThrow('approved');
    expect(() => revision.validateRevision(prior, rejected, { ...reference, source: '' })).toThrow('attributed');
    expect(() => revision.validateRevision(prior, rejected, reference)).not.toThrow();
  });
  it('preflights approved local PNG references before reference-mode spending', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await withTempReferences([
      { name: 'heritage-001.json', json: { approved: true, imagePath: 'heritage-001.png', source: 'Museum record', evidence: 'Silhouette and surface marks match' } },
      { name: 'heritage-001.png', bytes: png }
    ], async dir => {
      const result = await pipeline.preflightReference(path.join(dir, 'references', 'heritage-001.json'));
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.ledger).toMatchObject({ approved: true, imagePath: 'heritage-001.png', source: 'Museum record', mime: 'image/png', bytes: png.length });
      expect(result.ledger.sha256).toHaveLength(64);
      expect(JSON.stringify(result.ledger)).not.toContain('base64');
    });
  });
  it('rejects missing, remote, unapproved, oversized, and mismatched reference inputs before selection', async () => {
    expect(() => pipeline.validateReferenceMetadata({ approved: true, imagePath: 'https://example.com/ref.png', source: 'Museum', evidence: 'Match' })).toThrow('local');
    expect(() => pipeline.validateReferenceMetadata({ approved: false, imagePath: 'ref.png', source: 'Museum', evidence: 'Match' })).toThrow('approved');
    expect(() => pipeline.imageMimeFromBytes('ref.png', Buffer.from('not an image'))).toThrow('contents');
    await withTempReferences([
      { name: 'empty.png', bytes: new Uint8Array() },
      { name: 'heritage-001.json', json: { approved: true, imagePath: 'empty.png', source: 'Museum', evidence: 'Match' } }
    ], async dir => {
      await expect(pipeline.preflightReference(path.join(dir, 'references', 'heritage-001.json'))).rejects.toThrow('size invalid');
    });
  });
  it('selects only approved local references in explicit reference mode without text fallback', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    await withTempReferences([
      { name: 'heritage-001.json', json: { approved: true, imagePath: 'heritage-001.png', source: 'Museum record', evidence: 'Shape match' } },
      { name: 'heritage-001.png', bytes: png },
      { name: 'heritage-002.json', json: { approved: false, imagePath: 'heritage-002.png', source: 'Museum record', evidence: 'Not approved yet' } },
      { name: 'heritage-002.png', bytes: png }
    ], async dir => {
      const selection = await pipeline.selectPendingCatalogItems({ items: [] }, 4, { requireReferences: true, dir });
      expect(selection.pending.map(entry => entry.spec.id)).toEqual(['heritage-001']);
      expect(selection.eligible).toBe(1);
      expect(selection.ineligible.some(entry => entry.id === 'heritage-002' && /approved/.test(entry.reason))).toBe(true);
      expect(pipeline.referencePayload()).toMatchObject({ mode: 'image-to-model', face_limit: 12000 });
      expect(pipeline.referencePayload()).not.toHaveProperty('prompt');
      expect(pipeline.textPayload(catalog[0])).toHaveProperty('prompt', catalog[0].prompt);
    });
  });
  it('contains exactly 100 distinct briefs accepted by the documented API limits', () => {
    expect(catalog).toHaveLength(100);
    expect(new Set(catalog.map(item => item.id)).size).toBe(100);
    expect(new Set(catalog.map(item => item.name)).size).toBe(100);
    for (const item of catalog) {
      expect(item.prompt.length).toBeLessThanOrEqual(1024);
      expect(item.faceLimit).toBeGreaterThanOrEqual(500);
      expect(item.faceLimit).toBeLessThanOrEqual(20000);
    }
  });
  it.each([undefined, {}, { balance: null, frozen: 0 }, { balance: 'oops', frozen: 0 }, { balance: 100, frozen: undefined }, { balance: -1, frozen: 0 }])('fails closed on malformed wallet data %#', wallet => {
    expect(() => pipeline.availableCredits(wallet)).toThrow('Invalid Tripo balance');
  });
  it('reserves frozen credits conservatively', () => {
    expect(pipeline.availableCredits({ balance: 1000, frozen: 80 })).toBe(920);
  });
  it('classifies upload failures as retryable no-paid submission failures', () => {
    const item = { id: 'heritage-001', status: 'creating' };
    pipeline.applySubmissionFailure(item, Object.assign(new Error('upload socket closed'), {
      tripoStage: 'upload',
      tripoPaidCreateAttempted: false,
      tripoPaidCreateEndpoint: '/generation/image-to-model',
      retryable: true
    }));

    expect(item).toMatchObject({
      status: 'upload_failed',
      submissionError: 'upload socket closed',
      submissionStage: 'upload',
      paidCreateAttempted: false,
      submissionRetryable: true,
      submissionEndpoint: '/generation/image-to-model'
    });
  });
  it('keeps missing task ids ambiguous after the paid create boundary', () => {
    const item = { id: 'heritage-002', status: 'creating' };
    revision.applySubmissionFailure(item, Object.assign(new Error('Missing task id'), {
      tripoStage: 'paid_create',
      tripoPaidCreateAttempted: true,
      tripoPaidCreateEndpoint: '/generation/image-to-model',
      retryable: false
    }));

    expect(item).toMatchObject({
      status: 'submission_unknown',
      submissionError: 'Missing task id',
      submissionStage: 'paid_create',
      paidCreateAttempted: true,
      submissionRetryable: false,
      submissionEndpoint: '/generation/image-to-model'
    });
  });
  it('retries only no-paid submission failures and never ambiguous paid submissions', async () => {
    const state = {
      items: [
        { id: 'heritage-001', status: 'upload_failed', paidCreateAttempted: false, attempts: [] },
        { id: 'heritage-002', status: 'submission_unknown', paidCreateAttempted: true },
        { id: 'heritage-003', status: 'preflight_failed', paidCreateAttempted: false, attempts: [{ status: 'preflight_failed' }, { status: 'preflight_failed' }] }
      ]
    };

    const selection = await pipeline.selectPendingCatalogItems(state, 5);

    expect(selection.pending.map(entry => entry.spec.id)).toEqual([
      'heritage-001',
      'heritage-004',
      'heritage-005',
      'heritage-006',
      'heritage-007'
    ]);
    expect(selection.pending[0].retryItem).toBe(state.items[0]);
    expect(selection.pending.some(entry => entry.spec.id === 'heritage-002')).toBe(false);
    expect(selection.pending.some(entry => entry.spec.id === 'heritage-003')).toBe(false);
  });
  it('preserves no-paid failure history when preparing a retry attempt', () => {
    const item = {
      id: 'heritage-001',
      name: 'Old',
      status: 'upload_failed',
      submittedAt: 'before',
      submissionError: 'socket closed',
      submissionStage: 'upload',
      paidCreateAttempted: false,
      submissionRetryable: true,
      attempts: [{ status: 'preflight_failed', submissionError: 'first failure' }]
    };

    pipeline.prepareSubmissionAttempt(item, {
      spec: { id: 'heritage-001', name: 'Retry Name' },
      payload: { mode: 'image-to-model' },
      submittedAt: 'after'
    });

    expect(item).toMatchObject({
      id: 'heritage-001',
      name: 'Retry Name',
      status: 'creating',
      submittedAt: 'after',
      payload: { mode: 'image-to-model' },
      attempts: [
        { status: 'preflight_failed', submissionError: 'first failure' },
        {
          status: 'upload_failed',
          submissionError: 'socket closed',
          submissionStage: 'upload',
          paidCreateAttempted: false,
          submissionRetryable: true
        }
      ]
    });
    expect(item).not.toHaveProperty('submissionError');
    expect(item.attempts[1]).not.toHaveProperty('attempts');
  });
  it('allows one manually reconciled unsubmitted item back into selection with evidence', async () => {
    const state = {
      items: [
        {
          id: 'heritage-001',
          status: 'reconciled_unsubmitted',
          reconciliation: { evidence: 'Root checked Tripo console; no task exists.' },
          paidCreateAttempted: true
        },
        {
          id: 'heritage-002',
          status: 'reconciled_unsubmitted',
          reconciliation: {}
        }
      ]
    };

    const selection = await pipeline.selectPendingCatalogItems(state, 3);

    expect(selection.pending.map(entry => entry.spec.id)).toEqual(['heritage-001', 'heritage-003', 'heritage-004']);
    expect(selection.pending[0].retryItem).toBe(state.items[0]);
    expect(selection.pending.some(entry => entry.spec.id === 'heritage-002')).toBe(false);
  });
  it('treats exhausted no-paid failures as terminal for the supervisor', async () => {
    const exhausted = {
      id: 'heritage-001',
      status: 'upload_failed',
      paidCreateAttempted: false,
      attempts: [{ status: 'upload_failed' }, { status: 'upload_failed' }]
    };

    expect(pipeline.isRetryEligibleSubmission(exhausted)).toBe(false);
    expect(pipeline.isTerminalNoPaidSubmissionFailure(exhausted)).toBe(true);
    expect(await runner.shouldExitWhenRecovered({ items: [exhausted] }, os.tmpdir())).toBe(true);
  });
  it.each([false, true])('allows exactly three actual no-paid attempts with legacy shell history: %s', legacyShell => {
    const spec = { id: 'heritage-001', name: 'Test' };
    const item = { id: spec.id, attempts: legacyShell ? [{ id: spec.id }] : [] };
    for (let actualAttempt = 1; actualAttempt <= 3; actualAttempt++) {
      pipeline.prepareSubmissionAttempt(item, { spec, payload: {} });
      pipeline.applySubmissionFailure(item, Object.assign(new Error('upload failed'), {
        tripoStage: 'upload', tripoPaidCreateAttempted: false
      }));
      expect(pipeline.isRetryEligibleSubmission(item)).toBe(actualAttempt < 3);
      expect(pipeline.isTerminalNoPaidSubmissionFailure(item)).toBe(actualAttempt === 3);
    }
    expect(item.attempts).toHaveLength(legacyShell ? 3 : 2);
    if (legacyShell) expect(item.attempts[0]).toEqual({ id: spec.id });
  });
  it('starts a fresh retry allowance after reconciliation and retains its audit evidence', () => {
    const reconciliation = { evidence: 'Console confirmed no paid task exists.' };
    const item = {
      id: 'heritage-001', status: 'reconciled_unsubmitted', reconciliation,
      attempts: [{ status: 'upload_failed' }, { status: 'downloaded', taskId: 'old-paid-task' }]
    };
    pipeline.prepareSubmissionAttempt(item, { spec: { id: item.id, name: 'Test' }, payload: {} });
    pipeline.applySubmissionFailure(item, Object.assign(new Error('upload failed'), {
      tripoStage: 'upload', tripoPaidCreateAttempted: false
    }));
    expect(pipeline.isRetryEligibleSubmission(item)).toBe(true);
    expect(item.attempts[2]).toMatchObject({ status: 'reconciled_unsubmitted', reconciliation });
    expect(item.attempts[1].taskId).toBe('old-paid-task');
  });
  it.each([
    { submissionKind: 'revision' },
    { attempts: [{ status: 'downloaded', archive: 'attempts/heritage-001/old-task' }] }
  ])('excludes explicit and legacy revision failures from ordinary retries: %j', revisionFields => {
    const item = { id: 'heritage-001', status: 'upload_failed', paidCreateAttempted: false, ...revisionFields };
    expect(pipeline.isRetryEligibleSubmission(item)).toBe(false);
    expect(pipeline.isRetryEligibleSubmission({ ...item, status: 'reconciled_unsubmitted', reconciliation: { evidence: 'Checked' } })).toBe(false);
  });
  it('counts downloaded assets awaiting review to bound further spending', () => {
    const items = ['001', '002', '003', '004'].map(id => ({ id, status: 'downloaded' }));
    items.push({ id: '005', status: 'running' });
    expect(pipeline.reviewBacklog(items, [{ id: '001', verdict: 'approved' }, { id: '002', verdict: 'needs_revision' }, { id: '003', verdict: 'pending' }])).toBe(2);
    expect(pipeline.reviewBacklog(items, [])).toBe(4);
  });
  it.each(['needs_revision', 'approved'])('counts successful tasks awaiting artifact download despite old %s reviews', verdict => {
    const items = [
      { id: '018', status: 'success', taskId: 'new-task', lastPollError: 'fetch failed' },
      { id: '019', status: 'downloaded' },
      { id: '020', status: 'downloaded' },
      { id: '021', status: 'submitted' },
      { id: '022', status: 'running' }
    ];
    const reviews = [
      { id: '018', verdict, taskId: 'previous-task' },
      { id: '019', verdict: 'pending' },
      { id: '020', verdict: 'pending' }
    ];
    // Active submissions stay outside the review backlog; the pending download occupies one slot.
    expect(pipeline.reviewBacklog(items, reviews)).toBe(3);
    expect(pipeline.reviewBacklog(items.slice(3), reviews)).toBe(0);
    expect(pipeline.reviewBacklog(items.slice(0, 1), reviews)).toBe(1);
  });
  it('rejects non-HTTPS artifact URLs before network access', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(pipeline.download('http://example.com/model.glb', 'unused.glb')).rejects.toThrow('HTTPS');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not write a provider error page as a model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>not a GLB</html>', { status: 200 })));
    await expect(pipeline.download('https://example.com/model.glb', 'unused.glb')).rejects.toThrow('Invalid GLB');
  });
  it('enforces streamed download size before writing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(32), { status: 200 })));
    await expect(pipeline.download('https://example.com/model.glb', 'unused.glb', 16)).rejects.toThrow('size limit');
  });
  it('lets the supervisor stop when recovered tasks have no eligible references or an explicit hold', async () => {
    await withTempReferences([], async dir => {
      expect(await runner.shouldExitWhenRecovered({ items: [{ status: 'downloaded' }], referenceMode: { required: true, eligible: 0 } }, dir)).toBe(true);
      expect(await runner.shouldExitWhenRecovered({ items: [{ status: 'downloaded' }], referenceMode: { required: true, eligible: 1 } }, dir)).toBe(false);
      await fs.writeFile(path.join(dir, 'hold-submissions'), 'hold');
      expect(await runner.shouldExitWhenRecovered({ items: [{ status: 'downloaded' }] }, dir)).toBe(true);
      expect(await runner.shouldExitWhenRecovered({ items: [{ status: 'submitted' }], referenceMode: { required: true, eligible: 0 } }, dir)).toBe(false);
    });
  });
});
