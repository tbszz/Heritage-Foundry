# Generator Home Style and Smooth Craft Switching Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the creative generator with the homepage museum aesthetic and make rapid craft switching continuous and responsive.

**Architecture:** Keep the existing Vite multi-page structure and shared stylesheet. Add a small, testable model-cache contract to the particle scene so selections reuse in-flight or loaded GLB assets, then update the homepage transition state without blocking further input. Restyle the generator through a scoped `generator-shell` skin so crafts and existing shared pages are not unintentionally changed.

**Tech Stack:** Vite, vanilla ES modules, Three.js, Tween.js, CSS, Vitest.

---

### Task 1: Lock the smooth-switching behavior

**Files:**
- Modify: `tests/homepage-hero.test.js`
- Modify: `src/components/ParticleMorphScene.js`

1. Add failing tests for a reusable GLB model cache and transition timing.
2. Run `npm test -- tests/homepage-hero.test.js` and confirm the new assertions fail.
3. Implement cached model loading with cloned scene instances and shorter interruptible morph timing.
4. Run the targeted test and confirm it passes.

### Task 2: Align the generator with the homepage design contract

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/generator.html`
- Modify: `src/style.css`
- Modify: `tests/frontend-prompt.test.js`

1. Add failing structural assertions for the generator museum shell and workspace landmarks.
2. Run the targeted test and confirm failure.
3. Add semantic generator shell markup and scoped dark-museum styling using existing assets/tokens.
4. Preserve existing element IDs and generator behavior.
5. Run the targeted test and confirm it passes.

### Task 3: Verify behavior and presentation

**Files:**
- Modify only if verification reveals defects.

1. Run `npm test`.
2. Run `npm run build`.
3. Start the Vite app and inspect homepage rapid switching plus generator desktop/mobile layouts.
4. Fix any observed issue and repeat the smallest relevant checks.
