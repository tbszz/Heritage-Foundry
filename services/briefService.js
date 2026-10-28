// 对话式造物台：把用户的一句自然语言解析成「创作简报」，
// 候选集与 generator 页四个下拉框保持一致，保证解析结果能直接回填表单。
const craftsData = require('../src/data/crafts.json');
const textModel = require('./textModelService');

const IP_CANDIDATES = [
  { id: 'doraemon', name: '哆啦A梦', hint: '圆润蓝白猫型机器人，亲和快乐' },
  { id: 'bears', name: '熊大熊二', hint: '森林伙伴，温暖冒险' },
  { id: 'nezha', name: '哪吒', hint: '少年英雄，混天绫与风火轮' },
  { id: 'monkey', name: '孙悟空', hint: '猴王轮廓，金箍棒与腾云' },
  { id: 'pikachu', name: '皮卡丘', hint: '黄色电气小精灵，闪电尾' },
  { id: 'mickey', name: '米老鼠', hint: '圆耳轮廓，经典卡通' },
  { id: 'helloKitty', name: 'Hello Kitty', hint: '白色猫脸蝴蝶结，极简可爱' },
  { id: 'spiderMan', name: '蜘蛛侠', hint: '红蓝配色，跃动英雄' },
  { id: 'batman', name: '蝙蝠侠', hint: '暗色披风，徽章轮廓' },
  { id: 'pokemon', name: '宝可梦', hint: '可收集伙伴，圆润形体' }
];

const CARRIER_CANDIDATES = [
  { id: 'keychain', name: '拼豆挂件', hint: '可转译拼豆图纸的小挂饰' },
  { id: 'bag', name: '帆布包', hint: '印刷用独立印花图案' },
  { id: 'phone', name: '手机壳', hint: '竖版手机壳图案' },
  { id: 'sticker', name: '贴纸套组', hint: '多枚白边贴纸' },
  { id: 'magnet', name: '冰箱贴', hint: '厚实轮廓的小磁贴' },
  { id: 'figurine', name: '3D手办', hint: '可生成真实 3D 模型的单体角色' }
];

const STYLE_CANDIDATES = [
  { id: 'chinese', name: '国潮明亮', hint: '高饱和宝石色，现代国潮' },
  { id: 'cute', name: '可爱校园', hint: '圆润比例，明亮亲和' },
  { id: 'vintage', name: '复古市集', hint: '温暖颗粒，手作温度' },
  { id: 'minimal', name: '极简日常', hint: '少色大块面，清爽留白' },
  { id: 'festive', name: '节日礼物', hint: '喜庆配色，礼盒氛围' }
];

function getCraftCandidates() {
  return craftsData
    .filter((craft) => craft.promptLanguage)
    .map((craft) => ({
      id: craft.id,
      name: craft.name,
      hint: [craft.category, craft.regionLabel || craft.region].filter(Boolean).join(' · ')
    }));
}

function formatCandidates(candidates) {
  return candidates
    .map((item) => `- ${item.id}：${item.name}${item.hint ? `（${item.hint}）` : ''}`)
    .join('\n');
}

function resolveCandidate(rawValue, candidates, fallbackId) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const exact = candidates.find((item) => item.id === raw);
  if (exact) return exact;
  const byName = candidates.find(
    (item) => item.name === raw || raw.includes(item.name) || item.name.includes(raw)
  );
  return byName || null;
}

function resolveBriefField(rawValue, candidates, fallbackId) {
  const resolved = resolveCandidate(rawValue, candidates) || candidates.find((item) => item.id === fallbackId);
  return resolved || candidates[0];
}

function normalizeBrief(raw, currentBrief = {}) {
  const crafts = getCraftCandidates();
  const craft = resolveBriefField(raw?.craft, crafts, currentBrief.craftId);
  const ip = resolveBriefField(raw?.ip, IP_CANDIDATES, currentBrief.ipId);
  const carrier = resolveBriefField(raw?.carrier, CARRIER_CANDIDATES, currentBrief.carrierId);
  const style = resolveBriefField(raw?.style, STYLE_CANDIDATES, currentBrief.styleId);

  return {
    craftId: craft.id,
    craftName: craft.name,
    ipId: ip.id,
    ipName: ip.name,
    carrierId: carrier.id,
    carrierName: carrier.name,
    styleId: style.id,
    styleName: style.name,
    customPrompt: String(raw?.customPrompt || '').trim().slice(0, 500),
    reasoning: String(raw?.reasoning || '').trim().slice(0, 400)
  };
}

