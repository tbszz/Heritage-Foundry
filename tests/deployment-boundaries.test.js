import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel deployment boundaries', () => {
  it('routes all public 3D endpoints before the static fallback', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
    const sources = config.routes.map((route) => route.src);
    const fallbackIndex = sources.indexOf('/(.*)');

    expect(sources.indexOf('/api/3d-capabilities')).toBeLessThan(fallbackIndex);
    expect(sources.indexOf('/api/generate-3d')).toBeLessThan(fallbackIndex);
    expect(sources.indexOf('/api/generate-3d/([^/]+)')).toBeLessThan(fallbackIndex);
    expect(sources.indexOf('/api/generate-3d/([^/]+)/artifacts/model\\.glb')).toBeLessThan(fallbackIndex);
  });

  it('lets Vercel select its supported Node runtime for serverless functions', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));

    expect(config.functions?.['api/**/*.js']?.runtime).toBeUndefined();
  });

  it('keeps the local Python runtime and heavyweight source assets out of Vercel uploads', () => {
    const ignored = fs.readFileSync(path.resolve('.vercelignore'), 'utf8');

    expect(ignored).toContain('sidecar/');
    expect(ignored).toContain('assets-src/models/');
    expect(ignored).toContain('heritage-foundry-demo.zip');
    expect(ignored).toContain('artifacts/');
  });
});
