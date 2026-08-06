/**
 * POST /api/chat
 * F4 手绘灵宠"小天犬"的 AI 对话端点（Gemini 文字生成）
 * 请求体: { message, history?: [{ role: 'user'|'model', text }] }
 * 响应: { success, reply }
 */

const { GoogleGenAI } = require('@google/genai');

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = Number(process.env.GEMINI_CHAT_TIMEOUT_MS || 15000);
const MAX_HISTORY = 10;

// 系统提示词：限定灵宠人设
const SYSTEM_PROMPT = `你是"小天犬"，一只住在非遗数字博物馆里的灵宠导览员。
你的性格：活泼、热情、对中国非遗文化了如指掌。
你的职责：回答用户关于非遗的问题，引导用户探索博物馆。
回答要求：
- 每次回答不超过 150 字
- 用口语化、活泼的语气
- 如果用户问的不是非遗相关话题，温柔地把话题引回非遗
- 可以推荐用户去某个展厅或试试 AI 共创工坊`;

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
    .slice(-MAX_HISTORY)
    .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', code: 405 });
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: '缺少 message',
      code: 400
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'GEMINI_API_KEY 未配置',
      code: 'NOT_CONFIGURED'
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: TIMEOUT_MS }
    });
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      ...normalizeHistory(history),
      { role: 'user', parts: [{ text: message.trim() }] }
    ];

    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents,
      config: { temperature: 0.8, maxOutputTokens: 512 }
    });

    const reply = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!reply) throw new Error('AI返回空内容');

    res.json({ success: true, reply });
  } catch (error) {
    console.error('Chat failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Chat generation failed',
      code: 'CHAT_FAILED'
    });
  }
};
