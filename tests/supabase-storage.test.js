import { describe, expect, it, vi } from 'vitest';
import { parseImageDataUrl, uploadImageToStorage } from '../services/supabaseService.js';

const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function buildMockClient({ uploadError = null } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrl = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/heritage-creations/creations/mock.png' }
  });

  const client = {
    storage: {
      from: vi.fn(() => ({ upload, getPublicUrl }))
    }
  };

  return { client, upload, getPublicUrl };
}

describe('parseImageDataUrl', () => {
  it('parses a base64 image data URL into mime type and buffer', () => {
    const parsed = parseImageDataUrl(TINY_PNG_DATA_URL);
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.buffer).toBeInstanceOf(Buffer);
    expect(parsed.buffer.length).toBeGreaterThan(0);
  });

  it('returns null for plain URLs and garbage input', () => {
    expect(parseImageDataUrl('https://cdn.example.com/a.png')).toBeNull();
    expect(parseImageDataUrl('')).toBeNull();
    expect(parseImageDataUrl(null)).toBeNull();
  });
});

describe('uploadImageToStorage', () => {
  it('uploads the image and returns the public URL', async () => {
    const { client, upload } = buildMockClient();

    const url = await uploadImageToStorage(client, TINY_PNG_DATA_URL);

    expect(upload).toHaveBeenCalledTimes(1);
    const [filePath, buffer, options] = upload.mock.calls[0];
    expect(filePath).toMatch(/^creations\/.+\.png$/);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(options.contentType).toBe('image/png');
    expect(url).toMatch(/^https:\/\/.*\/heritage-creations\//);
  });

  it('returns null when the upload fails so callers can fall back to base64', async () => {
    const { client } = buildMockClient({ uploadError: { message: 'bucket missing' } });

    const url = await uploadImageToStorage(client, TINY_PNG_DATA_URL);

    expect(url).toBeNull();
  });

  it('returns null for non-data URLs without touching storage', async () => {
    const { client, upload } = buildMockClient();

    const url = await uploadImageToStorage(client, 'https://cdn.example.com/a.png');

    expect(url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
