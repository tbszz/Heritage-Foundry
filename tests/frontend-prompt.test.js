import { describe, expect, it } from 'vitest';
import { generatePrompt } from '../src/utils/apiService.js';

describe('frontend AI prompt builder', () => {
  it('adds wild heritage/IP crossover and perler-bead constraints', () => {
    const prompt = generatePrompt('tangka', 'doraemon', 'chinese', 'keychain');

    expect(prompt).toContain('脑洞');
    expect(prompt).toContain('唐卡艺术');
    expect(prompt).toContain('哆啦A梦');
    expect(prompt).toContain('拼豆挂件');
    expect(prompt).toContain('18x12');
    expect(prompt).toContain('无文字');
  });
});
