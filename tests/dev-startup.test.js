import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.js';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve('package.json'), 'utf8')
);
const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
const deployWorkflow = fs.readFileSync(
  path.resolve('.github/workflows/deploy-pages.yml'),
  'utf8'
);

describe('development startup contract', () => {
  it('starts the Vite frontend and Express API together from npm run dev', () => {
    expect(packageJson.scripts['dev:web']).toBe('vite');
    expect(packageJson.scripts['dev:api']).toBe('node --use-env-proxy server.js');
    expect(packageJson.scripts.dev).toContain('concurrently');
    expect(packageJson.scripts.dev).toContain('npm run dev:web');
    expect(packageJson.scripts.dev).toContain('npm run dev:api');
    expect(packageJson.scripts.start).toBe('npm run dev');
  });

  it('documents unified startup without telling users to launch a duplicate API', () => {
    expect(readme).toContain('npm run dev:web');
    expect(readme).toContain('npm run dev:api');
    expect(readme).toContain('npm run dev       # 同时启动 Vite 前端和 Express API');
    expect(readme).not.toContain('npm run dev\nnpm run server');
  });

  it('keeps the Vite proxy aligned with the configured API port', () => {
    expect(typeof viteConfig).toBe('function');

    const previousPort = process.env.PORT;
    process.env.PORT = '3999';
    try {
      const config = viteConfig({ command: 'serve', mode: 'test' });
      expect(config.server.proxy['/api'].target).toBe('http://127.0.0.1:3999');
      expect(config.server.strictPort).toBe(true);
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
    }
  });

  it('requires a Node runtime that supports the environment proxy flag', () => {
    expect(packageJson.engines?.node).toBe('>=22.21.0');
    expect(packageJson.scripts['check:node']).toBe('node scripts/check-node-runtime.js');
    expect(packageJson.scripts.predev).toBe('npm run check:node');
    expect(packageJson.scripts['predev:api']).toBe('npm run check:node');
    expect(readme).toContain('Node.js 22.21+');
    expect(deployWorkflow).toMatch(/node-version:\s*['"]?22(?:\.21\.0)?['"]?/);
  });
});
