import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CORRIDOR,
  ROOM,
  SketchCorridorScene,
  clampCorridorZ,
  getCorridorDoorLayout,
  getCorridorRailBounds,
  getFeatureDoorLayout,
  getGeneratorDoorLayout,
  getRoomStandLayout,
  getWallSegments
} from '../src/components/SketchCorridorScene.js';

const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../src/home.js', import.meta.url), 'utf8');
const generatorHtml = readFileSync(new URL('../src/generator.html', import.meta.url), 'utf8');
const corridorJs = readFileSync(new URL('../src/components/SketchCorridorScene.js', import.meta.url), 'utf8');

const chapters = [
  { id: 'thread', title: '经纬成章', subtitle: '线与布的记忆' },
  { id: 'paper', title: '纸上万象', subtitle: '刀、墨、光与影' },
  { id: 'earth', title: '火土新生', subtitle: '泥土与时间' },
  { id: 'carving', title: '雕刻万物', subtitle: '减去，留下' }
];

describe('sketch corridor scene', () => {
  it('lays out one door per chapter, alternating sides, receding down the hall', () => {
    const layout = getCorridorDoorLayout(chapters);
    expect(layout).toHaveLength(4);
    expect(layout.map((door) => door.id)).toEqual(['thread', 'paper', 'earth', 'carving']);
    expect(layout.every((door) => door.kind === 'chapter')).toBe(true);
    expect(layout.map((door) => door.side)).toEqual(['left', 'right', 'left', 'right']);
    expect(layout[0].position.z).toBe(CORRIDOR.firstDoorZ);
    expect(layout[1].position.z).toBe(CORRIDOR.firstDoorZ - CORRIDOR.doorSpacing);
    // 门贴两侧墙
    expect(layout[0].position.x).toBeLessThan(0);
    expect(layout[1].position.x).toBeGreaterThan(0);
  });

  it('places the AI generator door after the last chapter door', () => {
    const door = getGeneratorDoorLayout(4);
    expect(door.id).toBe('generator');
    expect(door.kind).toBe('generator');
    expect(door.side).toBe('left'); // 4 扇展厅门之后交替到左侧
    expect(door.position.z).toBe(
      CORRIDOR.firstDoorZ - 3 * CORRIDOR.doorSpacing - CORRIDOR.generatorGap
    );
    expect(door.chapter.title).toContain('AI');
  });

  it('places feature doors (gallery / map) after the generator door, alternating sides', () => {
    const doors = getFeatureDoorLayout(4);
    expect(doors).toHaveLength(2);
    expect(doors.map((door) => door.featureId)).toEqual(['gallery', 'map']);
    expect(doors.every((door) => door.kind === 'feature')).toBe(true);
    const generator = getGeneratorDoorLayout(4);
    // 共创画廊在共创门之后（右侧），山河图志再往后（左侧）
    expect(doors[0].side).toBe('right');
    expect(doors[1].side).toBe('left');
    expect(doors[0].position.z).toBe(generator.position.z - CORRIDOR.doorSpacing);
    expect(doors[1].position.z).toBe(generator.position.z - 2 * CORRIDOR.doorSpacing);
    // 轨道边界要覆盖到最后一扇功能门之后
    const bounds = getCorridorRailBounds(4);
    expect(bounds.minZ).toBeLessThan(doors[1].position.z);
  });

  it('clamps the camera rail to the corridor bounds', () => {
    const bounds = getCorridorRailBounds(4);
    expect(bounds.maxZ).toBe(CORRIDOR.startZ);
    expect(bounds.minZ).toBeLessThan(CORRIDOR.firstDoorZ - 3 * CORRIDOR.doorSpacing);

    expect(clampCorridorZ(bounds.maxZ + 5, bounds)).toBe(bounds.maxZ);
    expect(clampCorridorZ(bounds.minZ - 5, bounds)).toBe(bounds.minZ);
    expect(clampCorridorZ(0, bounds)).toBe(0);
  });

  it('handles an empty chapter list without producing a positive minZ', () => {
    const bounds = getCorridorRailBounds(0);
    expect(bounds.minZ).toBeLessThan(bounds.maxZ);
  });

  it('cuts wall segments around door holes', () => {
    const segments = getWallSegments([-6, -24], 14, -42, 1.14);
    // 两扇门 → 三段墙板，且洞口与门对齐
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ from: 14, to: -6 + 1.14 });
    expect(segments[1]).toEqual({ from: -6 - 1.14, to: -24 + 1.14 });
    expect(segments[2].from).toBe(-24 - 1.14);
    expect(segments[2].to).toBe(-42);
    // 无门时整面墙一段
    expect(getWallSegments([], 14, -42)).toEqual([{ from: 14, to: -42 }]);
  });

  it('lays out room stands behind the door, alternating across the doorway axis', () => {
    const door = { side: 'left', position: { z: -6 } };
    const crafts = Array.from({ length: 7 }, (_, index) => ({
      id: `craft-${index}`,
      name: `展品${index}`,
      modelUrl: `/models/${index}.glb`
    }));
    const layout = getRoomStandLayout(crafts, door);
    expect(layout).toHaveLength(7);
    // 左侧门的房间向 -x 深入，展台沿 x 排距推进
    expect(layout[0].position.x).toBe(-ROOM.standFirstX);
    expect(layout[2].position.x).toBe(-(ROOM.standFirstX + ROOM.standSpacing));
    // 展台在门轴两侧交替
    expect(layout[0].position.z).toBe(-6 - ROOM.standZ);
    expect(layout[1].position.z).toBe(-6 + ROOM.standZ);
    // 展台不越出房间进深
    layout.forEach((stand) => {
      expect(Math.abs(stand.position.x)).toBeLessThan(ROOM.wallX + ROOM.depth);
    });
  });

  it('caps room stands at ROOM.maxStands', () => {
    const crafts = Array.from({ length: 20 }, (_, index) => ({ id: `c-${index}`, modelUrl: '/m.glb' }));
    expect(getRoomStandLayout(crafts, { side: 'right', position: { z: 0 } })).toHaveLength(ROOM.maxStands);
    expect(getRoomStandLayout([])).toHaveLength(0);
  });

  it('routes heritage guide IDs through the same guarded chapter entrance', () => {
    const scene = Object.create(SketchCorridorScene.prototype);
    scene.doors = getCorridorDoorLayout(chapters);
    scene.activeDoor = null;
    scene.viewState = 'corridor';
    scene.inputEnabled = true;
    scene.renderPaused = false;
    scene.disposed = false;
    scene.enterRoom = vi.fn();

    expect(scene.enterChapter('tiger-head')).toBe(true);
    expect(scene.activeDoor.id).toBe('thread');
    expect(scene.enterRoom).toHaveBeenCalledOnce();

    scene.activeDoor = null;
    scene.enterRoom.mockClear();
    expect(scene.enterChapter('shadow')).toBe(true);
    expect(scene.activeDoor.id).toBe('paper');

    scene.activeDoor = null;
    scene.inputEnabled = false;
    expect(scene.enterChapter('paper')).toBe(false);

    scene.inputEnabled = true;
    scene.renderPaused = true;
    expect(scene.enterChapter('paper')).toBe(false);

    scene.renderPaused = false;
    scene.disposed = true;
    expect(scene.enterChapter('paper')).toBe(false);

    scene.disposed = false;
    expect(scene.enterChapter('unknown')).toBe(false);
  });

  it('can redirect from an open room through a guarded corridor transition', () => {
    expect(corridorJs).toContain('switchChapter(chapterId)');
    expect(corridorJs).toContain('this.exitRoom();');
    expect(corridorJs).toContain('this.enterChapter(chapterId)');
  });

  it('keeps the dynamic corridor dormant during homepage initialization', () => {
    const initBlock = homeJs.match(/async function initHomePage\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(initBlock).not.toContain('bindSketchCorridor();');
    expect(homeJs).toContain("import('./components/SketchCorridorScene.js')");
    expect(homeJs).not.toContain("from './components/SketchCorridorScene.js'");
    expect(homeJs).toContain("document.getElementById('sketch-corridor')");
    expect(homeJs).toContain('is-corridor-live');
  });

  it('wires room navigation and craft selection into the homepage', () => {
    expect(homeJs).toContain('onRoomEnter');
    expect(homeJs).toContain('onRoomExit');
    expect(homeJs).toContain('onSelectCraft');
    expect(homeJs).toContain('exitRoom()');
    expect(indexHtml).toContain('id="corridor-back"');
    expect(indexHtml).toContain('id="sketch-corridor-hud"');
  });

  it('shows a real 3D model inside the artifact dialog instead of a flat image', () => {
    expect(indexHtml).toContain('id="artifact-3d-stage"');
    expect(indexHtml).not.toContain('id="artifact-image"');
    expect(homeJs).toContain("document.getElementById('artifact-3d-stage')");
    expect(homeJs).toContain('stage?.setModel(craft.modelUrl)');
  });

  it('keeps the museum stage shell and accessibility fallbacks in place', () => {
    expect(indexHtml).toContain('id="museum-stage"');
    expect(indexHtml).toContain('id="sketch-corridor"');
    expect(indexHtml).toContain('id="artifact-dialog"');
    expect(indexHtml).not.toContain('museum-container');
    expect(indexHtml).not.toContain('WASD');
  });

  it('offers numeric keyboard shortcuts for halls and room artifacts', () => {
    const keydownBlock = corridorJs.match(/this\.keydownHandler = \(event\) => \{([\s\S]*?)\n    \};/)?.[1] || '';

    expect(corridorJs).toContain("event.code.match(/^Digit([1-9])$/)");
    expect(corridorJs).toContain('this.container.contains(document.activeElement)');
    expect(corridorJs).toContain("this.doors.filter((door) => door.kind === 'chapter')");
    expect(corridorJs).toContain('this.currentDoor?.roomStands');
    expect(corridorJs).toContain('this.callbacks.onSelectCraft?.(stand.craft)');
    expect(keydownBlock.indexOf('corridorFocused')).toBeLessThan(keydownBlock.indexOf("event.code === 'Escape'"));
  });

  it('does not auto-spin or float room models when reduced motion is requested', () => {
    expect(corridorJs).toContain("if (!this.reducedMotion && this.viewState === 'room' && this.currentDoor)");
  });

  it('themes the generator workspace with the same museum language', () => {
    expect(generatorHtml).toContain('generator-museum.css');
  });
});
