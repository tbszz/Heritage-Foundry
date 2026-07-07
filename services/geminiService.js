const { GoogleGenAI } = require('@google/genai');

let aiClient = null;

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 120000);

function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY 未配置，无法调用 AI 生图服务');
    error.statusCode = 503;
    throw error;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      timeout: REQUEST_TIMEOUT_MS
    });
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
    const interaction = await ai.interactions.create({
      model: MODEL_NAME,
      input: prompt,
      response_format: {
        type: 'image',
        aspect_ratio,
        image_size,
        mime_type
      }
    });

    const { base64Image, outputMimeType } = extractImageFromInteraction(interaction, mime_type);

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
    if (error.message && error.message.includes('timeout')) {
      throw new Error('网络连接超时，请检查网络环境');
    } else if (error.message && error.message.includes('fetch failed')) {
      throw new Error('网络连接失败，请检查网络环境');
    }
    throw error;
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
    const interaction = await ai.interactions.create({
      model: MODEL_NAME,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', mime_type: inputMimeType, data: imageData }
      ],
      response_format: {
        type: 'image',
        aspect_ratio,
        mime_type
      }
    });

    const { base64Image, outputMimeType } = extractImageFromInteraction(interaction, mime_type);

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
    throw error;
  }
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

function extractImageFromInteraction(interaction, fallbackMimeType) {
  const outputImage = interaction?.output_image || interaction?.outputImage;
  const outputMimeType = outputImage?.mime_type || outputImage?.mimeType || fallbackMimeType;

  if (!outputImage?.data) {
    throw new Error('No image data returned from Gemini API');
  }

  return {
    base64Image: `data:${outputMimeType};base64,${outputImage.data}`,
    outputMimeType
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
  getSupportedOutputMimeType,
  extractImageFromInteraction
};
