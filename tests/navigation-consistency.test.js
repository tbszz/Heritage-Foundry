import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveArReturnTarget } from '../src/ar.js';

const readPage = (page) => readFileSync(new URL(`../src/${page}`, import.meta.url), 'utf8');

// 站点导航的统一目的地顺序：任何页面顶栏都按此排列，不再出现
// 「某个页面多出 AR 看展 / 少了山河图志」的漂移。
const CANONICAL_NAV = [
  ['云上展厅', 'index'],
  ['百工典藏', 'crafts'],
  ['山河图志', 'map'],
  ['AI 造物', 'generator'],
  ['共创画廊', 'gallery'],
  ['AR 看展', 'ar']
];

const PAGE_NAV_FILES = {
  index: 'index.html',
  crafts: 'crafts.html',
  generator: 'generator.html',
  ar: 'ar.html'
};

function extractNavLinks(html) {
  const navMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/);
  if (!navMatch) return [];
  return [...navMatch[1].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)]
    .map((match) => ({
      href: match[1],
      text: match[2].trim(),
      current: /aria-current="page"/.test(match[0])
    }));
}

function canonicalDestination(href, text) {
  if (text === '云上展厅') return 'index';
  if (href === 'index.html?view=map' || href === '?view=map') return 'map';
  if (href === 'index.html?view=gallery' || href === '?view=gallery') return 'gallery';
  if (href === 'crafts.html') return 'crafts';
  if (href === 'generator.html') return 'generator';
  if (href === 'ar.html') return 'ar';
  return href;
}

describe('site navigation consistency', () => {
  it.each(Object.entries(PAGE_NAV_FILES))('keeps the same nav items in the same order on %s', (page, file) => {
    const links = extractNavLinks(readPage(file));
    expect(links.map((link) => link.text)).toEqual(CANONICAL_NAV.map(([text]) => text));
    expect(links.map((link) => canonicalDestination(link.href, link.text))).toEqual(CANONICAL_NAV.map(([, key]) => key));
  });

  it.each(Object.entries(PAGE_NAV_FILES))('marks exactly the current page on %s', (page, file) => {
    const links = extractNavLinks(readPage(file));
    const current = links.filter((link) => link.current);
    expect(current).toHaveLength(1);
    expect(canonicalDestination(current[0].href, current[0].text)).toBe(page);
  });

  it('keeps an always-visible return control on the AR page', () => {
    const html = readPage('ar.html');
    expect(html).toContain('id="ar-return-link"');
    expect(html.match(/id="ar-return-link"[^>]*/)[0]).not.toContain('hidden');
  });
});

describe('AR return target', () => {
  const origin = 'https://museum.example';

  it('returns to the crafts page the visitor came from', () => {
    expect(resolveArReturnTarget({
      mode: 'craft',
      craftId: 'jade',
      referrer: `${origin}/crafts.html?craft=jade`,
      origin,
      historyLength: 3
    })).toEqual({ kind: 'back', label: '返回百工典藏' });
  });

  it('returns to the generator workbench for generated models', () => {
    expect(resolveArReturnTarget({
      mode: 'task',
      craftId: 'shadow',
      referrer: `${origin}/generator.html`,
      origin,
      historyLength: 2
    })).toEqual({ kind: 'back', label: '返回造物案台' });
  });

  it('labels home as the return destination when arriving from the homepage', () => {
    expect(resolveArReturnTarget({
      mode: 'craft',
      craftId: 'porcelain',
      referrer: `${origin}/index.html`,
      origin,
      historyLength: 2
    })).toEqual({ kind: 'back', label: '返回云上展厅' });
  });

  it('falls back to the matching crafts entry when opened directly without history', () => {
    expect(resolveArReturnTarget({
      mode: 'craft',
      craftId: 'jade',
      referrer: '',
      origin,
      historyLength: 1
    })).toEqual({ kind: 'href', label: '返回百工典藏', href: 'crafts.html?craft=jade' });
  });

  it('falls back to the generator with the craft preselected for shared task links', () => {
    expect(resolveArReturnTarget({
      mode: 'task',
      craftId: 'shadow',
      referrer: '',
      origin,
      historyLength: 1
    })).toEqual({ kind: 'href', label: '返回造物案台', href: 'generator.html?carrier=figurine&craft=shadow' });
  });

  it('ignores an off-site referrer and uses the in-site fallback', () => {
    expect(resolveArReturnTarget({
      mode: 'craft',
      craftId: 'seal',
      referrer: 'https://elsewhere.example/page',
      origin,
      historyLength: 4
    })).toEqual({ kind: 'href', label: '返回百工典藏', href: 'crafts.html?craft=seal' });
  });

  it('does not treat an AR self-referrer as a usable source', () => {
    expect(resolveArReturnTarget({
      mode: 'task',
      craftId: 'clay',
      referrer: `${origin}/ar.html?task=local-1`,
      origin,
      historyLength: 2
    })).toEqual({ kind: 'href', label: '返回造物案台', href: 'generator.html?carrier=figurine&craft=clay' });
  });
});
