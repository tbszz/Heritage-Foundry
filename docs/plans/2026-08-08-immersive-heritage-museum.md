# Immersive Heritage Museum Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a grand, traditional-culture-led museum home, enter-on-demand 3D halls, interactive heritage guides, direct map/gallery navigation, and a refined AI creation atelier while removing the spirit-pet experience.

**Architecture:** Preserve the Vite multi-page/native-module stack. Keep the first viewport HTML/CSS-first, dynamically import `SketchCorridorScene` only after an explicit museum-entry action, reuse `ArtifactStage` for orbitable artifacts, and restyle the generator without changing its stable IDs or backend contracts.

**Tech Stack:** Vite 6, vanilla HTML/CSS/ES modules, Three.js 0.160, Tween.js, Vitest, Codex in-app browser.

---

### Task 1: Lock the new museum contract with failing tests

**Files:**
- Modify: `tests/museum-experience-redesign.test.js`
- Modify: `tests/sketch-corridor.test.js`
- Modify: `tests/generator-layout.test.js`
- Create: `tests/heritage-museum-v4.test.js`

**Step 1: Write failing assertions**

Assert:
- the home has visible hero copy, `museum-entry-trigger`, both heritage-guide buttons, and top-level map/gallery controls;
- home initialization does not call `bindSketchCorridor()` eagerly;
- production entry files contain no Companion import, chat DOM, or companion callback;
- the generator exposes `atelier-grid`, `atelier-ledger`, and culture-led topic options.

**Step 2: Verify RED**

Run: `npm test -- tests/heritage-museum-v4.test.js tests/museum-experience-redesign.test.js tests/sketch-corridor.test.js tests/generator-layout.test.js`

Expected: failures caused by the missing v4 hero, eager 3D mount, companion wiring, and old generator layout.

### Task 2: Build navigation, exterior hero, feature URLs, and heritage guides

**Files:**
- Modify: `src/index.html`
- Modify: `src/home.js`
- Modify: `src/museum-experience.css`
- Create: `public/assets/generated/museum-copper-exterior.webp`

**Step 1: Implement semantic structure**

Add floating museum-sign navigation; visible H1; “推门入馆” action; two buttons using existing shadow/tiger-head artwork; direct map/gallery controls; subtle collection ledger.

**Step 2: Implement behavior**

Add:
- explicit entry binding that starts the dynamic 3D import;
- query/hash feature resolution for `?view=map` and `?view=gallery`;
- map/gallery nav bindings;
- guide buttons that enter the corridor and request the appropriate chapter/craft when ready.

**Step 3: Implement visual system**

Use the DESIGN.md tokens, giant split title, exterior image, directional shading, premium motion, focus states, and reduced-motion fallback.

**Step 4: Verify GREEN**

Run the Task 1 test set. Expected: all pass.

### Task 3: Remove the spirit-pet runtime and preserve 3D hall interaction

**Files:**
- Modify: `src/home.js`
- Modify: `src/index.html`
- Modify: `src/components/SketchCorridorScene.js`
- Modify: `src/museum-experience.css`
- Modify: `server.js`
- Modify: `tests/v3-chat.test.js`

**Step 1: Remove runtime entry points**

Remove chat binding and DOM, Companion import/instantiation/raycast/update/disposal, and the corridor `onCompanion` protocol. Leave the isolated historical file untouched so the user's uncommitted source edit can be preserved during integration.

**Step 2: Remove server exposure**

Unregister the dedicated chat route while retaining Gemini dependencies used by generation and quiz features.

**Step 3: Keep hall and artifact contracts**

Preserve fixed-rail travel, limited view rotation, room transitions, on-demand model loading, and `ArtifactStage` orbit/zoom.

**Step 4: Verify**

Run: `npm test -- tests/heritage-museum-v4.test.js tests/sketch-corridor.test.js tests/three-scene-contract.test.js tests/museum-creation-modal.test.js`

Expected: pass with no Companion runtime surface.

### Task 4: Rebuild the AI creation page as a craft atelier

**Files:**
- Modify: `src/generator.html`
- Modify: `src/generator-museum.css`
- Modify: `src/utils/apiService.js`
- Modify: `services/promptService.js`
- Modify: `tests/generator-layout.test.js`
- Modify: `tests/frontend-prompt.test.js`
- Modify: `tests/prompt-service.test.js`

**Step 1: Write topic-map tests**

Add failing tests for culture-led themes such as auspicious beast, opera character, Shanhai legend, flying apsara, and Jiangnan flora; retain legacy map compatibility.

**Step 2: Implement content maps**

Expose the new topic IDs in browser and server prompt maps. Keep old IDs valid for saved links and tests.

**Step 3: Restructure stable markup**

Keep every behavior-critical ID. Wrap the controls, main creation stage, and process ledger in `atelier-grid`; move real-3D status and product story into the ledger; leave pattern/material work below.

**Step 4: Implement atelier styling**

Create the left craft slips, central illuminated worktable, right process ledger, museum label typography, restrained controls, responsive one-column layout, and reduced motion.

**Step 5: Verify**

Run: `npm test -- tests/generator-layout.test.js tests/frontend-prompt.test.js tests/prompt-service.test.js tests/generator-state.test.js tests/generator-3d-flow.test.js`

Expected: pass.

### Task 5: Complete the 12-round in-app-browser visual loop

**Files:**
- Create/Update: `.omx/artifacts/visual-ralph/immersive-museum/round-*.png`
- Create: `.omx/artifacts/visual-ralph/immersive-museum/verdicts.json`
- Modify as needed: `src/index.html`, `src/home.js`, `src/museum-experience.css`, `src/generator.html`, `src/generator-museum.css`

**Step 1: Run desktop rounds 1–10**

At 1440×900, reload in the Codex in-app browser, capture the route/state, score category match and list differences before the next edit. Cover IA, composition, palette/type, characters, entry motion, corridor, artifact, atelier, map, and gallery.

**Step 2: Run responsive/accessibility round 11**

At 390×844, check overflow, touch sizes, focus order, dialog layout, static fallback, and reduced motion.

**Step 3: Run anti-template/performance round 12**

Remove purposeless pills, cards, English technical decoration, glow and looping motion. Confirm the exterior first frame is visible before 3D.

### Task 6: Final verification and integration-ready review

**Files:**
- Review all changed files
- Update: `DESIGN.md` only if implementation revealed a contradiction

**Step 1: Targeted tests**

Run the targeted commands from Tasks 1–4.

**Step 2: Full verification**

Run:
- `npm test`
- `npm run build`
- `git diff --check`

Expected: 0 test failures, build exit 0, no whitespace errors.

**Step 3: Final browser smoke**

Verify home, enter-hall, map, gallery, artifact dialog, generator desktop, and generator mobile in the Codex in-app browser. Record final screenshots and remaining differences.

**Step 4: Review**

Run spec-compliance review, code-quality review, and final verification review before merging the branch.
