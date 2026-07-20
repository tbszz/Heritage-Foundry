# True 3D Cultural Products Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace box-like image mockups with realistic product carriers and add a real asynchronous image-to-3D GLB workflow for figurines.

**Architecture:** Keep stable product geometry in Three.js as PBR carrier meshes with a separate print/decal layer, while treating Gemini output as artwork or a 3D reference image only. Add a server-only Meshy adapter that creates and polls image-to-3D jobs, normalize its response for the browser, and load successful GLB output through the existing ThreeScene.

**Tech Stack:** Vite multi-page app, vanilla ES modules, Three.js 0.160, Express 5, Google GenAI, Meshy REST API, Vitest, Supertest.

---

### Task 1: Lock carrier-specific generation behavior

**Files:**
- Modify: `tests/frontend-prompt.test.js`
- Modify: `tests/prompt-service.test.js`
- Modify: `src/utils/apiService.js`
- Modify: `services/promptService.js`

**Steps:**
1. Add failing tests proving tote/phone/magnet prompts do not inherit the 18x12 perler constraint and figurine prompts request an isolated full-body 3D reference.
2. Run `npm test -- tests/frontend-prompt.test.js tests/prompt-service.test.js` and confirm the new assertions fail for the current generic prompt.
3. Introduce a small carrier constraint map and build the client/server prompts from the selected carrier.
4. Re-run the targeted tests and then the full prompt suites.

### Task 2: Add a server-only Meshy provider adapter

**Files:**
- Create: `tests/three-d-service.test.js`
- Create: `services/threeDService.js`
- Modify: `.env.example`

**Steps:**
1. Write failing tests for missing configuration, create payload/auth, normalized status, upstream errors and successful GLB extraction.
2. Run `npm test -- tests/three-d-service.test.js` and confirm module-not-found/behavior failures.
3. Implement `createImageTo3DTask()` and `getImageTo3DTask()` with injected `fetch`, server-only env access and stable error objects.
4. Run the targeted test to green and refactor only after it passes.

### Task 3: Expose normalized 3D task routes

**Files:**
- Create: `tests/generate-3d-route.test.js`
- Create: `routes/generate3d.js`
- Modify: `server.js`

**Steps:**
1. Write failing Supertest cases for 400 validation, 503 configuration, 202 creation and status lookup.
2. Run `npm test -- tests/generate-3d-route.test.js` and confirm expected failures.
3. Implement the router through dependency injection and mount it at `/api/generate-3d`.
4. Re-run targeted route tests and existing route suites.

### Task 4: Replace box-like carriers with product meshes and decal targets

**Files:**
- Create: `tests/three-scene-contract.test.js`
- Modify: `src/components/ThreeScene.js`

**Steps:**
1. Add a static/contract test for carrier profiles, named print targets, figurine support, material-array handling and stale-load guards.
2. Run the test and confirm it fails against the current box factories/direct material replacement.
3. Add rounded/extruded product silhouettes, fabric seams/handles, phone cutouts, magnet backing and a local figurine placeholder using Three.js primitives.
4. Add a dedicated transparent print/decal mesh per product and make `setTexture()` update only that layer.
5. Add `setGeneratedModel(url)` and a monotonic load token; preserve imported GLB transforms and PBR materials.
6. Re-run the contract test and existing Three.js/model tests.

### Task 5: Add the real 3D workflow to the generator UI

**Files:**
- Modify: `tests/generator-layout.test.js`
- Create: `tests/generator-3d-flow.test.js`
- Modify: `src/generator.html`
- Modify: `src/generator.js`
- Modify: `src/utils/apiService.js`
- Modify: `src/style.css`

**Steps:**
1. Add failing tests for the figurine option, disabled initial state, progress/status/download elements, API client methods and stale task guard.
2. Run `npm test -- tests/generator-layout.test.js tests/generator-3d-flow.test.js` and confirm failures.
3. Add the figurine carrier and a compact real-3D action panel aligned with the existing main-page visual language.
4. Implement create/poll/cancel lifecycle, enable only when a reference image exists, and load/download the GLB on success.
5. Keep the product stage neutral: no full-canvas cyan overlay; use cyan/gold only for controls and transient progress.
6. Re-run targeted tests.

### Task 6: Record the architecture and verify end to end

**Files:**
- Modify: `DESIGN.md`
- Modify: `.omx/state/true-3d-products/ralph-progress.json`

**Steps:**
1. Document GLB/PBR, independent decal layers, server-only provider keys, and Gaussian Splat non-goal in `DESIGN.md`.
2. Run `npm test` and read the full result.
3. Run `npm run build` and read the full result.
4. Start Vite and Express, exercise carrier switching and the unconfigured-provider path at 1440x900, capture screenshots and check the browser console.
5. Run a Visual Ralph verdict against the approved dark-ink reference direction and persist the structured score/differences.
6. Request architect verification; fix any rejection and repeat tests/build/browser evidence.
7. Run the changed-files deslop pass, then repeat `npm test` and `npm run build` before claiming completion.

