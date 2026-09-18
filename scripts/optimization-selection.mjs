export function parseOptimizationIds(args) {
  if (args.length === 0) return null;
  if (args.length !== 1 || !args[0].startsWith('--ids=')) {
    throw new Error('Usage: optimize-heritage-models.mjs [--ids=heritage-026,heritage-027]');
  }
  const ids = args[0].slice('--ids='.length).split(',');
  if (ids.some(id => !/^heritage-\d{3}$/.test(id))) {
    throw new Error('--ids must contain non-empty, valid heritage-NNN IDs');
  }
  if (new Set(ids).size !== ids.length) throw new Error('--ids must not contain duplicate IDs');
  return ids;
}

export function selectOptimizationItems(ids, items, catalog) {
  const selected = ids === null
    ? items.filter(item => item.status === 'downloaded')
    : ids.map(id => {
      const matches = items.filter(item => item.id === id);
      if (matches.length !== 1 || matches[0].status !== 'downloaded') {
        throw new Error(`Requested ID must identify exactly one downloaded item: ${id}`);
      }
      return matches[0];
    });
  // Resolve the whole plan before any optimization starts, including later IDs.
  return selected.map(item => {
    const spec = catalog.find(entry => entry.id === item.id);
    if (!spec) throw new Error(`Unknown catalog id: ${item.id}`);
    return { item, spec };
  });
}

export function mergeOptimizationReports(previous, results, ids) {
  if (ids === null) return results;
  if (!Array.isArray(previous)) throw new Error('Existing optimization report must be an array');
  const targets = new Set(ids);
  if (results.length !== ids.length || new Set(results.map(result => result.id)).size !== ids.length || results.some(result => !targets.has(result.id))) {
    throw new Error('Incremental report must include exactly one fresh result for every requested ID');
  }
  return [...previous.filter(result => !targets.has(result.id)), ...results];
}
