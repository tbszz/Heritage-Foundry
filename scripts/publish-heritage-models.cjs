#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('./heritage-model-catalog.cjs');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
const DIR = process.env.TRIPO_BATCH_DIR || path.join(ROOT, 'artifacts/tripo-batch');
async function main() {
  const reports = JSON.parse(await fs.readFile(path.join(DIR, 'optimization-report.json'), 'utf8'));
  const reviews = JSON.parse(await fs.readFile(path.join(DIR, 'visual-review.json'), 'utf8'));
  const items = [];
  for (const report of reports.filter(entry => entry.technicalCheck === 'passed')) {
    const review = reviews.find(entry => entry.id === report.id && entry.verdict === 'approved');
    if (!review) continue;
    const spec = catalog.find(entry => entry.id === report.id);
    if (!spec) throw new Error('Unknown artifact');
    await fs.access(path.join(ROOT, 'public', report.modelUrl));
    await fs.access(path.join(ROOT, 'public', report.previewUrl));
    items.push({ id: spec.id, name: spec.name, category: spec.category, description: spec.provenance, modelUrl: report.modelUrl, previewUrl: report.previewUrl, triangles: report.after.triangles, bytes: report.outputBytes, visualReview: 'approved' });
  }
  const target = path.join(ROOT, 'public/data/heritage-collection.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', JSON.stringify({ version: 1, items }, null, 2));
  await fs.rename(target + '.tmp', target);
  console.log(JSON.stringify({ published: items.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
