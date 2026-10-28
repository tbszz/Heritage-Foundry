const { GoogleGenAI } = require('@google/genai');

// 文本/多模态理解模型：与生图模型（geminiService）共用 GEMINI_API_KEY，模型名单独配置。
const TEXT_MODEL_NAME = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const TEXT_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TEXT_TIMEOUT_MS || 45000);

let textClient = null;

function getTextModelName() {
  return TEXT_MODEL_NAME;
}

function isTextModelConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getTextClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY 未配置，无法调用 AI 文本服务');
    error.statusCode = 503;
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }

  if (!textClient) {
    textClient = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: TEXT_REQUEST_TIMEOUT_MS }
    });
  }

  return textClient;
}

function createEmptyResponseError(response) {
  const finishReason = response?.candidates?.[0]?.finishReason
    || response?.candidates?.[0]?.finish_reason
    || 'EMPTY';
  const error = new Error(`AI 文本模型未返回内容（${finishReason}）`);
  error.statusCode = 502;
  error.code = 'TEXT_MODEL_EMPTY_RESPONSE';
  return error;
}

function extractTextFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part?.text || '').join('').trim();
  if (!text) throw createEmptyResponseError(response);
  return text;
}

function splitDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = /^data:([^;]+);base64,(.*)$/s.exec(raw);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: 'image/jpeg', data: raw };
}

function buildContents(prompt, images = [], systemInstruction) {
  const parts = [];
  if (systemInstruction) parts.push({ text: systemInstruction });
  parts.push({ text: prompt });
  for (const image of images) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  return parts;
}

function extractJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw error;
  }
}

function createInvalidJsonError(cause) {
  const error = new Error('AI 文本模型返回了无法解析的结构化内容');
  error.statusCode = 502;
  error.code = 'TEXT_MODEL_INVALID_JSON';
  if (cause) error.cause = cause;
  return error;
}

// 结构化输出：要求模型按 schema 返回 JSON，并做宽松提取兜底。
async function generateStructuredJson({ prompt, schema, images = [], systemInstruction }) {
  const ai = getTextClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL_NAME,
    contents: buildContents(prompt, images, systemInstruction),
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      httpOptions: { timeout: TEXT_REQUEST_TIMEOUT_MS }
    }
  });

  const text = extractTextFromResponse(response);
  try {
    return extractJsonLoose(text);
  } catch (error) {
    throw createInvalidJsonError(error);
  }
}

async function generatePlainText({ prompt, images = [], systemInstruction }) {
  const ai = getTextClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL_NAME,
    contents: buildContents(prompt, images, systemInstruction),
    config: {
      httpOptions: { timeout: TEXT_REQUEST_TIMEOUT_MS }
    }
  });
  return extractTextFromResponse(response);
}

module.exports = {
  getTextModelName,
  isTextModelConfigured,
  getTextClient,
  extractTextFromResponse,
  splitDataUrl,
  buildContents,
  extractJsonLoose,
  generateStructuredJson,
  generatePlainText
};
