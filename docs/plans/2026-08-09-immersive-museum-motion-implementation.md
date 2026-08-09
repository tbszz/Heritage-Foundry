# Immersive Museum Motion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the imperceptible static hero motion with a ChatCut-generated museum-night video layer, make both heritage guides visibly alive, and guarantee the complete hero title remains unobscured.

**Architecture:** Keep the existing WebP as a poster/fallback, add one muted looping video element behind all HTML content, and centralize play/pause decisions in a pure helper plus one DOM synchronizer. Remove the duplicated foreground building mask, then use lightweight CSS keyframes for the two guide figures with existing still/reduced-motion gates.

**Tech Stack:** Vite multi-page app, vanilla ES modules, CSS keyframes, Vitest, ChatCut Codex plugin, in-app browser verification.

---

### Task 1: Lock the playback and layering contracts

**Files:**
- Modify: `tests/museum-experience-redesign.test.js`
- Test: `tests/museum-experience-redesign.test.js`

**Step 1: Write the failing tests**

Add focused assertions that require:

- `shouldPlayMuseumBackgroundVideo` to return true only for visible cinematic mode without reduced-motion.
- A muted, autoplaying, looping, inline video with `data-museum-background-video`, poster, and MP4 source.
- No `.museum-building-mask` element or CSS rule.
- A title copy layer above grain/video layers with vertical safety padding.
- Dedicated wrapper elements and distinct `heritage-shadow-sway` / `heritage-tiger-breathe` keyframes.
- Still/reduced-motion rules that stop video/guide motion.

**Step 2: Run the test to verify RED**

Run: `npm test -- tests/museum-experience-redesign.test.js`

Expected: FAIL because the video/helper/wrappers/keyframes do not exist and the old mask still exists.

### Task 2: Add the video layer and lifecycle

**Files:**
- Modify: `src/index.html`
- Modify: `src/home.js`

**Step 1: Add the semantic video shell**

Insert the video after the static poster layer with `muted autoplay loop playsinline preload="metadata"`, a museum poster, and `/assets/generated/museum-night-loop.mp4`. Remove the building-mask node.

**Step 2: Add a pure playback decision helper**

Export `shouldPlayMuseumBackgroundVideo({ experienceMode, reducedMotion, documentHidden })` and return true only for active cinematic mode.

**Step 3: Synchronize the element**

Add a DOM synchronizer that calls `play()` or `pause()`, records active state, and runs after initial mode detection, visibility changes, and mode-toggle changes. Ignore rejected autoplay promises without hiding real console errors.

**Step 4: Run the focused test**

Run: `npm test -- tests/museum-experience-redesign.test.js`

Expected: playback tests pass; CSS motion/layer tests may remain red until Task 3.

### Task 3: Repair title layering and animate both guides

**Files:**
- Modify: `src/index.html`
- Modify: `src/museum-experience.css`

**Step 1: Add transform-isolation wrappers**

Wrap each guide image in `.heritage-guide-figure` so ambient animation does not override hover feedback on the image itself.

**Step 2: Replace static mask styling**

Delete `.museum-building-mask` selectors and state rules. Style `.museum-stage-video` as a full-bleed object-cover layer above the poster and below the shade.

**Step 3: Guarantee complete title rendering**

Raise `.museum-stage-copy` above grain, increase title line-height, add vertical padding, and keep the mobile two-line layout within the viewport.

**Step 4: Add distinct ambient keyframes**

Use premium, low-amplitude loops: approximately 6.8s sway for the shadow puppet and 5.2s delayed breathing/tread for the cloth tiger. Gate them behind cinematic + not-paused selectors; stop them for still and reduced motion.

**Step 5: Run the focused test to verify GREEN**

Run: `npm test -- tests/museum-experience-redesign.test.js`

Expected: PASS.

### Task 4: Generate and install the ChatCut asset

**Files:**
- Create: `public/assets/generated/museum-night-loop.mp4`

**Step 1: Confirm the paid generation specification**

Confirm duration, one-clip structure, 16:9 ratio, and 1080p Seedance 2.0 choice with the user before consuming ChatCut credits.

**Step 2: Create/target a ChatCut project and import the poster**

Use the installed `chatcut@chatcut-inc` plugin in a fresh Codex session, create a project named `非遗造物局·夜间开馆循环背景`, import `public/assets/generated/museum-copper-exterior.webp`, and use its asset id as `firstFrame`.

**Step 3: Submit one generation job**

Prompt for stable architecture, no text/logo/people, fixed camera with an extremely slow push-in, subtle warm-light breathing, slow fog/reflection motion, and loop-friendly first/last state.

**Step 4: Review and retrieve the completed asset**

Track the job in a later ChatCut turn, inspect the generated pixels, then pull/download the MP4 to the exact path above. Do not substitute a locally composited fake video.

### Task 5: Verify the complete homepage

**Files:**
- Test: `tests/museum-experience-redesign.test.js`

**Step 1: Run focused and full automated checks**

Run:

- `npm test -- tests/museum-experience-redesign.test.js`
- `npm test`
- `npm run build`

Expected: all commands exit 0.

**Step 2: Run 2048×1080 browser verification**

Reload `http://127.0.0.1:5173/`, set a 2048×1080 viewport, and verify:

- title text is complete and no higher-z mask intersects its bounds;
- the video is playing in cinematic mode and paused in still/reduced-motion;
- the two guide figures have different active animation names;
- all images load and console errors are empty.

**Step 3: Review the diff and commit**

Commit only the planned source, tests, design/plan, and generated video asset using the repository Lore commit protocol.
