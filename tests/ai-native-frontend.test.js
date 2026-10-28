import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generatorHtml = readFileSync(new URL('../src/generator.html', import.meta.url), 'utf8');
const generatorJs = readFileSync(new URL('../src/generator.js', import.meta.url), 'utf8');
const generatorCss = readFileSync(new URL('../src/generator-museum.css', import.meta.url), 'utf8');
const craftsHtml = readFileSync(new URL('../src/crafts.html', import.meta.url), 'utf8');
const craftsJs = readFileSync(new URL('../src/crafts.js', import.meta.url), 'utf8');
const craftsCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const apiServiceJs = readFileSync(new URL('../src/utils/apiService.js', import.meta.url), 'utf8');

describe('AI native generator console', () => {
  it('offers the natural-language brief console above the manual craft form', () => {
    expect(generatorHtml).toContain('data-component="BriefConsole"');
    expect(generatorHtml).toContain('id="brief-input"');
    expect(generatorHtml).toContain('id="brief-btn"');
    expect(generatorHtml).toContain('id="brief-result"');
    expect(generatorHtml.indexOf('id="brief-input"'))
      .toBeLessThan(generatorHtml.indexOf('id="craft"'));
  });

  it('keeps the manual form fully usable and shows the self-check toggle', () => {
    expect(generatorHtml).toContain('id="self-check-toggle"');
    expect(generatorHtml.querySelector?.bind).toBeUndefined();
    expect(generatorHtml).toContain('<select id="craft"></select>');
    expect(generatorJs).toContain('applyBrief(brief);');
    expect(generatorJs).toContain("document.getElementById('brief-btn')?.addEventListener('click', handleCreativeBrief)");
  });

  it('escapes model-returned text before rendering it into the page', () => {
    expect(generatorJs).toContain('function escapeHtml');
    expect(craftsJs).toContain('function escapeHtml');
  });

  it('sends the current brief for follow-up refinement and renders the reasoning', () => {
    expect(generatorJs).toContain('createCreativeBrief(message, buildCurrentBriefPayload())');
    expect(generatorJs).toContain('brief-reasoning');
    expect(generatorJs).toContain('brief-fallback');
  });

  it('styles the brief console and the review verdict notes', () => {
    expect(generatorCss).toContain('.brief-console');
    expect(generatorCss).toContain('.brief-result');
    expect(generatorCss).toContain('.stage-selfcheck');
    expect(generatorCss).toContain('.review-note');
    expect(generatorCss).toContain('.review-note.is-revise');
  });
});

describe('AI native docent console', () => {
  it('mounts the docent panel on the crafts archive page', () => {
    expect(craftsHtml).toContain('data-component="DocentConsole"');
    expect(craftsHtml).toContain('id="docent-form"');
    expect(craftsHtml).toContain('id="docent-input"');
    expect(craftsHtml).toContain('id="docent-thread"');
  });

  it('asks grounded questions with the current craft and bounded history', () => {
    expect(craftsJs).toContain("import { askDocent } from './utils/apiService.js'");
    expect(craftsJs).toContain('craftId: currentCraft?.id');
    expect(craftsJs).toContain('history: docentHistory.slice(0, -1)');
    expect(craftsJs).toContain('docentHistory.length > 6');
  });

  it('shows retrieval sources and a graceful degradation message', () => {
    expect(craftsJs).toContain('docent-sources');
    expect(craftsJs).toContain("error.code === 'GEMINI_NOT_CONFIGURED'");
  });

  it('styles the docent conversation panel', () => {
    expect(craftsCss).toContain('.docent-panel');
    expect(craftsCss).toContain('.docent-answer');
    expect(craftsCss).toContain('.docent-sources');
  });
});

describe('AI native API client', () => {
  it('exposes the new endpoints and the self-check flag', () => {
    expect(apiServiceJs).toContain('export async function createCreativeBrief');
    expect(apiServiceJs).toContain('export async function askDocent');
    expect(apiServiceJs).toContain('`${API_BASE_URL}/creative-brief`');
    expect(apiServiceJs).toContain('`${API_BASE_URL}/docent`');
    expect(apiServiceJs).toContain('self_check: selfCheck === true');
    // 自审会多一次视觉复查调用，前端超时需覆盖整条链路
    expect(apiServiceJs).toContain('timeoutMs = 165000');
  });
});

describe('review note builder', () => {
  it('renders pass, retried-pass and revise notes without html injection', async () => {
    const { buildReviewNote } = await import('../src/generator.js');

    expect(buildReviewNote(null, false)).toBe('');
    expect(buildReviewNote({ verdict: 'skipped', issues: [] }, false)).toBe('');
    expect(buildReviewNote({ verdict: 'pass', issues: [] }, false))
      .toContain('data-review="pass"');
    expect(buildReviewNote({ verdict: 'pass', issues: [] }, true))
      .toContain('已自动重制并通过复查');

    const revise = buildReviewNote({
      verdict: 'revise',
      issues: ['主体太小', '<script>alert(1)</script>']
    }, false);
    expect(revise).toContain('data-review="revise"');
    expect(revise).toContain('主体太小');
    expect(revise).not.toContain('<script>');
    expect(revise).toContain('&lt;script&gt;');
  });
});
