# Quadruped spirit pet implementation plan

**Goal:** Produce a separate, reproducible four-legged 082 asset with walk/run/idle and review evidence, preserving application files and the deployed pet.

**Architecture:** Inspect the original textured mesh and old Tripo rig. Rebuild an anatomical four-limb armature with explicit regional weights and a restrained cloth-toy gait; use an openly licensed animation source if anatomically suitable. Bake deform bones only, preserve glTF +X forward / +Y up, optimize textures without Draco.

**Tech stack:** Blender 5.1 Python, glTF Transform, sharp, Three.js offline validation.

1. Render source side/front/top/three-quarter views and record old bone positions. Establish four paw and attachment landmarks.
2. Check open animation libraries and record source/license/suitability; if unsuitable, author and document original keyframes.
3. Implement `scripts/rig-spirit-pet-quadruped.py`: anatomical bones, region-constrained weights, looped in-place animations, Blender master, raw GLB, skeleton and gait renders.
4. Implement a separate Node optimization/validation pipeline for `shandong-tiger-quad.glb`: WebP <=2048, no Draco, <3 MB, exact clip names, normalized weights, all four chains animated, stationary root and matching loop endpoints.
5. Inspect rendered gait frames and final GLB deformation, record numeric contact and isolation checks, write `quad-rig-report.md` with limitations and reproduction commands.

No git commit; do not edit `src/`, `tests/`, `server.js`, or the existing pet GLB. Existing unrelated work is preserved.
