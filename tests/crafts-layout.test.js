import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const craftsHtml = readFileSync(new URL('../src/crafts.html', import.meta.url), 'utf8');

describe('heritage crafts museum page', () => {
  it('uses the shared museum shell and discovery landmarks', () => {
    expect(craftsHtml).toContain('body class="crafts-shell"');
    expect(craftsHtml).toContain('data-component="CraftsMuseum"');
    expect(craftsHtml).toContain('data-component="CraftDiscoveryGrid"');
  });
});
