const { GoogleGenAI } = require('@google/genai');

let aiClient = null;

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 120000);

function getAIClientConfig(apiKey) {
  return {
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS }
  };
}

function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY 未配置，无法调用 AI 生图服务');
    error.statusCode = 503;
    throw error;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI(getAIClientConfig(apiKey));
  }

  return aiClient;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function generateImage(prompt, options = {}) {
  const { aspect_ratio = '1:1', image_size = '1K' } = options;
  const mime_type = getSupportedOutputMimeType(options.mime_type);

  try {
    const ai = getAIClient();
    const interactionOptions = {
      aspect_ratio,
      image_size,
      mime_type
    };
    const response = usesInteractionsApi()
      ? null
      : await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: buildImageGenerationConfig({ aspect_ratio, image_size }),
        httpOptions: { timeout: REQUEST_TIMEOUT_MS }
      });
    const { base64Image, outputMimeType } = usesInteractionsApi()
      ? await generateImageWithInteractions(ai, prompt, interactionOptions)
      : extractImageFromGenerateContent(response, mime_type);

    return {
      base64Image,
      metadata: {
        aspect_ratio,
        image_size,
        mime_type: outputMimeType,
        model: MODEL_NAME
      }
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw normalizeGeminiError(error);
  }
}

async function editImage(imageBase64, prompt, options = {}) {
  const { aspect_ratio = '1:1' } = options;
  const mime_type = getSupportedOutputMimeType(options.mime_type);

  const imageParts = imageBase64.split(',');
  const imageData = imageParts.length > 1 ? imageParts[1] : imageParts[0];
  const inputMimeType = getInputMimeType(imageBase64, options.input_mime_type || options.mime_type);

  try {
    const ai = getAIClient();
    const interactionInput = [
      { type: 'text', text: prompt },
      { type: 'image', mime_type: inputMimeType, data: imageData }
    ];
    const interactionOptions = {
      aspect_ratio,
      mime_type
    };
    const response = usesInteractionsApi()
      ? null
      : await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          { text: prompt },
          { inlineData: { mimeType: inputMimeType, data: imageData } }
        ],
        config: buildImageGenerationConfig({ aspect_ratio }),
        httpOptions: { timeout: REQUEST_TIMEOUT_MS }
      });
    const { base64Image, outputMimeType } = usesInteractionsApi()
      ? await generateImageWithInteractions(ai, interactionInput, interactionOptions)
      : extractImageFromGenerateContent(response, mime_type);

    return {
      base64Image,
      metadata: {
        aspect_ratio,
        mime_type: outputMimeType,
        model: MODEL_NAME
      }
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw normalizeGeminiError(error);
  }
}

function normalizeGeminiError(error) {
  const message = error?.message || '';
  if (/location is not supported|not available in your current location/i.test(message)) {
    const regionError = new Error('当前网络出口地区不支持 Google Gemini API，请切换到受支持地区的网络或改用 Vertex AI');
    regionError.statusCode = 503;
    regionError.code = 'GEMINI_REGION_UNSUPPORTED';
    return regionError;
  }
  if (/timeout/i.test(message)) {
    const timeoutError = new Error('网络连接超时，请检查网络环境');
    timeoutError.statusCode = 504;
    return timeoutError;
  }
  if (/fetch failed/i.test(message)) {
    const networkError = new Error('网络连接失败，请检查网络环境');
    networkError.statusCode = 503;
    return networkError;
  }
  return error;
}

function getSupportedOutputMimeType(requestedMimeType = 'image/jpeg') {
  const normalized = requestedMimeType || 'image/jpeg';
  if (MODEL_NAME.includes('3.1-flash-image')) {
    return 'image/jpeg';
  }
  return normalized;
}

function getInputMimeType(dataUrl, fallback = 'image/jpeg') {
  const match = /^data:([^;]+);base64,/.exec(dataUrl);
  return match?.[1] || fallback || 'image/jpeg';
}

function usesInteractionsApi(modelName = MODEL_NAME) {
  return /^gemini-3(?:\.|-)/.test(modelName);
}

function buildInteractionImageRequest(input, {
  aspect_ratio = '1:1',
  image_size,
  mime_type = 'image/jpeg'
} = {}) {
  const responseFormat = {
    type: 'image',
    mime_type,
    aspect_ratio
  };
  if (image_size) responseFormat.image_size = image_size;

  return {
    model: MODEL_NAME,
    input,
    response_format: responseFormat
  };
}

function buildRetryInput(input) {
  const directive = 'Generate the requested image now. Return an image as the final output and do not answer with text only.';
  return Array.isArray(input)
    ? [{ type: 'text', text: directive }, ...input]
    : `${directive}\n\n${input}`;
}

async function generateImageWithInteractions(ai, input, options = {}) {
  const requestOptions = { timeout: REQUEST_TIMEOUT_MS };
  const firstInteraction = await ai.interactions.create(
    buildInteractionImageRequest(input, options),
    requestOptions
  );

  try {
    return extractImageFromInteraction(firstInteraction, options.mime_type || 'image/jpeg');
  } catch (error) {
    if (error.code !== 'GEMINI_NO_IMAGE') throw error;
  }

  const retryInteraction = await ai.interactions.create(
    buildInteractionImageRequest(buildRetryInput(input), options),
    requestOptions
  );
  return extractImageFromInteraction(retryInteraction, options.mime_type || 'image/jpeg');
}

function createNoImageError(response) {
  const finishReason = response?.candidates?.[0]?.finishReason
    || response?.candidates?.[0]?.finish_reason
    || response?.status
    || 'NO_IMAGE';
  const error = new Error(`Gemini 未生成图像（${finishReason}），请调整提示词后重试`);
  error.statusCode = 502;
  error.code = 'GEMINI_NO_IMAGE';
  return error;
}

function extractImageFromInteraction(interaction, fallbackMimeType) {
  const outputImage = interaction?.output_image || interaction?.outputImage;
  const outputMimeType = outputImage?.mime_type || outputImage?.mimeType || fallbackMimeType;

  if (!outputImage?.data) {
    throw createNoImageError(interaction);
  }

  return {
    base64Image: `data:${outputMimeType};base64,${outputImage.data}`,
    outputMimeType
  };
}

function extractImageFromGenerateContent(response, fallbackMimeType) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;
  const outputMimeType = inlineData?.mimeType || inlineData?.mime_type || fallbackMimeType;

  if (!inlineData?.data) {
    throw createNoImageError(response);
  }

  return {
    base64Image: `data:${outputMimeType};base64,${inlineData.data}`,
    outputMimeType
  };
}

function buildImageGenerationConfig({ aspect_ratio = '1:1', image_size } = {}) {
  const imageConfig = { aspectRatio: aspect_ratio };
  if (image_size) imageConfig.imageSize = image_size;
  return {
    responseModalities: ['IMAGE'],
    imageConfig
  };
}

async function fetchImageAndConvertToBase64(url, mimeType) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching and converting image:', error);
    throw new Error('Failed to fetch generated image');
  }
}

module.exports = {
  generateImage,
  editImage,
  isConfigured,
  getAIClientConfig,
  getSupportedOutputMimeType,
  usesInteractionsApi,
  buildInteractionImageRequest,
  generateImageWithInteractions,
  createNoImageError,
  extractImageFromInteraction,
  extractImageFromGenerateContent,
  buildImageGenerationConfig,
  normalizeGeminiError
};
