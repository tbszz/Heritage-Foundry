import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseOptimizationIds, selectOptimizationItems, mergeOptimizationReports } from '../scripts/optimization-selection.mjs';

const catalog = ['heritage-001', 'heritage-026', 'heritage-027'].map(id => ({ id, name: id }));
const items = [{ id: 'heritage-001', status: 'downloaded' }, { id: 'heritage-026', status: 'downloaded' }, { id: 'heritage-027', status: 'downloaded' }];

describe('incremental optimization selection', () => {
  it('keeps default full downloaded selection and replaces the full report', () => {
    const ids = parseOptimizationIds([]);
    expect(ids).toBeNull();
    expect(selectOptimizationItems(ids, [...items, { id: 'heritage-999', status: 'running' }], catalog).map(job => job.item.id)).toEqual(items.map(item => item.id));
    const reports = [{ id: 'heritage-026', technicalCheck: 'passed' }];
    expect(mergeOptimizationReports([{ id: 'old' }], reports, ids)).toBe(reports);
  });

  it('selects exactly the requested downloaded IDs in argument order', () => {
    const ids = parseOptimizationIds(['--ids=heritage-027,heritage-026']);
    const jobs = selectOptimizationItems(ids, items, catalog);
    expect(jobs.map(job => job.spec.id)).toEqual(['heritage-027', 'heritage-026']);
    expect(jobs.every(job => job.item.status === 'downloaded')).toBe(true);
  });

  it.each([
    ['--ids='], ['--ids=heritage-026,'], ['--ids=,heritage-026'], ['--ids=heritage-026,,heritage-027'],
    ['--ids=heritage-026,heritage-026'], ['--ids=heritage-26'], ['--ids=../heritage-026'], ['--ids=heritage-026, heritage-027'],
    ['--ids', 'heritage-026'], ['--ids=heritage-026', '--ids=heritage-027'], ['--all']
  ])('rejects malformed/empty/duplicate arguments %j', (...args) => {
    expect(() => parseOptimizationIds(args)).toThrow();
  });

  it.each(['running', 'submitted', 'failed', 'submission_unknown'])('rejects a later non-downloaded ID before processing any selected model: %s', status => {
    const optimize = vi.fn();
    expect(() => {
      const jobs = selectOptimizationItems(['heritage-026', 'heritage-027'], [items[1], { ...items[2], status }], catalog);
      for (const job of jobs) optimize(job);
    }).toThrow('downloaded');
    expect(optimize).not.toHaveBeenCalled();
  });

  it('rejects unknown catalog IDs, missing ledger entries and duplicate ledger identities before work', () => {
    expect(() => selectOptimizationItems(['heritage-999'], [{ id: 'heritage-999', status: 'downloaded' }], catalog)).toThrow('Unknown catalog');
    expect(() => selectOptimizationItems(['heritage-027'], [items[1]], catalog)).toThrow('downloaded');
    expect(() => selectOptimizationItems(['heritage-026'], [items[1], items[1]], catalog)).toThrow('exactly one');
  });
});

