#!/usr/bin/env node
// Deliberate, reference-guided replacement. Never retries an ambiguous paid POST.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const provider = require('../services/threeD/providers/tripo');
const { availableCredits, applySubmissionFailure } = require('./generate-heritage-models.cjs');

function validateRevision(item, review, reference) {
  if (!item || item.status !== 'downloaded' || !item.taskId) throw new Error('Revision requires a downloaded, identified previous task');
  if (review?.id !== item.id || review.verdict !== 'needs_revision') throw new Error('Revision requires an explicit needs_revision verdict');
  if (reference?.approved !== true || !reference.source || !reference.evidence || !reference.imagePath) throw new Error('A visually approved, attributed reference is required');
  if (!/\.(png|jpe?g)$/i.test(reference.imagePath)) throw new Error('Reference must be PNG or JPEG');
}

function parseRevisionArgs(args) {
  const positional = [];
  let texture = false;
  let promptFile;
  for (const arg of args) {
    if (arg === '--texture' && !texture) texture = true;
    else if (arg.startsWith('--prompt-file=') && promptFile === undefined) promptFile = arg.slice('--prompt-file='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown or repeated option: ${arg}`);
    else positional.push(arg);
  }
  const [id, referenceFile] = positional;
  if (positional.length !== 2 || !/^heritage-\d{3}$/.test(id || '') || !referenceFile) throw new Error('Usage: revise-heritage-model.cjs heritage-NNN reference.json [--texture] [--prompt-file=local-utf8.txt]');
  if (promptFile !== undefined && (!texture || !promptFile.trim() || /^[a-z]+:\/\//i.test(promptFile))) throw new Error('--prompt-file requires --texture and a local UTF-8 file');
  return { id, referenceFile, texture, promptFile };
}

async function main() {
  const { id, referenceFile, texture, promptFile } = parseRevisionArgs(process.argv.slice(2));
  let text;
  if (promptFile !== undefined) {
    const promptBytes = await fs.readFile(path.resolve(promptFile));
    if (!promptBytes.length || promptBytes.length > 64 * 1024) throw new Error('Texture prompt must be 1–65536 bytes of UTF-8');
    text = new TextDecoder('utf-8', { fatal: true }).decode(promptBytes).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('Texture prompt must not be empty');
  }
  const dir = process.env.TRIPO_BATCH_DIR || path.join(root, 'artifacts/tripo-batch');
  const statePath = path.join(dir, 'state.json');
  const lockPath = path.join(dir, 'queue.lock');
  const lock = await fs.open(lockPath, 'wx');
  await lock.writeFile(String(process.pid));
  const save = async state => {
    await fs.writeFile(statePath + '.tmp', JSON.stringify(state, null, 2));
    await fs.rename(statePath + '.tmp', statePath);
  };
  try {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (state.items.some(item => ['creating', 'submission_unknown'].includes(item.status))) throw new Error('Reconcile ambiguous submissions first');
    if (state.items.filter(item => ['queued', 'running', 'submitted'].includes(item.status)).length >= 4) throw new Error('Wait for existing tasks before another revision');
    const item = state.items.find(entry => entry.id === id);
    const reviews = JSON.parse((await fs.readFile(path.join(dir, 'visual-review.json'), 'utf8')).replace(/^\uFEFF/, ''));
    const review = reviews.find(entry => entry.id === id);
    const reference = JSON.parse(await fs.readFile(referenceFile, 'utf8'));
    validateRevision(item, review, reference);
    const imagePath = path.resolve(path.dirname(path.resolve(referenceFile)), reference.imagePath);
    const bytes = await fs.readFile(imagePath);
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('Reference image size invalid');
    if (!provider.isConfigured()) throw new Error('Tripo is not configured');
    // Query the same v3 wallet used by the normal queue; never use stale ledger funds.
    const response = await fetch('https://openapi.tripo3d.ai/v3/account/balance', {
      headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` },
      redirect: 'error', signal: AbortSignal.timeout(45000)
    });
    const wallet = await response.json();
    if (!response.ok || wallet.code !== 0 || availableCredits(wallet.data) < 150) throw new Error('Unable to verify credit reserve');
    const archive = path.join(dir, 'attempts', id, item.taskId);
    await fs.mkdir(archive, { recursive: true });
    for (const extension of ['glb', 'preview']) await fs.copyFile(path.join(dir, `${id}.${extension}`), path.join(archive, `original.${extension}`));
    const previous = { ...item }; delete previous.attempts;
    const replacement = {
      id: item.id, name: item.name, status: 'creating', submittedAt: new Date().toISOString(),
      submissionKind: 'revision',
      mode: texture ? 'texture' : 'image-to-model',
      sourceTaskId: item.taskId,
      submissionEndpoint: texture ? '/models/texture' : '/generation/image-to-model',
      attempts: [...(item.attempts || []), { ...previous, review: { ...review }, archive }],
      reference: { ...reference, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
    };
    state.items[state.items.indexOf(item)] = replacement;
    await save(state);
    review.verdict = 'pending';
    review.evidence = `${texture ? 'Geometry-preserving texture revision' : 'Reference-guided replacement'} in progress; previous review retained in attempts.`;
    const reviewPath = path.join(dir, 'visual-review.json');
    await fs.writeFile(reviewPath + '.tmp', JSON.stringify(reviews, null, 2));
    await fs.rename(reviewPath + '.tmp', reviewPath);
    try {
      const mime = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
      const onPrepared = async (payload, endpoint) => {
        replacement.payload = payload;
        replacement.submissionEndpoint = endpoint;
        await save(state);
        await fs.writeFile(path.join(archive, 'revision-request.json'), JSON.stringify({ sourceTaskId: replacement.sourceTaskId, mode: replacement.mode, endpoint, payload }, null, 2));
      };
      const created = texture
        ? await provider.createTextureTask(item.taskId, dataUrl, { text, onPrepared })
        : await provider.createImageTo3DTask(dataUrl, { face_limit: 12000, onPrepared });
      if (!created.id) throw new Error('Missing task id');
      replacement.taskId = created.id; replacement.status = 'submitted';
    } catch (error) {
      applySubmissionFailure(replacement, error);
      await save(state); throw error;
    }
    await save(state);
    console.log(JSON.stringify({ id, taskId: replacement.taskId, status: replacement.status, attempts: replacement.attempts.length }));
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateRevision, applySubmissionFailure, parseRevisionArgs, main };
