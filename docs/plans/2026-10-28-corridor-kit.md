# Corridor Kit Implementation Plan

**Goal:** Bake the approved four Blender modules and instance them in the museum corridor with a working fallback.
**Architecture:** Import shared construction, assembly and lighting functions in preview and bake scripts. Bake direct + indirect diffuse into four non-overlapping 2048 atlases, apply one ACES display transform, retain metallic gilt and emissive paper, and validate the compressed GLB. Grid layout drives per-material InstancedMesh groups; existing doors and rooms remain independent.
**Tech Stack:** Blender 5.1 / Cycles OPTIX, Three.js, glTF Transform, Vitest, Playwright.

1. Record original browser draw calls and inspect reference / current preview.
2. Add grid-layout regression tests and observe failure, implement the pure layout function.
3. Refactor importable preview assembly and configurable Cycles / EEVEE rendering; run at most three look-development renders adjusting lights and material values only.
4. Bake in a lit multi-bay assembly with temporary closed door slabs. Keep float radiance artifacts and apply a shared ACES curve and exposure. Export four original-origin nodes, compress, reimport and validate names / bounds / materials / textures.
5. Add instanced module loading, fallback visibility, old lantern hiding and resource cleanup. Verify door fit / open sweep without changing room or pet code.
6. Run full tests and production build. Capture desktop front / middle / back and mobile, collect browser errors and comparable draw calls. Write an evidence report.

No commits; preserve existing uncommitted work and existing assets. User specification provides authorization to execute all steps directly.
