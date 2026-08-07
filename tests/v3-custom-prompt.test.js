import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { buildCreativePrompt, buildEnhancedPrompt } from '../services/promptService.js';
import { buildSavedPrompt } from '../src/utils/apiService.js';

describe('F2 buildCreativePrompt customPrompt', () => {
  const base = {
    basePrompt: '',
    style: 'default',
    craftType: 'papercut',
    ip: 'doraemon',
    carrier: 'keychain'
  };

  it('appends user description at the end when customPrompt is provided', () => {
    const prompt = buildCreativePrompt({ ...base, customPrompt: '角色穿着汉服站在元宵节灯会中' });
    const lines = prompt.split('\n');
    expect(lines[lines.length - 1]).toBe('用户补充描述：角色穿着汉服站在元宵节灯会中');
  });

  it('behaves exactly as before when customPrompt is empty or blank', () => {
    const without = buildCreativePrompt(base);
    expect(buildCreativePrompt({ ...base, customPrompt: '' })).toBe(without);
    expect(buildCreativePrompt({ ...base, customPrompt: '   ' })).toBe(without);
    expect(buildCreativePrompt(base)).toBe(without);
  });

  it('trims whitespace around customPrompt', () => {
    const prompt = buildCreativePrompt({ ...base, customPrompt: '  暖金色调  ' });
    expect(prompt).toContain('用户补充描述：暖金色调');
  });

  it('passes customPrompt through buildEnhancedPrompt context', () => {
    const prompt = buildEnhancedPrompt('剪纸任务', 'chinese', 'papercut', {
      ip: 'nezha',
      carrier: 'bag',
      customPrompt: '背景加敦煌飞天纹样'
    });
    expect(prompt).toContain('用户补充描述：背景加敦煌飞天纹样');
  });
});

describe('F2 saved prompt persistence', () => {
  it('stores the user custom description together with the generated base prompt', () => {
    const saved = buildSavedPrompt('基础四因子 prompt', '  背景加敦煌飞天纹样  ');

    expect(saved).toBe('基础四因子 prompt\n用户补充描述：背景加敦煌飞天纹样');
  });

  it('keeps the saved prompt unchanged when customPrompt is blank', () => {
    expect(buildSavedPrompt('基础四因子 prompt', '')).toBe('基础四因子 prompt');
    expect(buildSavedPrompt('基础四因子 prompt', '   ')).toBe('基础四因子 prompt');
  });
});

describe('F2 /api/generate-image customPrompt passthrough', () => {
  it('accepts camelCase customPrompt without breaking validation', async () => {
    vi.resetModules();
    const routes = await import('../routes/generate.js');
    const app = express();
    app.use(express.json());
    app.use('/api', routes.default || routes);

    const response = await request(app)
      .post('/api/generate-image')
      .send({ prompt: '剪纸', customPrompt: '暖金色调' });

    // 无 GEMINI_API_KEY 时应走到生成阶段报 503，而不是 400 校验失败
    expect(response.status).not.toBe(400);
  });
});
