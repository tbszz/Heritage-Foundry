import { describe, expect, it } from 'vitest';
import { PET, getCruiseSpeed, getGait, getHopPose, getPetTarget } from '../src/components/SpiritPet.js';

const openBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

describe('spirit pet placement', () => {
  it('stands ahead and to the right of the visitor', () => {
    const target = getPetTarget({ x: 0, z: 8, yaw: 0 }, openBounds);
    expect(target.x).toBeCloseTo(PET.side);
    expect(target.z).toBeCloseTo(8 - PET.ahead);
  });

  it('stays inside the walkable bounds', () => {
    const target = getPetTarget({ x: 0, z: 0, yaw: 0 }, { minX: -0.5, maxX: 0.5, minZ: -1, maxZ: 1 });
    expect(target).toEqual({ x: 0.5, z: -1 });
  });
});

describe('spirit pet follow speed', () => {
  it('walks slowly nearby and runs faster the further it falls behind', () => {
    expect(getCruiseSpeed(1)).toBe(PET.walkSpeed);
    expect(getCruiseSpeed(4)).toBeGreaterThan(getCruiseSpeed(2.5));
    expect(getCruiseSpeed(PET.teleportDistance - 1)).toBe(PET.maxSpeed);
  });
});

describe('spirit pet gait', () => {
  it('stands idle when still, walks at walking pace and runs when chasing', () => {
    expect(getGait(0).idle).toBe(1);
    expect(getGait(PET.walkSpeed).walk).toBeCloseTo(1);
    expect(getGait(PET.maxSpeed).run).toBeCloseTo(1);
    [0, 0.1, PET.walkSpeed, 1.2, PET.runSpeed, PET.maxSpeed].forEach((speed) => {
      const { idle, walk, run } = getGait(speed);
      expect(idle + walk + run).toBeCloseTo(1);
    });
  });

  it('caps leg speed and leaps only when the legs cannot keep up', () => {
    expect(getGait(PET.walkSpeed).leap).toBe(0);
    expect(getGait(PET.maxSpeed).leap).toBe(1);
    expect(getGait(PET.maxSpeed).runScale).toBe(PET.maxRunScale);
  });
});

describe('spirit pet leap', () => {
  it('moves the whole body together: grounded and level at contact, highest mid-air', () => {
    const contact = getHopPose(0, 1);
    expect(contact.lift).toBeCloseTo(0);
    expect(contact.pitch).toBeCloseTo(0);
    expect(contact.squash).toBeGreaterThan(0);

    const apex = getHopPose(0.5, 1);
    expect(apex.lift).toBeGreaterThan(0.05);
    expect(apex.squash).toBeCloseTo(0);
  });

  it('lifts the nose on the way up and lowers it on the way down', () => {
    expect(getHopPose(0.25, 1).pitch).toBeLessThan(0);
    expect(getHopPose(0.75, 1).pitch).toBeGreaterThan(0);
  });

  it('settles completely when not moving', () => {
    expect(getHopPose(0.4, 0)).toEqual({ lift: 0, pitch: -0, stretch: 0, squash: 0 });
  });
});
