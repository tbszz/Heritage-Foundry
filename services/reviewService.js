// 生成自审循环：出图后用视觉模型对照载体约束复查，
// 不达标时携带修改指令自动重制一版；自审自身失败绝不阻断主流程。
const geminiService = require('./geminiService');
const textModel = require('./textModelService');

const COMMON_CHECKS = [
  '画面中没有文字、水印、logo 或 UI 界面'
];

const PER_CARRIER_CHECKS = {
  keychain: [
    '单个主体居中且占画面约 88%',
    '轮廓清晰，色块分区明确（约 16–20 色），保留眼睛、纹样转折等中等细节',
    '纯白或浅灰纯色背景，无投影'
  ],
  bag: ['主体边界完整，是独立印花图案而非商品照片', '没有出现帆布包实物、拍摄场景等 mockup'],
  phone: ['主体居中完整，不贴边，适合手机壳背面构图', '没有出现手机壳实物、拍摄场景等 mockup'],
  sticker: ['各贴纸轮廓闭合、白边清晰，可拆分为独立小图', '没有出现商品实物或拍摄场景等 mockup'],
  magnet: ['主体轮廓闭合、层级清楚，有厚实小物感', '没有出现冰箱贴实物或拍摄场景等 mockup'],
  figurine: [
    '完整单体从头到脚全部入镜，正面略带三分之四视角',
    '肢体与轮廓未被遮挡，无多余角色',
    '无场景、无底座以外道具、无多视图拼贴，纯色干净背景'
  ]
};

const REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'], description: '是否达到交付标准' },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: '未达标项的简短中文说明，达标时为空数组'
    },
    revisionHint: {
      type: 'string',
      description: '当 verdict 为 revise 时，给图像模型的一条可直接执行的中文修改指令；达标时为空字符串'
    }
  },
  required: ['verdict', 'issues', 'revisionHint'],
  propertyOrdering: ['verdict', 'issues', 'revisionHint']
};

function buildReviewChecklist(carrier) {
  return [...(PER_CARRIER_CHECKS[carrier] || PER_CARRIER_CHECKS.keychain), ...COMMON_CHECKS];
}

function buildReviewPrompt(carrier) {
  const checklist = buildReviewChecklist(carrier)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  return [
    '你是「非遗造物局」的出图审校。请对照下面的检查清单逐项审查这张生成图，只依据画面实际情况判断。',
    checklist,
    '',
    '全部达标则 verdict=pass、issues 为空数组、revisionHint 为空字符串；',
    '任一项不达标则 verdict=revise，issues 逐条列出问题，revisionHint 给出一条可直接执行、面向图像生成模型的中文修改指令（合并所有问题的最短修复方案）。'
  ].join('\n');
}

function normalizeReview(raw) {
  const issues = Array.isArray(raw?.issues)
    ? raw.issues.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];
  const verdict = raw?.verdict === 'revise' && issues.length ? 'revise' : 'pass';
  const revisionHint = verdict === 'revise' ? String(raw?.revisionHint || '').trim().slice(0, 200) : '';
  return { verdict, issues, revisionHint };
}

async function reviewImage({ imageBase64, carrier, modelClient } = {}) {
  try {
    const client = modelClient || textModel;
    const { mimeType, data } = textModel.splitDataUrl(imageBase64);
    const raw = await client.generateStructuredJson({
      prompt: buildReviewPrompt(carrier),
      schema: REVIEW_RESPONSE_SCHEMA,
      images: [{ mimeType, data }],
      systemInstruction: '你是严谨的图像审校，只输出符合要求的 JSON，不编造画面里不存在的问题。'
    });
    return normalizeReview(raw);
  } catch (error) {
    // 自审是增强能力：模型超时、配额或网络问题时降级为 skipped，不影响交付主图。
    console.warn('Self review skipped:', error.message);
    return { verdict: 'skipped', issues: [], revisionHint: '', reason: error.message || '自审服务暂不可用' };
  }
}

async function generateImageWithSelfCheck({ prompt, options = {}, carrier, imageGenerator, modelClient } = {}) {
  const generate = imageGenerator || ((requestPrompt, requestOptions) => geminiService.generateImage(requestPrompt, requestOptions));
  const first = await generate(prompt, options);
  const firstReview = await reviewImage({ imageBase64: first.base64Image, carrier, modelClient });

  if (firstReview.verdict !== 'revise' || !firstReview.revisionHint) {
    return { ...first, review: firstReview, retried: false };
  }

  try {
    const retryPrompt = `${prompt}\n自审修正要求：${firstReview.revisionHint}`;
    const second = await generate(retryPrompt, options);
    const secondReview = await reviewImage({ imageBase64: second.base64Image, carrier, modelClient });
    return { ...second, review: secondReview, retried: true, firstReview };
  } catch (error) {
    console.warn('Self-check retry failed, keeping first image:', error.message);
    return {
      ...first,
      review: { ...firstReview, note: '自动重制未成功，已保留首版' },
      retried: false
    };
  }
}

module.exports = {
  buildReviewChecklist,
  buildReviewPrompt,
  normalizeReview,
  reviewImage,
  generateImageWithSelfCheck
};