describe('incremental report replacement', () => {
  it('retains all unrelated results while replacing a stale passed target with failed', () => {
    const unrelated = { id: 'heritage-001', technicalCheck: 'passed', visualReview: 'approved', outputBytes: 100, details: { retained: true } };
    const old = [unrelated, { id: 'heritage-026', technicalCheck: 'passed', outputBytes: 90 }, { id: 'heritage-027', technicalCheck: 'passed' }];
    const fresh = [{ id: 'heritage-026', technicalCheck: 'failed', error: 'invalid geometry' }, { id: 'heritage-027', technicalCheck: 'passed', outputBytes: 80 }];
    const result = mergeOptimizationReports(old, fresh, ['heritage-026', 'heritage-027']);
    expect(result).toEqual([unrelated, ...fresh]);
    expect(result[0]).toBe(unrelated);
    expect(result.filter(row => row.id === 'heritage-026')).toEqual([fresh[0]]);
    expect(old[1].technicalCheck).toBe('passed'); // Caller inputs are not mutated.
  });

  it('appends first incremental results when no report exists', () => {
    const fresh = [{ id: 'heritage-026', technicalCheck: 'failed', error: 'missing input' }];
    expect(mergeOptimizationReports([], fresh, ['heritage-026'])).toEqual(fresh);
  });

  it('removes all stale duplicate rows for a failed target while retaining unrelated rows', () => {
    const old = [{ id: 'heritage-026', technicalCheck: 'passed' }, { id: 'heritage-001' }, { id: 'heritage-026', technicalCheck: 'passed' }];
    const failure = { id: 'heritage-026', technicalCheck: 'failed' };
    expect(mergeOptimizationReports(old, [failure], ['heritage-026'])).toEqual([{ id: 'heritage-001' }, failure]);
  });

  it.each([[], [{ id: 'heritage-999' }], [{ id: 'heritage-026' }, { id: 'heritage-026' }]].map(results => ({ results })))('refuses incomplete or misidentified new reports', ({ results }) => {
    expect(() => mergeOptimizationReports([], results, ['heritage-026', 'heritage-027'])).toThrow('fresh result');
  });
});

async function runOptimizerMock(ledgerItems, priorReport) {
  const optimizerPath = path.resolve('scripts/optimize-heritage-models.mjs');
  const body = readFileSync(optimizerPath, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '').replace('import.meta.url', '"mock-module"');
  const writes = vi.fn(async () => {}), directories = vi.fn(async () => {}), modelReads = vi.fn(async () => { throw new Error('fixture invalid model'); });
  class MockNodeIO {
    registerExtensions() { return this; }
    registerDependencies() { return this; }
    read(file) { return modelReads(file); }
  }
  const context = {
    NodeIO: MockNodeIO, ALL_EXTENSIONS: [],
    draco3d: { createDecoderModule: async () => ({}), createEncoderModule: async () => ({}) },
    path, fileURLToPath: () => optimizerPath, dotenv: { config: () => {} }, catalog,
    process: { argv: ['node', 'optimizer', '--ids=heritage-026,heritage-027'], env: {} },
    console: { log: () => {} },
    readFile: async file => file.endsWith('state.json') ? JSON.stringify({ items: ledgerItems }) : JSON.stringify(priorReport),
    mkdir: directories, writeFile: writes,
    parseOptimizationIds, selectOptimizationItems, mergeOptimizationReports
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let error;
  try { await new AsyncFunction(...Object.keys(context), body)(...Object.values(context)); } catch (caught) { error = caught; }
  return { writes, directories, modelReads, error, exitCode: context.process.exitCode };
}

describe('optimizer CLI execution with isolated filesystem and model decoder', () => {
  it('does not mkdir, read a model or write a report when any requested ID fails preflight', async () => {
    const run = await runOptimizerMock([items[1], { ...items[2], status: 'running' }], []);
    expect(run.error.message).toContain('downloaded');
    expect(run.directories).not.toHaveBeenCalled();
    expect(run.modelReads).not.toHaveBeenCalled();
    expect(run.writes).not.toHaveBeenCalled();
  });

  it('processes only selected models and records actual caught failures over stale passes', async () => {
    const other = { id: 'heritage-001', technicalCheck: 'passed', visualReview: 'approved' };
    const run = await runOptimizerMock(items, [other, { id: 'heritage-026', technicalCheck: 'passed' }, { id: 'heritage-027', technicalCheck: 'passed' }]);
    expect(run.error).toBeUndefined();
    expect(run.exitCode).toBe(1);
    expect(run.modelReads.mock.calls.map(([file]) => path.basename(file))).toEqual(['heritage-026.glb', 'heritage-027.glb']);
    expect(run.writes).toHaveBeenCalledOnce();
    const report = JSON.parse(run.writes.mock.calls[0][1]);
    expect(report[0]).toEqual(other);
    expect(report.slice(1)).toEqual([
      { id: 'heritage-026', name: 'heritage-026', technicalCheck: 'failed', error: 'fixture invalid model' },
      { id: 'heritage-027', name: 'heritage-027', technicalCheck: 'failed', error: 'fixture invalid model' }
    ]);
  });
});
