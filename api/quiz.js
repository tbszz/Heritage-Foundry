/**
 * POST /api/quiz
 * 基于非遗故事通过 Gemini 生成 3 道选择题
 * 请求体: { craftId, craftName, craftStory }
 * 响应: { success, questions: [{ q, options: [4], answer: 0-3 }] }
 */

const { GoogleGenAI } = require('@google/genai');

const QUIZ_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = Number(process.env.GEMINI_QUIZ_TIMEOUT_MS || 15000);

function getQuizClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY 未配置');
    error.statusCode = 503;
    throw error;
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS } });
}

function buildQuizPrompt(craftName, craftStory) {
  return `你是一位非遗文化教育专家。请根据以下非遗技艺的信息，生成3道中文选择题，用于测试学习者的理解。

非遗名称：${craftName}
非遗故事：${craftStory}

要求：
1. 每道题4个选项，只有1个正确答案
2. 题目难度递进：第1题简单（事实类），第2题中等（理解类），第3题较难（推理/应用类）
3. 选项要有一定迷惑性，不能太明显
4. 严格按以下JSON格式输出，不要输出其他内容：

{
  "questions": [
    { "q": "题目1", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": 0 },
    { "q": "题目2", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": 1 },
    { "q": "题目3", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": 2 }
  ]
}`;
}

function parseQuizResponse(text) {
  // 尝试从响应中提取JSON
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 尝试提取 { ... } 部分
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('无法解析AI响应');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed?.questions || !Array.isArray(parsed.questions)) {
    throw new Error('AI返回格式错误');
  }

  return parsed.questions.slice(0, 3).map(q => ({
    q: String(q.q || ''),
    options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : ['A', 'B', 'C', 'D'],
    answer: Math.min(Math.max(Number(q.answer) || 0, 0), 3)
  }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', code: 405 });
  }

  const { craftId, craftName, craftStory } = req.body || {};

  if (!craftName || !craftStory) {
    return res.status(400).json({
      success: false,
      error: '缺少 craftName 或 craftStory',
      code: 400
    });
  }

  // 如果没有 API key，直接返回错误让前端使用本地模板
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'GEMINI_API_KEY 未配置',
      code: 'NOT_CONFIGURED'
    });
  }

  try {
    const ai = getQuizClient();
    const prompt = buildQuizPrompt(craftName, craftStory);
    const response = await ai.models.generateContent({
      model: QUIZ_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 1024
      }
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('AI返回空内容');

    const questions = parseQuizResponse(text);

    // 验证题目质量
    for (const q of questions) {
      if (!q.q || q.options.length < 4 || q.options.some(o => !o)) {
        throw new Error('AI生成的题目不完整');
      }
    }

    res.json({
      success: true,
      craftId,
      questions
    });
  } catch (error) {
    console.error('Quiz generation failed:', error.message);
    // 返回错误让前端回退到本地模板
    res.status(500).json({
      success: false,
      error: error.message || 'Quiz generation failed',
      code: 'QUIZ_GENERATION_FAILED'
    });
  }
};