function formatCurrentBrief(currentBrief = {}) {
  const lines = [
    currentBrief.craftId ? `技艺=${currentBrief.craftId}` : null,
    currentBrief.ipId ? `流行 IP=${currentBrief.ipId}` : null,
    currentBrief.carrierId ? `载体=${currentBrief.carrierId}` : null,
    currentBrief.styleId ? `气质=${currentBrief.styleId}` : null,
    currentBrief.customPrompt ? `补充描述=${currentBrief.customPrompt}` : null
  ].filter(Boolean);

  return lines.length ? lines.join('，') : '（暂无，属全新立意）';
}

function buildBriefPrompt({ message, currentBrief = {} }) {
  return [
    '你是「非遗造物局」的文创策划助理。用户会用一句自然语言提出文创创作需求，可能包含送礼对象、场合、喜好、地域、题材与载体偏好。',
    '你的任务：从下面给定的候选清单里，为用户选出一组最贴合的创作参数。只能使用清单中的 id，不要编造。',
    '用户没有明确提到的维度：若提供了当前简报则沿用，否则选择最稳妥的默认组合。',
    'customPrompt：把用户需求里具体、可执行的画面要求（颜色、元素、氛围、细节）提炼成一句中文；没有就返回空字符串。',
    'reasoning：用一两句中文向用户说明你的选择理由，口吻亲切。',
    '',
    '候选·非遗技艺（id：名称（类别 · 地域））：',
    formatCandidates(getCraftCandidates()),
    '',
    '候选·流行 IP：',
    formatCandidates(IP_CANDIDATES),
    '',
    '候选·文创载体：',
    formatCandidates(CARRIER_CANDIDATES),
    '',
    '候选·作品气质：',
    formatCandidates(STYLE_CANDIDATES),
    '',
    `当前简报：${formatCurrentBrief(currentBrief)}`,
    `用户新需求：${message}`
  ].join('\n');
}

const BRIEF_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    craft: { type: 'string', description: '选中的非遗技艺 id' },
    ip: { type: 'string', description: '选中的流行 IP id' },
    carrier: { type: 'string', description: '选中的文创载体 id' },
    style: { type: 'string', description: '选中的作品气质 id' },
    customPrompt: { type: 'string', description: '提炼出的画面补充要求，可为空' },
    reasoning: { type: 'string', description: '向用户说明选择理由的一两句中文' }
  },
  required: ['craft', 'ip', 'carrier', 'style', 'customPrompt', 'reasoning'],
  propertyOrdering: ['craft', 'ip', 'carrier', 'style', 'customPrompt', 'reasoning']
};

function createBriefMessageError() {
  const error = new Error('请先描述你的创作需求，例如：做一个送表弟的皮卡丘生日挂件');
  error.statusCode = 400;
  error.code = 'BRIEF_MESSAGE_REQUIRED';
  return error;
}

async function parseCreativeBrief({ message, currentBrief, modelClient } = {}) {
  const trimmedMessage = String(message || '').trim().slice(0, 600);
  if (!trimmedMessage) throw createBriefMessageError();

  const client = modelClient || textModel;
  const raw = await client.generateStructuredJson({
    prompt: buildBriefPrompt({ message: trimmedMessage, currentBrief }),
    schema: BRIEF_RESPONSE_SCHEMA,
    systemInstruction: '你是严谨的文创策划助理，只输出符合要求的 JSON。'
  });

  return normalizeBrief(raw, currentBrief);
}

module.exports = {
  IP_CANDIDATES,
  CARRIER_CANDIDATES,
  STYLE_CANDIDATES,
  getCraftCandidates,
  buildBriefPrompt,
  normalizeBrief,
  parseCreativeBrief
};
