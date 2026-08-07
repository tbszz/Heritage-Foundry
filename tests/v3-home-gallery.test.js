import { describe, expect, it } from 'vitest';
import {
  getCommunityCardImageMarkup,
  getNextLikeState,
  openModalElement,
  closeModalElement
} from '../src/home.js';

describe('V3 community gallery rendering helpers', () => {
  it('renders a designed fallback instead of an empty image when a creation has no image URL', () => {
    const markup = getCommunityCardImageMarkup({ title: '未命名作品', image_url: '' });

    expect(markup).toContain('community-card-fallback');
    expect(markup).not.toContain('<img src=""');
    expect(markup).not.toContain('style=');
  });

  it('keeps the image error fallback in CSS classes instead of inline black blocks', () => {
    const markup = getCommunityCardImageMarkup({ title: '剪纸作品', image_url: 'https://example.test/work.webp' });

    expect(markup).toContain('community-card-fallback');
    expect(markup).toContain('data-fallback-html');
    expect(markup).not.toContain('padding:40%');
    expect(markup).not.toContain('var(--muted)');
  });

  it('persists local like state only for confirmed or already-existing likes', () => {
    expect(getNextLikeState({
      previousCount: 2,
      wasLiked: false,
      result: { liked: true, likes: 5 }
    })).toEqual({ liked: true, count: 5, shouldStore: true });

    expect(getNextLikeState({
      previousCount: 2,
      wasLiked: false,
      result: { liked: false, alreadyLiked: true }
    })).toEqual({ liked: true, count: 2, shouldStore: true });

    expect(getNextLikeState({
      previousCount: 2,
      wasLiked: false,
      result: { liked: false }
    })).toEqual({ liked: false, count: 2, shouldStore: false });
  });

  it('opens and closes feature overlays when native dialog APIs are unavailable', () => {
    const dialog = {
      open: false,
      showModal: undefined,
      close: undefined,
      setAttribute(name, value) {
        this[name] = value;
      },
      removeAttribute(name) {
        delete this[name];
      }
    };

    openModalElement(dialog);
    expect(dialog.open).toBe(true);

    closeModalElement(dialog);
    expect(dialog.open).toBe(false);
  });
});
