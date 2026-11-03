import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM } from '../src/components/SketchCorridorScene.js';
import {
  BAKED_HALLS, EARTH_HALL, getBakedHallLayout, getBakedHallShellUrl, getEarthHallLayout, getVaultSag, hasThemedHall
} from '../src/components/museumHalls.js';

const crafts = JSON.parse(readFileSync(new URL('../src/data/crafts.json', import.meta.url), 'utf8'));
const corridorJs = readFileSync(new URL('../src/components/SketchCorridorScene.js', import.meta.url), 'utf8');
const earthCrafts = crafts.filter((craft) => ['陶瓷', '陶塑'].includes(craft.category) && craft.modelUrl);
// 与 home.js 的展厅分类一致
const BAKED_CATEGORIES = {
  thread: ['织绣', '民俗'],
  carving: ['竹编', '木雕'],
  lacquer: ['漆器', '金工'],
  paper: ['灯彩', '戏曲与乐器']
};
const hallCrafts = (id) => crafts.filter((craft) => BAKED_CATEGORIES[id].includes(craft.category) && craft.modelUrl);

describe('themed museum halls', () => {
  it('themes all five chapters, unknown chapters keep the default room', () => {
    ['earth', 'thread', 'carving', 'lacquer', 'paper'].forEach((id) => expect(hasThemedHall(id)).toBe(true));
    expect(hasThemedHall('tiger')).toBe(false);
    expect(hasThemedHall(undefined)).toBe(false);
  });

  it('splits each baked hall by category: first category left, the other right', () => {
    Object.entries(BAKED_CATEGORIES).forEach(([id, [left]]) => {
      expect(BAKED_HALLS[id].left.category).toBe(left);
      const layout = getBakedHallLayout(id, hallCrafts(id));
      expect(layout.length).toBeGreaterThan(0);
      expect(new Set(layout.map((item) => item.id)).size).toBe(layout.length);
      layout.forEach((item, index) => {
        expect(item.index).toBe(index);
        if (index) expect(item.u).toBeGreaterThanOrEqual(layout[index - 1].u);
        expect(item.x < 0).toBe(item.craft.category === left);
      });
    });
  });

  it('keeps baked-hall exhibits inside the hall, on their stands and reachable from the camera rail', () => {
    const lastCameraU = ROOM.cameraDeep - ROOM.wallX;
    Object.keys(BAKED_HALLS).forEach((id) => {
      const many = Array.from({ length: 30 }, (_, index) => ({ id: `${id}-${index}`, category: index % 2 ? 'x' : BAKED_HALLS[id].left.category }));
      const layout = getBakedHallLayout(id, many);
      expect(layout).toHaveLength(EARTH_HALL.perSide * 2);
      layout.forEach((item) => {
        expect(item.u).toBeGreaterThan(ROOM.cameraEnter - ROOM.wallX);
        expect(item.u).toBeLessThan(lastCameraU);
        expect(Math.abs(item.x) + 0.6).toBeLessThan(ROOM.width / 2);
        expect(item.anchorY).toBeGreaterThan(item.top + item.modelSize / 2);
        expect(item.labelY).toBeLessThan(item.top);
      });
    });
    expect(getBakedHallLayout('carving', [])).toHaveLength(0);
    expect(getBakedHallLayout('nope', crafts)).toHaveLength(0);
  });

  it('ships a baked shell for every baked hall and fetches it only near the door', () => {
    Object.keys(BAKED_HALLS).forEach((id) => {
      expect(existsSync(new URL(`../public${getBakedHallShellUrl(id)}`, import.meta.url))).toBe(true);
      BAKED_HALLS[id].lamps.forEach(([x, y, u]) => {
        expect(Math.abs(x)).toBeLessThan(ROOM.width / 2);
        expect(y).toBeLessThan(ROOM.height);
        expect(u).toBeLessThan(ROOM.depth);
      });
    });
    expect(corridorJs).toContain('if (door.spot.visible && this.hallShellsReady) door.hall?.preload?.();');
  });

  it('puts porcelain in the left vitrines and clay figures on the right tiers', () => {
    const layout = getEarthHallLayout(earthCrafts);
    expect(layout).toHaveLength(earthCrafts.length);
    expect(new Set(layout.map((item) => item.id)).size).toBe(layout.length);
    layout.forEach((item) => {
      if (item.craft.category === '陶瓷') {
        expect(item.kind).toBe('vitrine');
        expect(item.x).toBeLessThan(0);
      } else {
        expect(item.kind).toBe('figure');
        expect(item.x).toBeGreaterThan(0);
      }
    });
    // 泥塑前后交错
    const figures = layout.filter((item) => item.kind === 'figure');
    expect(figures.map((item) => item.tier).slice(0, 4)).toEqual(['front', 'back', 'front', 'back']);
  });

  it('orders the tour by depth so number shortcuts walk front to back', () => {
    const layout = getEarthHallLayout(earthCrafts);
    layout.forEach((item, index) => {
      expect(item.index).toBe(index);
      if (index) expect(item.u).toBeGreaterThanOrEqual(layout[index - 1].u);
    });
  });

  it('keeps every exhibit inside the hall and reachable from the camera rail', () => {
    const lastCameraU = ROOM.cameraDeep - ROOM.wallX;
    getEarthHallLayout(earthCrafts).forEach((item) => {
      expect(item.u).toBeGreaterThan(ROOM.cameraEnter - ROOM.wallX);
      expect(item.u).toBeLessThan(lastCameraU);
      expect(Math.abs(item.x) + 0.6).toBeLessThan(ROOM.width / 2);
      expect(item.anchorY).toBeGreaterThan(item.top + item.modelSize / 2);
    });
  });

  it('caps each side so a large category cannot run into the kiln', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `p-${index}`, category: '陶瓷' }));
    const layout = getEarthHallLayout(many);
    expect(layout).toHaveLength(EARTH_HALL.perSide);
    expect(getEarthHallLayout([])).toHaveLength(0);
  });

  it('springs the vault from the wall tops and peaks at the centre', () => {
    expect(getVaultSag(ROOM.width / 2, ROOM.width)).toBeCloseTo(0, 6);
    expect(getVaultSag(-ROOM.width / 2, ROOM.width)).toBeCloseTo(0, 6);
    expect(getVaultSag(0, ROOM.width)).toBeCloseTo(EARTH_HALL.vaultRise, 6);
  });

  it('ships the baked earth hall shell and fetches it lazily', () => {
    expect(existsSync(new URL(`../public${EARTH_HALL.shellUrl}`, import.meta.url))).toBe(true);
    expect(corridorJs).toContain('door.hall?.preload?.()');
    expect(corridorJs).toContain('loadModel: (url) => this.loader.loadAsync(url)');
    // 吊灯光晕要对准烘焙件里的吊灯：两侧各一盏，挂在拱券之间
    EARTH_HALL.lamps.forEach(([x, u]) => {
      expect(Math.abs(x)).toBeLessThan(ROOM.width / 2);
      expect(u % EARTH_HALL.archEvery).toBe(0);
    });
  });

  it('hides each hall behind its door until the visitor walks in', () => {
    expect(corridorJs).toContain('roomGroup.visible = false;');
    expect(corridorJs).toContain('door.roomGroup.visible = true;');
    expect(corridorJs).toContain('if (!door.opened) door.roomGroup.visible = false;');
  });
});
