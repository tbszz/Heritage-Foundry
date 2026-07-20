import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generatePrompt } from '../src/utils/apiService.js';

describe('frontend AI prompt builder', () => {
  it('adds wild heritage/IP crossover and perler-bead constraints', () => {
    const prompt = generatePrompt('tangka', 'doraemon', 'chinese', 'keychain');

    expect(prompt).toContain('脑洞');
    expect(prompt).toContain('唐卡艺术');
    expect(prompt).toContain('哆啦A梦');
    expect(prompt).toContain('拼豆挂件');
    expect(prompt).toContain('96x96');
    expect(prompt).toContain('16–20 色');
    expect(prompt).not.toContain('粗轮廓');
    expect(prompt).toContain('纯色背景');
    expect(prompt).toContain('纯白或浅灰');
    expect(prompt).toContain('无文字');
  });

  it('builds a standalone print artwork prompt for a canvas tote', () => {
    const prompt = generatePrompt('embroidery', 'nezha', 'minimal', 'bag');

    expect(prompt).toContain('帆布包');
    expect(prompt).toContain('独立印花图案');
    expect(prompt).toContain('不要商品展示图');
    expect(prompt).not.toContain('18x12');
    expect(prompt).not.toContain('拼豆挂件');
  });

  it('builds an isolated full-subject reference for real 3D figurine generation', () => {
    const prompt = generatePrompt('clay', 'monkey', 'cute', 'figurine');

    expect(prompt).toContain('3D手办');
    expect(prompt).toContain('完整主体');
    expect(prompt).toContain('干净纯色背景');
    expect(prompt).toContain('图生3D');
    expect(prompt).not.toContain('18x12');
  });

  it('does not retain the retired fake-image generator after real API errors became explicit', () => {
    const source = readFileSync(new URL('../src/utils/apiService.js', import.meta.url), 'utf8');

    expect(source).not.toContain('function generateMockImage');
  });
});
