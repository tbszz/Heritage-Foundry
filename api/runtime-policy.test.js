import { afterEach, describe, expect, it } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('serverless 3D runtime policy', () => {
  it('reports local TripoSR as unavailable on Vercel instead of falling back', async () => {
    process.env.VERCEL = '1';
    process.env.THREE_D_PROVIDER = 'local';
    const { getServerless3DPolicy } = await import('./runtime-policy.js');

    expect(getServerless3DPolicy()).toEqual({
      allowed: false,
      provider: 'local',
      statusCode: 503,
      code: 'LOCAL_3D_UNAVAILABLE_ON_VERCEL',
      message: '本地 TripoSR 在 Vercel 环境中不可用，请将 THREE_D_PROVIDER 设置为 meshy'
    });
  });

  it('allows Meshy on Vercel and local TripoSR outside Vercel', async () => {
    const { getServerless3DPolicy } = await import('./runtime-policy.js');

    process.env.VERCEL = '1';
    process.env.THREE_D_PROVIDER = 'meshy';
    expect(getServerless3DPolicy()).toMatchObject({ allowed: true, provider: 'meshy' });

    delete process.env.VERCEL;
    process.env.THREE_D_PROVIDER = 'local';
    expect(getServerless3DPolicy()).toMatchObject({ allowed: true, provider: 'local' });
  });
});
