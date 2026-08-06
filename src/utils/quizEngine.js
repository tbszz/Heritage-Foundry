/**
 * 非遗知识问答引擎
 * 基于非遗故事通过 AI 生成测验题，并支持本地模板回退
 * 核心机制：学中创、创中学 —— 问答通过后解锁"灵感加成"
 */

import { getCraftById } from './craftData.js';

// ─── 本地模板题库（AI不可用时的回退方案） ───

const TEMPLATE_QUESTIONS = {
  'porcelain': [
    { q: '景德镇陶瓷素有"白如玉、明如镜、薄如纸"的第四句美誉是什么？', options: ['声如磬', '色如虹', '硬如钢', '轻如羽'], answer: 0 },
    { q: '景德镇陶瓷的制作需要经过多少道工序？', options: ['三十六道', '四十八道', '七十二道', '一百零八道'], answer: 2 },
    { q: '景德镇陶瓷被誉为什么？', options: ['东方瓷器名片', '东方丝绸之都', '东方茶都', '东方玉都'], answer: 0 }
  ],
  'papercut': [
    { q: '剪纸艺术距今已有多少年历史？', options: ['500年', '1000年', '1500年', '2000年'], answer: 2 },
    { q: '剪纸在哪一年被列入联合国人类非物质文化遗产？', options: ['2006年', '2009年', '2012年', '2015年'], answer: 1 },
    { q: '剪纸的主要工具是什么？', options: ['毛笔和墨', '剪刀和刻刀', '针和线', '锤和凿'], answer: 1 }
  ],
  'tiger-head': [
    { q: '布老虎起源于什么？', options: ['龙图腾崇拜', '虎图腾崇拜', '凤图腾崇拜', '蛇图腾崇拜'], answer: 1 },
    { q: '端午节给孩子佩戴布老虎的寓意是什么？', options: ['学业进步', '驱邪避灾、保佑平安', '财源广进', '长命百岁'], answer: 1 },
    { q: '布老虎是用什么材料制作的？', options: ['丝绸', '棉布', '皮革', '麻布'], answer: 1 }
  ],
  'calligraphy': [
    { q: '中国书法在哪一年被列入联合国非遗？', options: ['2006年', '2008年', '2009年', '2010年'], answer: 2 },
    { q: '中国书法通过什么来表现人格精神？', options: ['色彩搭配', '造型符号和笔墨韵律', '构图布局', '纸张选择'], answer: 1 },
    { q: '中国书法表现的是哪个民族的思维方式？', options: ['日本', '韩国', '中国', '越南'], answer: 2 }
  ],
  'tea': [
    { q: '中国传统制茶技艺在哪一年被列入联合国非遗？', options: ['2019年', '2020年', '2021年', '2022年'], answer: 3 },
    { q: '制茶技艺中不包括以下哪道工序？', options: ['采摘', '杀青', '烧制', '揉捻'], answer: 2 },
    { q: '中国被称为什么的故乡？', options: ['咖啡', '茶', '可可', '酒'], answer: 1 }
  ],
  'kites': [
    { q: '风筝起源于中国哪个时期？', options: ['西周', '东周春秋时期', '秦朝', '汉朝'], answer: 1 },
    { q: '相传谁研制了人类最早的风筝？', options: ['鲁班', '墨翟', '蔡伦', '诸葛亮'], answer: 1 },
    { q: '风筝在古代被称为什么？', options: ['飞鸢', '纸鸢', '木鸢', '天鸢'], answer: 1 }
  ]
};

// 通用模板（当特定技艺没有模板时使用）
const GENERIC_TEMPLATES = [
  { q: '这项非遗技艺属于中国哪个类别的非物质文化遗产？', options: ['传统美术', '传统技艺', '传统戏剧', '传统舞蹈'], answer: 1 },
  { q: '保护非物质文化遗产的主要目的是什么？', options: ['商业开发', '文化传承与保护', '旅游推广', '国际竞争'], answer: 1 },
  { q: '以下哪项不是非遗保护的原则？', options: ['真实性', '整体性', '传承性', '盈利性'], answer: 3 }
];

// ─── 从故事文本中提取关键词生成简单问题 ───

function generateTemplateQuestions(craft) {
  if (!craft) return GENERIC_TEMPLATES;
  const specific = TEMPLATE_QUESTIONS[craft.id];
  if (specific) return specific;

  // 基于故事文本生成简单问题
  const story = craft.story || '';
  const name = craft.name || '这项技艺';
  const category = craft.category || '传统技艺';

  return [
    {
      q: `${name}属于哪个非遗类别？`,
      options: ['传统美术', category, '传统戏剧', '传统医药'],
      answer: 1
    },
    {
      q: `${name}的核心价值是什么？`,
      options: ['商业价值', '文化传承与艺术价值', '娱乐价值', '军事价值'],
      answer: 1
    },
    {
      q: `学习${name}最重要的意义是什么？`,
      options: ['赚钱', '了解并传承中华优秀传统文化', '出国留学', '获得证书'],
      answer: 1
    }
  ];
}

// ─── AI 生成测验题 ───

async function fetchAIQuestions(craftId, craftName, craftStory) {
  try {
    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ craftId, craftName, craftStory })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !data.questions?.length) throw new Error('Invalid response');
    return data.questions;
  } catch (error) {
    console.warn('AI quiz generation failed, using templates:', error.message);
    return null;
  }
}

// ─── 公开 API ───

/**
 * 获取某非遗技艺的测验题
 * @param {string} craftId
 * @returns {Promise<Array<{q, options, answer}>>}
 */
export async function getQuizQuestions(craftId) {
  const craft = getCraftById(craftId);
  if (!craft) return GENERIC_TEMPLATES;

  // 尝试 AI 生成
  const aiQuestions = await fetchAIQuestions(craftId, craft.name, craft.story);
  if (aiQuestions) return aiQuestions;

  // 回退到本地模板
  return generateTemplateQuestions(craft);
}

/**
 * 评估测验结果
 * @param {Array} questions - 题目列表
 * @param {Array<number>} userAnswers - 用户答案索引
 * @returns {{ score: number, total: number, passed: boolean, results: Array }}
 */
export function evaluateQuiz(questions, userAnswers) {
  const results = questions.map((q, i) => ({
    question: q.q,
    correct: q.answer,
    user: userAnswers[i],
    isCorrect: q.answer === userAnswers[i]
  }));

  const correctCount = results.filter(r => r.isCorrect).length;
  const total = questions.length;
  const score = Math.round((correctCount / total) * 100);

  return {
    score,
    total: correctCount,
    outOf: total,
    passed: correctCount >= 2, // 3题中对2题即通过
    results
  };
}

/**
 * 获取"灵感等级"——根据测验成绩决定AI生成的提示词加成
 */
export function getInspirationLevel(score) {
  if (score >= 100) return { level: 3, label: '大师灵感', bonus: '传统工艺大师级' };
  if (score >= 67) return { level: 2, label: '匠人灵感', bonus: '技艺精湛的' };
  return { level: 1, label: '学徒灵感', bonus: '' };
}