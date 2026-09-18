#!/usr/bin/env node
// Runs the already-authorized 100-item catalog; never retries ambiguous paid submissions.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { isTerminalNoPaidSubmissionFailure } = require('./generate-heritage-models.cjs');
const statePath = path.join(process.env.TRIPO_BATCH_DIR || path.join(root, 'artifacts/tripo-batch'), 'state.json');
function tick() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--use-env-proxy', path.join(__dirname, 'generate-heritage-models.cjs'), '--submit=4'], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Queue exited ${code}; inspect ledger before resuming`)));
  });
}
async function shouldExitWhenRecovered(state, batchDir) {
  if (!state.items.length) return false;
  const terminal = state.items.filter(item => ['downloaded', 'failed', 'cancelled'].includes(item.status) || isTerminalNoPaidSubmissionFailure(item));
  if (terminal.length !== state.items.length) return false;
  if (state.items.some(isTerminalNoPaidSubmissionFailure)) return true;
  if (state.referenceMode?.required && state.referenceMode.eligible === 0) return true;
  try {
    await fs.access(path.join(batchDir, 'hold-submissions'));
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}
async function main() {
  let failures = 0;
  while (true) {
    try { await tick(); failures = 0; }
    catch (error) {
      const snapshot = JSON.parse(await fs.readFile(statePath, 'utf8'));
      if (snapshot.items.some(item => ['creating', 'submission_unknown'].includes(item.status)) || ++failures >= 5) throw error;
      // A saved task_id is authoritative. Retry observation of the same tasks,
      // while the child keeps its exclusive lock and paid-submission checks.
      console.error(`Observation failed; resuming the existing ledger (attempt ${failures}/5)`);
      await new Promise(resolve => setTimeout(resolve, 30000));
      continue;
    }
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    const terminal = state.items.filter(item => ['downloaded', 'failed', 'cancelled'].includes(item.status) || isTerminalNoPaidSubmissionFailure(item));
    console.log(JSON.stringify({ batch: 'heritage-100', submitted: state.items.length, terminal: terminal.length, at: new Date().toISOString() }));
    if (state.items.length === 100 && terminal.length === 100) break;
    if (await shouldExitWhenRecovered(state, path.dirname(statePath))) {
      console.log('Existing tasks recovered; new submissions await reference review.');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { shouldExitWhenRecovered };
