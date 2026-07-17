import { describe, expect, it } from 'vitest';
import { CRAFTS_DATA } from '../src/utils/craftData.js';
import { getStandLayout, HALL } from '../src/components/MuseumScene.js';

describe('museum stand layout', () => {
  it('creates a stand for every craft that has a GLB model', () => {
    const layout = getStandLayout(CRAFTS_DATA);

    expect(layout).toHaveLength(18);
    expect(layout.every((stand) => Boolean(stand.craft.modelUrl))).toBe(true);
    expect(layout.map((stand) => stand.id)).toContain('papercut');
    expect(layout.map((stand) => stand.id)).toContain('porcelain');
  });

  it('alternates stands between left and right sides, nine per side', () => {
    const layout = getStandLayout(CRAFTS_DATA);
    const left = layout.filter((stand) => stand.side === 'left');
    const right = layout.filter((stand) => stand.side === 'right');

    expect(left).toHaveLength(9);
    expect(right).toHaveLength(9);
    expect(layout[0].side).toBe('left');
    expect(layout[1].side).toBe('right');
    expect(left.every((stand) => stand.position.x === -HALL.standX)).toBe(true);
    expect(right.every((stand) => stand.position.x === HALL.standX)).toBe(true);
  });

  it('spaces rows evenly down the hall', () => {
    const layout = getStandLayout(CRAFTS_DATA);

    expect(layout[0].position.z).toBe(HALL.firstRowZ);
    for (let index = 2; index < layout.length; index += 2) {
      const row = Math.floor(index / 2);
      expect(layout[index].row).toBe(row);
      expect(layout[index].position.z).toBe(HALL.firstRowZ - row * HALL.rowSpacing);
    }
  });

  it('carries display metadata for the plaque label and panel', () => {
    const layout = getStandLayout(CRAFTS_DATA);
    const tigerHead = layout.find((stand) => stand.id === 'tiger-head');

    expect(tigerHead).toMatchObject({
      index: 0,
      row: 0,
      stopLabel: '01'
    });
    expect(tigerHead.craft.name).toBe('布老虎');
    expect(tigerHead.craft.category).toBe('传统布艺');

    layout.forEach((stand, index) => {
      expect(stand.stopLabel).toBe(String(index + 1).padStart(2, '0'));
    });
  });

  it('is deterministic for the same input', () => {
    expect(getStandLayout(CRAFTS_DATA)).toEqual(getStandLayout(CRAFTS_DATA));
  });
});
