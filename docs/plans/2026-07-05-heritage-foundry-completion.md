# Heritage Foundry Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the backend, Supabase persistence, perler bead generator, frontend UX/motion upgrade, and Thangka performance fix so the app is close to deploy-ready.

**Architecture:** Keep the existing Vite multi-page frontend and Express API. Add a small Supabase service layer behind Express, upgrade the existing canvas/pattern utilities, and improve `ThreeScene` rather than introducing a new frontend framework.

**Tech Stack:** Vite, vanilla ES modules, Express, Three.js, Vitest, Supabase JS, Canvas API.

---

### Task 1: Lock Existing Gaps With Tests

**Files:**
- Create: `tests/generate-route.test.js`
- Create: `tests/pattern-generator.test.js`
- Create: `tests/supabase-service.test.js`
- Create: `tests/creations-route.test.js`
- Modify: `package.json`

**Steps:**
1. Add Vitest and Supertest.
2. Write failing tests for AI route boot resilience, Tangka prompt coverage, image-data-to-pattern generation, Supabase disabled state, and creations route disabled response.
3. Run `npm test` and confirm red failures match missing behavior.
4. Implement minimal production code.
5. Run `npm test` and confirm green.

### Task 2: Backend And Database

**Files:**
- Modify: `server.js`
- Modify: `routes/generate.js`
- Create: `routes/creations.js`
- Modify: `services/geminiService.js`
- Create: `services/supabaseService.js`
- Create: `supabase/migrations/202607050001_create_heritage_foundry.sql`
- Create: `.env.example`
- Create: `docs/API.md`

**Steps:**
1. Lazily initialize AI service so the server can start without AI credentials.
2. Add `/api/creations` CRUD-lite routes.
3. Add Supabase schema for saved creations.
4. Document environment variables and API contracts.
5. Verify with `npm test`.

### Task 3: Perler Bead Generator

**Files:**
- Modify: `src/utils/patternGenerator.js`
- Modify: `src/utils/colorSystem.js`
- Modify: `src/generator.js`
- Modify: `src/generator.html`
- Modify: `src/style.css`

**Steps:**
1. Use image-derived pattern generation when an AI image exists.
2. Keep procedural patterns as fallback.
3. Bind color-system select, PNG download, CSV download.
4. Render dynamic material rows from actual color counts.
5. Add simple click-to-edit cells and regenerate stats.
6. Verify with `npm test` and browser smoke flow.

### Task 4: 3D And Thangka Performance

**Files:**
- Modify: `src/components/ThreeScene.js`
- Modify: `src/crafts.js`

**Steps:**
1. Make carrier switching call the correct procedural model methods.
2. Preserve and dispose textures/materials safely when switching.
3. Lower pixel-ratio cap and pause rendering when hidden.
4. Fix transparent GLB material depth settings to reduce Tangka flicker.
5. Fix Tangka craft mapping from crafts page to generator.
6. Smoke test Tangka selection and carrier switching.

### Task 5: Frontend UX And Motion

**Files:**
- Create/refresh: `DESIGN.md`
- Modify: `src/generator.html`
- Modify: `src/generator.js`
- Modify: `src/style.css`
- Modify: `src/index.html`
- Modify: `src/crafts.html`

**Steps:**
1. Add segmented button controls synced with select elements.
2. Add generation step status and richer result states.
3. Add save-work button and recent creations panel.
4. Add controlled motion: glow, scan, entrance, hover, reduced-motion fallback.
5. Verify responsive layout at mobile and desktop widths.

### Task 6: Final Verification

**Files:**
- All changed files.

**Steps:**
1. Run `npm test`.
2. Run `npm run build`.
3. Run the API server and verify `/api/health` plus disabled Supabase response.
4. Run the Vite app and smoke test generation, carrier switching, pattern generation, downloads, save feedback, and Tangka view.
5. Report exact verification evidence and remaining deployment inputs.
