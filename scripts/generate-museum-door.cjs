// Separate paid asset task. Never retry a create without reconciling its task ID.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const provider = require('../services/threeD/providers/tripo');
const { download } = require('./generate-heritage-models.cjs');
const dir = path.join(root, 'artifacts/tripo-batch/museum-door-20260912');
const ledger = path.join(dir, 'task.json');
async function main() {
  if (process.argv.includes('--submit')) {
    if (fs.existsSync(ledger)) throw new Error('Existing task ledger: poll or reconcile, do not resubmit');
    const state = { status: 'creating', at: new Date().toISOString(), reference: 'reference.png' };
    fs.writeFileSync(ledger, JSON.stringify(state, null, 2));
    try {
      const bytes = fs.readFileSync(path.join(dir, 'reference.png'));
      const task = await provider.createImageTo3DTask(`data:image/png;base64,${bytes.toString('base64')}`, { face_limit: 10000 });
      state.taskId = task.id; state.status = 'submitted';
    } catch (error) { state.status = error.tripoPaidCreateAttempted === false ? 'upload_failed' : 'submission_unknown'; state.error = error.message; }
    fs.writeFileSync(ledger, JSON.stringify(state, null, 2));
    console.log(JSON.stringify(state));
    return;
  }
  const state = JSON.parse(fs.readFileSync(ledger));
  if (!state.taskId) throw new Error('Reconcile unknown task before retry');
  const response = await fetch(`https://openapi.tripo3d.ai/v3/tasks/${state.taskId}`, { headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` }, signal: AbortSignal.timeout(45000) });
  const result = await response.json();
  if (!response.ok || result.code !== 0) throw new Error(`Task lookup HTTP ${response.status}`);
  state.status = result.data.status; state.progress = result.data.progress;
  if (state.status === 'success') {
    await download(result.data.output.model_url, path.join(dir, 'door.glb'));
    if (result.data.output.rendered_image_url) await download(result.data.output.rendered_image_url, path.join(dir, 'preview.png'));
    state.status = 'downloaded';
  }
  fs.writeFileSync(ledger, JSON.stringify(state, null, 2)); console.log(JSON.stringify(state));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
