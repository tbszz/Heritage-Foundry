import { describe, expect, it } from 'vitest';
import { getInitialCraftId } from '../src/crafts.js';

describe('crafts page URL selection', () => {
  it('reads the craft query parameter when it exists', () => {
    expect(getInitialCraftId('?craft=tangka')).toBe('tangka');
  });

  it('falls back to the first craft when the query parameter is missing', () => {
    expect(getInitialCraftId('')).toBe('tiger-head');
  });
});
