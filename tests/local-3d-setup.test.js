import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const setupScript = fs.readFileSync(
  path.resolve('scripts/setup-local-3d.ps1'),
  'utf8'
);

describe('local 3D runtime setup', () => {
  it('downloads the public TripoSR checkpoint resumably and validates its size', () => {
    expect(setupScript).toContain('curl.exe');
    expect(setupScript).toContain('--continue-at');
    expect(setupScript).toContain('1677246742');
    expect(setupScript).toContain('107cefdc244c39106fa830359024f6a2f1c78871');
    expect(setupScript).toContain('f205d5d8e640a89a2b8ef0369670dfc37cc07fc2');
    expect(setupScript.match(/\$LASTEXITCODE/g)?.length).toBeGreaterThanOrEqual(6);
    expect(setupScript).not.toContain('snapshot_download');
  });
});
