import { describe, expect, it } from 'vitest';

describe('gemini image service helpers', () => {
  it('uses jpeg output for the current Gemini 3.1 image model', async () => {
    const { getSupportedOutputMimeType } = await import('../services/geminiService.js');

    expect(getSupportedOutputMimeType('image/png')).toBe('image/jpeg');
  });

  it('extracts base64 data from interaction output_image', async () => {
    const { extractImageFromInteraction } = await import('../services/geminiService.js');

    const result = extractImageFromInteraction({
      output_image: {
        mime_type: 'image/jpeg',
        data: 'abc123'
      }
    }, 'image/jpeg');

    expect(result).toEqual({
      base64Image: 'data:image/jpeg;base64,abc123',
      outputMimeType: 'image/jpeg'
    });
  });
});
