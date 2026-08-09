import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const craftsHtml = readFileSync(new URL('../src/crafts.html', import.meta.url), 'utf8');
const sharedStyles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

function readPrimaryNavigation(html) {
  const markup = html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';

  return [...markup.matchAll(/<a\s+([^>]+)>([^<]+)<\/a>/g)].map(([, attributes, label]) => ({
    href: attributes.match(/href="([^"]+)"/)?.[1],
    label: label.trim(),
    active: /class="[^"]*\bactive\b[^"]*"/.test(attributes),
    current: attributes.match(/aria-current="([^"]+)"/)?.[1],
  }));
}

function readCssBlock(source, selector) {
  const selectorIndex = source.indexOf(selector);
  if (selectorIndex === -1) return '';

  const openingBrace = source.indexOf('{', selectorIndex + selector.length);
  if (openingBrace === -1) return '';

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  return '';
}

describe('heritage crafts museum page', () => {
  it('uses the shared museum shell and discovery landmarks', () => {
    expect(craftsHtml).toContain('body class="crafts-shell"');
    expect(craftsHtml).toContain('data-component="CraftsMuseum"');
    expect(craftsHtml).toContain('data-component="CraftDiscoveryGrid"');
  });

  it('matches the museum navigation labels, routes, and order', () => {
    expect(craftsHtml).toContain('<nav class="nav" aria-label="博物馆主导航">');
    expect(readPrimaryNavigation(craftsHtml)).toEqual([
      { href: 'index.html', label: '云上展厅', active: false, current: undefined },
      { href: 'crafts.html', label: '百工典藏', active: true, current: 'page' },
      { href: 'index.html?view=map', label: '山河图志', active: false, current: undefined },
      { href: 'generator.html', label: 'AI 造物', active: false, current: undefined },
      { href: 'index.html?view=gallery', label: '共创画廊', active: false, current: undefined },
      { href: 'ar.html', label: 'AR 看展', active: false, current: undefined },
    ]);
  });

  it('keeps the six-item navigation on one scrollable row on narrow screens', () => {
    const mobileStyles = readCssBlock(sharedStyles, '@media (max-width: 760px)');
    const mobileNavigation = readCssBlock(mobileStyles, 'body.crafts-shell .nav');
    const mobileNavigationLink = readCssBlock(mobileStyles, 'body.crafts-shell .nav-link');

    expect(mobileNavigation).toContain('width: 100%;');
    expect(mobileNavigation).toContain('flex-wrap: nowrap;');
    expect(mobileNavigation).toContain('overflow-x: auto;');
    expect(mobileNavigationLink).toContain('flex: 0 0 auto;');
    expect(mobileNavigationLink).toContain('white-space: nowrap;');
  });
});
