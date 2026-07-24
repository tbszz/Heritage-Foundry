import { describe, expect, it, vi } from 'vitest';

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

  it('extracts image data from the generateContent candidate parts', async () => {
    const { extractImageFromGenerateContent } = await import('../services/geminiService.js');

    const result = extractImageFromGenerateContent({
      candidates: [{
        content: {
          parts: [
            { text: 'done' },
            { inlineData: { mimeType: 'image/png', data: 'new-image-data' } }
          ]
        }
      }]
    }, 'image/jpeg');

    expect(result).toEqual({
      base64Image: 'data:image/png;base64,new-image-data',
      outputMimeType: 'image/png'
    });
  });

  it('builds the official generateContent image configuration', async () => {
    const { buildImageGenerationConfig } = await import('../services/geminiService.js');

    expect(buildImageGenerationConfig({ aspect_ratio: '3:2', image_size: '2K' })).toEqual({
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '3:2',
        imageSize: '2K'
      }
    });
  });

  it('builds the Gemini 3.1 Interactions image request used by Nano Banana 2', async () => {
    const { buildInteractionImageRequest } = await import('../services/geminiService.js');

    expect(buildInteractionImageRequest(
      'Create one isolated heritage motif',
      { aspect_ratio: '3:2', image_size: '2K', mime_type: 'image/jpeg' }
    )).toEqual({
      model: 'gemini-3.1-flash-image',
      input: 'Create one isolated heritage motif',
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: '3:2',
        image_size: '2K'
      }
    });
  });

  it('preserves a generated-image finish reason when Nano Banana returns no image', async () => {
    const { createNoImageError } = await import('../services/geminiService.js');
    const error = createNoImageError({ candidates: [{ finishReason: 'NO_IMAGE' }] });

    expect(error.code).toBe('GEMINI_NO_IMAGE');
    expect(error.message).toContain('未生成图像');
  });

  it('retries one NO_IMAGE interaction with an explicit image directive', async () => {
    const { generateImageWithInteractions } = await import('../services/geminiService.js');
    const create = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', output_image: null })
      .mockResolvedValueOnce({
        status: 'completed',
        output_image: { mime_type: 'image/jpeg', data: 'retried-image' }
      });

    const result = await generateImageWithInteractions(
      { interactions: { create } },
      '中国剪纸纹样',
      { aspect_ratio: '1:1', image_size: '1K', mime_type: 'image/jpeg' }
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.any(Object), { timeout: 120000 });
    expect(create).toHaveBeenNthCalledWith(2, expect.any(Object), { timeout: 120000 });
    expect(create.mock.calls[1][0].input).toContain('Generate the requested image now');
    expect(result.base64Image).toBe('data:image/jpeg;base64,retried-image');
  });

  it('configures the SDK transport timeout through httpOptions', async () => {
    const { getAIClientConfig } = await import('../services/geminiService.js');

    expect(getAIClientConfig('test-key')).toEqual({
      apiKey: 'test-key',
      httpOptions: { timeout: 120000 }
    });
  });

  it('turns unsupported-region responses into an actionable Chinese error', async () => {
    const { normalizeGeminiError } = await import('../services/geminiService.js');
    const error = normalizeGeminiError(new Error('User location is not supported for the API use.'));

    expect(error.message).toContain('当前网络出口地区');
    expect(error.statusCode).toBe(503);
  });
});
