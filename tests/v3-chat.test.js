import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

describe('retired spirit-pet chat surface', () => {
  it('removes the production chat handler and route', async () => {
    expect(existsSync(new URL('../api/chat.js', import.meta.url))).toBe(false);
    expect(serverSource).not.toContain("require('./api/chat')");
    expect(serverSource).not.toContain("app.post('/api/chat'");

    const { createApp } = require('../server.js');
    const response = await request(createApp())
      .post('/api/chat')
      .send({ message: '你好' });

    expect(response.status).toBe(404);
  });
});
