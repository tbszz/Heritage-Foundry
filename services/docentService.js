// AI 讲解员：基于馆藏资料的 grounded 问答。
// 检索由 craftKnowledgeService 负责（向量 + 关键词混合）；资料未覆盖时明确说不知道。
const craftsData = require('../src/data/crafts.json');
const textModel = require('./textModelService');
const knowledgeService = require('./craftKnowledgeService');

const MAX_CONTEXT_CRAFTS = 6;
const MAX_HISTORY_TURNS = 6;
const MAX_STORY_CHARS = 260;

function getCraftById(id) {
  return craftsData.find((craft) => craft.id === id);
}

async function retrieveContextCraftsAsync(question, options = {}) {
  const contexts = await knowledgeService.retrieveContextCrafts(String(question || ''), options);
  return padPinnedCraft(contexts, options);
}

// 指定藏品但上下文过少时，补同类别近邻，保证讲解有背景（展示层逻辑，留在讲解员侧）
function padPinnedCraft(contexts, { craftId } = {}) {
  const pinned = craftId ? getCraftById(craftId) : null;
  if (!pinned || contexts.length >= 3) return contexts;

  const picked = [...contexts];
  const seen = new Set(picked.map((craft) => craft.id));
  for (const craft of craftsData) {
    if (picked.length >= 3) break;
    if (seen.has(craft.id) || craft.category !== pinned.category) continue;
    picked.push(craft);
    seen.add(craft.id);
  }
  return picked;
}

function formatContextCraft(craft) {
  const story = String(craft.story || '').slice(0, MAX_STORY_CHARS);
  const meta = [craft.category, craft.regionLabel || craft.region].filter(Boolean).join(' · ');
  return [
    `【${craft.name}】id=${craft.id}${meta ? `（${meta}）` : ''}`,
    craft.blurb || craft.description || '',
    story ? `技艺故事：${story}` : ''
  ].filter(Boolean).join('\n');
}

// 同一套 grounded 规则，两种口吻：展厅讲解员，或长廊里跟随游客的灵宠「小布」（回答进对话气泡，更短）
const PERSONAS = {
  docent: {
    speaker: '讲解员',
    intro: '你是「非遗造物局」数字博物馆的 AI 讲解员，面向年轻观众讲解中国非物质文化遗产。',
    tone: '2. 语气亲切自然，像展厅里的人工讲解员；控制在 250 字以内。'
  },
  pet: {
    speaker: '小布',
    intro: '你是「非遗造物局」数字博物馆的灵宠「小布」，一只由非遗布老虎化身的小精灵，陪游客逛馆并讲解中国非物质文化遗产。',
    tone: '2. 语气活泼可爱、像朋友聊天，可偶尔用一句「嗷呜」，但内容必须可信；控制在 120 字以内，适合放进对话气泡。'
  }
};

function resolvePersona(persona) {
  return Object.hasOwn(PERSONAS, persona) ? persona : 'docent';
}

function formatHistory(history = [], speaker = PERSONAS.docent.speaker) {
  const turns = history
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'docent'))
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => `${turn.role === 'user' ? '游客' : speaker}：${String(turn.text || '').trim().slice(0, 300)}`);
  return turns.length ? turns.join('\n') : '（无）';
}

function buildDocentPrompt({ question, contexts, history, persona, hall }) {
  const voice = PERSONAS[resolvePersona(persona)];
  const contextBlock = contexts.length
    ? contexts.map(formatContextCraft).join('\n\n')
    : '（本轮没有检索到直接相关的馆藏资料）';
  const hallName = String(hall || '').trim().slice(0, 40);

  return [
    voice.intro,
    '回答规则：',
    '1. 只依据「馆藏资料」回答；资料未覆盖的内容，坦承资料里没有，不编造史实、年代或数字。',
    voice.tone,
    '3. 提到具体技艺时自然带出它的名称；如资料里有地域线索也一并说明。',
    '4. 可以在结尾给一个自然的后续建议（如相关的参观或共创方向）。',
    '',
    '馆藏资料：',
    contextBlock,
    '',
    hallName ? `游客当前所在：${hallName}\n` : '',
    `此前对话：\n${formatHistory(history, voice.speaker)}`,
    '',
    `游客提问：${question}`
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
}

function createQuestionError() {
  const error = new Error('请输入你想了解的非遗问题，例如：布老虎有什么寓意？');
  error.statusCode = 400;
  error.code = 'DOCENT_QUESTION_REQUIRED';
  return error;
}

async function answerQuestion({ question, craftId, history, persona, hall, modelClient, vectorProvider } = {}) {
  const trimmedQuestion = String(question || '').trim().slice(0, 400);
  if (!trimmedQuestion) throw createQuestionError();

  const contexts = await retrieveContextCraftsAsync(trimmedQuestion, {
    craftId,
    limit: MAX_CONTEXT_CRAFTS,
    modelClient,
    vectorProvider
  });
  const client = modelClient || textModel;
  const answer = await client.generatePlainText({
    prompt: buildDocentPrompt({ question: trimmedQuestion, contexts, history, persona, hall }),
    systemInstruction: '你是可信的博物馆讲解员，宁可说不知道也不编造。'
  });

  return {
    answer: answer.trim().slice(0, 1200),
    sources: contexts.map((craft) => ({
      id: craft.id,
      name: craft.name,
      category: craft.category || '',
      region: craft.regionLabel || craft.region || ''
    }))
  };
}

module.exports = {
  retrieveContextCraftsAsync,
  padPinnedCraft,
  buildDocentPrompt,
  answerQuestion
};
