import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('minitool');
const ALLOWED_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json',
]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

describe('Xiaohongshu minitool artifact', () => {
  it('has a compliant root entry and supported file types', () => {
    const entry = path.join(ROOT, 'index.html');
    expect(existsSync(entry)).toBe(true);

    const files = walk(ROOT);
    expect(files.every((file) => ALLOWED_EXTENSIONS.has(path.extname(file).toLowerCase()))).toBe(true);
    expect(files.reduce((sum, file) => sum + statSync(file).size, 0)).toBeLessThan(10 * 1024 * 1024);
  });

  it('uses an offline-safe HTML shell', () => {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('charset="UTF-8"');
    expect(html).toMatch(/viewport[^>]+width=device-width[^>]+initial-scale=1\.0[^>]+viewport-fit=cover/i);
    expect(html).not.toMatch(/<script(?![^>]+src=)[^>]*>/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toMatch(/type=["']module["']/i);
    expect(html).not.toMatch(/<base\b|<iframe\b|<object\b|http:\/\/|https:\/\//i);
  });

  it('contains no forbidden runtime capabilities', () => {
    const text = walk(ROOT)
      .filter((file) => ['.html', '.css', '.js', '.json'].includes(path.extname(file).toLowerCase()))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const forbidden = [
      /\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\s*\(/, /\bEventSource\s*\(/,
      /navigator\.geolocation/, /navigator\.clipboard/, /navigator\.serviceWorker/,
      /\bnew\s+(?:Shared)?Worker\s*\(/, /WebAssembly\./, /\beval\s*\(/,
      /\bnew\s+Function\s*\(/, /window\.open\s*\(/, /requestFullscreen\s*\(/,
      /target=["']_blank["']/, /\sdownload(?:\s|=|>)/,
    ];
    forbidden.forEach((pattern) => expect(text).not.toMatch(pattern));
  });

  it('references only files that exist in the artifact', () => {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const references = [...html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
    references.forEach((reference) => {
      const target = path.resolve(ROOT, reference);
      expect(target.startsWith(`${ROOT}${path.sep}`)).toBe(true);
      expect(existsSync(target)).toBe(true);
    });
  });
});
