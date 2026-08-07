import { describe, expect, it } from 'vitest';
import {
  getCraftDistributionRows,
  getStatsDistributionMarkup
} from '../src/home.js';

describe('V3 homepage stats distribution', () => {
  it('sorts craft distribution rows and scales bars against the largest count', () => {
    expect(getCraftDistributionRows({
      苗绣: 6,
      剪纸: 8,
      陶瓷: 4,
      空值: 0
    })).toEqual([
      { name: '剪纸', count: 8, percent: 100 },
      { name: '苗绣', count: 6, percent: 75 },
      { name: '陶瓷', count: 4, percent: 50 }
    ]);
  });

  it('renders no chart when the distribution is empty', () => {
    expect(getStatsDistributionMarkup({})).toBe('');
  });

  it('renders an accessible compact bar chart when distribution data exists', () => {
    const markup = getStatsDistributionMarkup({ 剪纸: 8, 苗绣: 4 });

    expect(markup).toContain('stats-distribution-title');
    expect(markup).toContain('aria-label="剪纸 8 件作品"');
    expect(markup).toContain('--bar-width: 100%');
    expect(markup).toContain('--bar-width: 50%');
  });
});
