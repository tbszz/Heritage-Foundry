#!/usr/bin/env node
// Resumable commissioning queue. A failed/ambiguous POST is never retried automatically.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./heritage-model-catalog.cjs');
const provider = require('../services/threeD/providers/tripo');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
const DIR = process.env.TRIPO_BATCH_DIR || path.join(ROOT, 'artifacts', 'tripo-batch');
const STATE = path.join(DIR, 'state.json');
const BASE = 'https://openapi.tripo3d.ai/v3';
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const REFERENCE_FACE_LIMIT = 12000;
const MAX_NO_PAID_SUBMISSION_ATTEMPTS = 3;
function availableCredits(wallet) {
  const balance = Number(wallet?.balance), frozen = Number(wallet?.frozen);
  if (wallet?.balance === null || wallet?.frozen === null || !Number.isFinite(balance) || !Number.isFinite(frozen) || balance < 0 || frozen < 0) {
    throw new Error('Invalid Tripo balance response; no new tasks will be submitted');
  }
  return balance - frozen;
}
function reviewBacklog(items, reviews) {
  // A successful upstream task still occupies a slot until its artifacts are recovered,
  // regardless of a review left over from an earlier attempt of the same catalog item.
  return items.filter(item => item.status === 'success' || (
    item.status === 'downloaded' && !reviews.some(review => review.id === item.id && ['approved', 'needs_revision'].includes(review.verdict))
  )).length;
}
function referencesRequired() {
  return process.env.TRIPO_REQUIRE_REFERENCES === 'true';
}
function validateReferenceMetadata(reference) {
  if (reference?.approved !== true || !reference.source || !reference.evidence || !reference.imagePath) {
    throw new Error('A visually approved, attributed reference is required');
  }
  if (!/\.(png|jpe?g)$/i.test(reference.imagePath)) throw new Error('Reference must be PNG or JPEG');
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference.imagePath)) throw new Error('Reference image must be a local file');
}
function imageMimeFromBytes(imagePath, bytes) {
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (/\.png$/i.test(imagePath) && isPng) return 'image/png';
  if (/\.jpe?g$/i.test(imagePath) && isJpeg) return 'image/jpeg';
  throw new Error('Reference image contents must match PNG or JPEG');
}
async function preflightReference(referenceFile) {
  const referencePath = path.resolve(referenceFile);
  const reference = JSON.parse(await fs.readFile(referencePath, 'utf8'));
  validateReferenceMetadata(reference);
  const imagePath = path.resolve(path.dirname(referencePath), reference.imagePath);
  const stats = await fs.stat(imagePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_REFERENCE_BYTES) throw new Error('Reference image size invalid');
  const bytes = await fs.readFile(imagePath);
  const mime = imageMimeFromBytes(imagePath, bytes);
  return {
    bytes,
    dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
    ledger: {
      approved: true,
      imagePath: reference.imagePath,
      source: reference.source,
      evidence: reference.evidence,
      mime,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }
  };
}
async function selectPendingCatalogItems(state, count, options = {}) {
  const eligibleEntries = catalog
    .map(spec => {
      const existing = state.items.find(item => item.id === spec.id);
      if (!existing) return { spec };
      return isRetryEligibleSubmission(existing) ? { spec, retryItem: existing } : null;
    })
    .filter(Boolean);
  if (!options.requireReferences) return { pending: eligibleEntries.slice(0, count), eligible: eligibleEntries.length, ineligible: [] };
  const pending = [], ineligible = [];
  for (const entry of eligibleEntries) {
    const { spec } = entry;
    const referenceFile = path.join(options.dir || DIR, 'references', `${spec.id}.json`);
    try {
      pending.push({ ...entry, reference: await preflightReference(referenceFile) });
    } catch (error) {
      ineligible.push({ id: spec.id, reason: error.message });
    }
  }
  return { pending: pending.slice(0, count), eligible: pending.length, ineligible };
}
function textPayload(spec) {
  return {
    prompt: spec.prompt, model: 'v3.1-20260211',
    smart_low_poly: true, face_limit: spec.faceLimit, quad: false,
    texture: true, pbr: true, texture_quality: 'detailed', auto_size: true,
    model_seed: 2026090700 + catalog.indexOf(spec),
    negative_prompt: 'broken mesh, floating geometry, blurry texture, deformed proportions, modern logo, text, scene background'
  };
}
function referencePayload() {
  return {
    mode: 'image-to-model',
    model: 'v3.1-20260211',
    face_limit: REFERENCE_FACE_LIMIT,
    texture: true,
    pbr: true,
    texture_quality: 'detailed',
    geometry_quality: 'detailed',
    smart_low_poly: true,
    auto_size: true,
    export_uv: true
  };
}
async function save(state) {
  const temp = STATE + '.tmp';
  await fs.writeFile(temp, JSON.stringify(state, null, 2));
  await fs.rename(temp, STATE);
}
function classifySubmissionFailure(error) {
  if (error?.tripoPaidCreateAttempted === false) {
    return error.tripoStage === 'upload' ? 'upload_failed' : 'preflight_failed';
  }
  return 'submission_unknown';
}
function applySubmissionFailure(item, error) {
  item.status = classifySubmissionFailure(error);
  item.submissionError = error.message;
  if (error?.tripoStage) item.submissionStage = error.tripoStage;
  if (typeof error?.tripoPaidCreateAttempted === 'boolean') item.paidCreateAttempted = error.tripoPaidCreateAttempted;
  if (typeof error?.retryable === 'boolean') item.submissionRetryable = error.retryable;
  if (error?.tripoPaidCreateEndpoint) item.submissionEndpoint = error.tripoPaidCreateEndpoint;
  return item;
}
function submissionAttemptCount(item) {
  let count = 1;
  const attempts = Array.isArray(item?.attempts) ? item.attempts : [];
  for (let index = attempts.length - 1; index >= 0; index--) {
    const attempt = attempts[index];
    if (!attempt?.status && !attempt?.submittedAt) continue;
    if (!['upload_failed', 'preflight_failed'].includes(attempt.status) || attempt.paidCreateAttempted === true) break;
    count++;
  }
  return count;
}
function hasReconciliationEvidence(item) {
  return typeof item?.reconciliation?.evidence === 'string' && item.reconciliation.evidence.trim().length > 0;
}
function isNoPaidSubmissionFailure(item) {
  return ['upload_failed', 'preflight_failed'].includes(item?.status) && item.paidCreateAttempted === false;
}
function isRetryEligibleSubmission(item) {
  // Legacy revisions retained an archive before submissionKind was recorded.
  if (item?.submissionKind === 'revision' || item?.attempts?.some(attempt => attempt.archive)) return false;
  if (isNoPaidSubmissionFailure(item)) return submissionAttemptCount(item) < MAX_NO_PAID_SUBMISSION_ATTEMPTS;
  return item?.status === 'reconciled_unsubmitted' && hasReconciliationEvidence(item);
}
function isTerminalNoPaidSubmissionFailure(item) {
  return isNoPaidSubmissionFailure(item) && !isRetryEligibleSubmission(item);
}
function prepareSubmissionAttempt(item, { spec, payload, reference, submittedAt = new Date().toISOString() }) {
  const previous = { ...item };
  const attempts = Array.isArray(item.attempts) ? item.attempts : [];
  delete previous.attempts;
  for (const key of [
    'taskId',
    'submissionError',
    'submissionStage',
    'paidCreateAttempted',
    'submissionRetryable',
    'submissionEndpoint'
  ]) {
    delete item[key];
  }
  Object.assign(item, {
    id: spec.id,
    name: spec.name,
    status: 'creating',
    submittedAt,
    payload,
    attempts: previous.status || previous.submittedAt ? [...attempts, previous] : [...attempts]
  });
  if (reference) item.reference = reference.ledger;
  return item;
}
async function request(route, body, base = BASE) {
  if (!process.env.TRIPO_API_KEY) throw new Error('TRIPO_API_KEY is required');
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(45000)
  });
  const json = await response.json();
  if (!response.ok || json.code !== 0) throw new Error(`Tripo HTTP ${response.status}; code ${json.code}`);
  return json.data;
}
async function download(url, destination, maxBytes = 150 * 1024 * 1024) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Artifact URL must use HTTPS');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120000), redirect: 'error' });
  if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Artifact exceeds size limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (destination.endsWith('.glb') && (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)) throw new Error('Invalid GLB container');
  await fs.writeFile(destination + '.tmp', bytes);
  await fs.rename(destination + '.tmp', destination);
  return size;
}
async function main() {
  await fs.mkdir(DIR, { recursive: true });
  // Exclusive lock prevents two invocations commissioning the same pending object.
  const lockPath = path.join(DIR, 'queue.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = (await fs.readFile(lockPath, 'utf8')).trim();
    throw new Error(`Queue is locked by PID ${pid}; verify that process before recovering ${lockPath}`);
  }
  await lock.writeFile(String(process.pid));
  try {
    let state;
    try { state = JSON.parse(await fs.readFile(STATE, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, api: BASE, items: [] }; }
    const submitArg = process.argv.find(arg => arg.startsWith('--submit='));
    const submitCount = submitArg ? Number(submitArg.split('=')[1]) : 0;
    if (!Number.isInteger(submitCount) || submitCount < 0 || submitCount > 100) throw new Error('--submit must be 0..100');
    // Balance service availability must not prevent recovering already-paid tasks.
    // Each new paid submission below still requires a fresh, valid wallet response.
    try {
      const balance = await request('/account/balance');
      availableCredits(balance);
      state.balance = balance; state.checkedAt = new Date().toISOString();
      delete state.balanceError;
      console.log(JSON.stringify({ balance }));
    } catch (error) {
      state.balanceError = error.message;
      console.error('Balance unavailable; continuing observation of existing tasks.');
    }
    // Poll and download known jobs first. Timeout keeps task_id intact for next run.
    for (const item of state.items.filter(item => item.taskId && item.status !== 'downloaded' && item.status !== 'failed' && item.status !== 'cancelled')) {
      try {
        let task;
        try {
          task = await request(`/tasks/${encodeURIComponent(item.taskId)}`);
        } catch (error) {
          // Official v2 compatibility endpoint can read the same task when v3 transport fails.
          // Never fall back for POST: an ambiguous create must not spend twice.
          if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
          task = await request(`/task/${encodeURIComponent(item.taskId)}`, undefined, 'https://api.tripo3d.ai/v2/openapi');
          task.output = {
            model_url: task.output?.pbr_model || task.output?.model,
            rendered_image_url: task.output?.rendered_image || task.output?.generated_image
          };
          item.pollTransport = 'v2-compatible';
        }
        item.status = task.status; item.progress = task.progress; item.creditsConsumed = task.credits_consumed;
        if (task.error_code) item.errorCode = task.error_code;
        if (task.status === 'success') {
          if (!task.output?.model_url) throw new Error('Successful task has no GLB');
          item.bytes = await download(task.output.model_url, path.join(DIR, `${item.id}.glb`));
          if (task.output.rendered_image_url) {
            await download(task.output.rendered_image_url, path.join(DIR, `${item.id}.preview`), 20 * 1024 * 1024);
          }
          item.status = 'downloaded';
          item.visualReview = 'pending';
        }
        delete item.lastPollError;
      } catch (error) { item.lastPollError = error.message; }
      await save(state);
      console.log(JSON.stringify({ id: item.id, status: item.status, progress: item.progress, error: item.lastPollError }));
    }
    const active = state.items.filter(item => ['queued', 'running', 'submitted', 'creating', 'submission_unknown'].includes(item.status));
    if (active.some(item => ['creating', 'submission_unknown'].includes(item.status))) throw new Error('An ambiguous submission requires reconciliation before new spending');
    // Four concurrent tasks keeps API pressure and review backlog bounded.
    let heldForReview = false;
    try { await fs.access(path.join(DIR, 'hold-submissions')); heldForReview = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let reviews = [];
    try { reviews = JSON.parse((await fs.readFile(path.join(DIR, 'visual-review.json'), 'utf8')).replace(/^\uFEFF/, '')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const backlog = reviewBacklog(state.items, reviews);
    const requireReferences = referencesRequired();
    const count = heldForReview ? 0 : Math.min(submitCount, Math.max(0, 4 - active.length - backlog));
    if (heldForReview) console.log('New submissions held for reference review; existing task polling continues.');
    const selection = await selectPendingCatalogItems(state, count, { requireReferences, dir: DIR });
    if (requireReferences) {
      state.referenceMode = {
        required: true,
        eligible: selection.eligible,
        ineligible: selection.ineligible.slice(0, 20),
        checkedAt: new Date().toISOString()
      };
      if (count > 0 && selection.eligible === 0) console.log('No approved local PNG/JPEG references are eligible for new submissions; existing task polling is complete for this tick.');
    } else {
      delete state.referenceMode;
    }
    for (const entry of selection.pending) {
      const { spec, reference, retryItem } = entry;
      const wallet = await request('/account/balance');
      if (availableCredits(wallet) < 150) throw new Error('Insufficient reserve for the next task');
      const payload = requireReferences ? referencePayload() : textPayload(spec);
      const item = retryItem || { id: spec.id };
      prepareSubmissionAttempt(item, { spec, payload, reference: requireReferences ? reference : null });
      if (!retryItem) state.items.push(item);
      await save(state);
      try {
        const created = requireReferences
          ? await provider.createImageTo3DTask(reference.dataUrl, { face_limit: REFERENCE_FACE_LIMIT })
          : await request('/generation/text-to-model', payload);
        const taskId = created.task_id || created.id;
        if (!taskId) throw new Error('Missing task_id');
        item.taskId = taskId; item.status = 'submitted';
      } catch (error) { applySubmissionFailure(item, error); await save(state); throw error; }
      await save(state);
      console.log(JSON.stringify({ id: item.id, name: item.name, taskId: item.taskId, status: item.status }));
    }
    await save(state);
    console.log(JSON.stringify({ total: state.items.length, downloaded: state.items.filter(item => item.status === 'downloaded').length, pending: catalog.length - state.items.length }));
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { download, availableCredits, reviewBacklog, validateReferenceMetadata, imageMimeFromBytes, preflightReference, selectPendingCatalogItems, textPayload, referencePayload, classifySubmissionFailure, applySubmissionFailure, isRetryEligibleSubmission, isTerminalNoPaidSubmissionFailure, prepareSubmissionAttempt };
