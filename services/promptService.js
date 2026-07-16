// 技艺提示词语料统一来自 src/data/crafts.json（唯一数据源），此处仅做派生
const craftsData = require('../src/data/crafts.json');

const CRAFT_LIBRARY = Object.fromEntries(
  craftsData
    .filter((craft) => craft.promptLanguage)
    .map((craft) => [craft.id, {
      name: craft.name,
      language: craft.promptLanguage,
      twist: craft.promptTwist
    }])
);

const IP_LIBRARY = {
  doraemon: {
    name: '哆啦A梦',
    traits: '圆润蓝白猫型轮廓、铃铛、口袋、亲和表情'
  },
  bears: {
    name: '熊大熊二',
    traits: '两只熊的温暖伙伴感、森林冒险气质、夸张表情'
  },
  nezha: {
    name: '哪吒',
    traits: '混天绫、风火轮、少年英雄姿态、红色动势'
  },
  monkey: {
    name: '孙悟空',
    traits: '金箍棒、猴王轮廓、腾云动作、金红战斗气场'
  },
  pikachu: {
    name: '皮卡丘',
    traits: '黄色电气小精灵轮廓、闪电尾巴、红脸颊、活泼姿态'
  },
  mickey: {
    name: '米老鼠',
    traits: '圆耳朵、手套感、经典卡通轮廓、快乐动作'
  },
  helloKitty: {
    name: 'Hello Kitty',
    traits: '白色猫脸、蝴蝶结、极简可爱五官、礼物感'
  },
  spiderMan: {
    name: '蜘蛛侠',
    traits: '蜘蛛网纹、红蓝英雄配色、跃动姿势、城市守护感'
  },
  batman: {
    name: '蝙蝠侠',
    traits: '蝙蝠披风、暗色英雄轮廓、徽章感、夜行动势'
  },
  pokemon: {
    name: '宝可梦',
    traits: '可收集怪兽伙伴感、圆润形体、能量特效、冒险徽章感'
  }
};

const CARRIER_LIBRARY = {
  keychain: {
    name: '拼豆挂件',
    constraint: '单个主体居中，外轮廓清楚，可以直接转成拼豆挂件'
  },
  bag: {
    name: '帆布包',
    constraint: '像帆布包主图，边缘完整，适合印刷和刺绣贴片'
  },
  phone: {
    name: '手机壳',
    constraint: '竖向主视觉，主体不要贴边，适合手机壳中央图案'
  },
  sticker: {
    name: '贴纸套组',
    constraint: '贴纸感强，白边清晰，可以拆成多个小图标'
  },
  magnet: {
    name: '冰箱贴',
    constraint: '厚实小物件感，轮廓明确，适合磁贴产品'
  }
};

const STYLE_LIBRARY = {
  default: '现代文创产品摄影，高级但好玩',
  poster: '强视觉海报构图，高对比标题感但画面内无文字',
  product: '干净产品摄影，柔和投影，电商主图清晰度',
  chinese: '国潮明亮风格，高饱和宝石色和现代潮玩质感',
  cute: '可爱校园风格，圆润比例，明亮亲和',
  vintage: '复古市集风格，温暖颗粒感和手作温度',
  minimal: '极简日常风格，少量颜色，大块面和清爽留白',
  festive: '节日礼物风格，喜庆配色和礼盒惊喜感'
};

function resolveLibraryItem(library, key, fallbackName) {
  if (key && library[key]) return library[key];
  return {
    name: fallbackName || key || '非遗技艺',
    language: `${fallbackName || key || '非遗'}的传统视觉元素`,
    traits: `${fallbackName || key || '流行 IP'}的核心角色特征`,
    constraint: '适合文创产品落地'
  };
}

function buildCreativePrompt({ basePrompt = '', style = 'default', craftType, ip, carrier } = {}) {
  const craft = resolveLibraryItem(CRAFT_LIBRARY, craftType, craftType);
  const ipItem = resolveLibraryItem(IP_LIBRARY, ip, ip);
  const carrierItem = resolveLibraryItem(CARRIER_LIBRARY, carrier, carrier || '文创产品');
  const styleText = STYLE_LIBRARY[style] || style || STYLE_LIBRARY.default;
  const task = basePrompt.trim() || `${craft.name} × ${ipItem.name} ${carrierItem.name}`;

  return [
    '你是一位脑洞大开的国潮非遗视觉导演，创作一张非常吸引注意力的非遗 × 流行 IP 跨界主视觉。',
    `核心任务：${task}。`,
    `跨界组合：${craft.name}非遗语言 + ${ipItem.name}流行 IP 角色特征 + ${carrierItem.name}。`,
    `非遗视觉：${craft.language}，${craft.twist || '传统技艺以超现实方式重组'}。`,
    `IP特征：保留${ipItem.name}的可识别神态与轮廓关键词：${ipItem.traits}，避免官方 logo 和文字商标。`,
    `产品方向：${carrierItem.constraint}，${styleText}。`,
    '拼豆转译约束：单个主体居中，粗轮廓，高对比色块，颜色数量克制，细节可以被 18x12 拼豆图纸读取，边缘不要过碎。',
    '画面要求：1:1 方图，干净背景，无文字，无水印，无 UI mockup，高清产品级渲染，动态感强，奇思妙想但形体明确。'
  ].join('\n');
}

function buildEnhancedPrompt(basePrompt, style, craftType, context = {}) {
  return buildCreativePrompt({
    basePrompt,
    style,
    craftType,
    ip: context.ip,
    carrier: context.carrier
  });
}

module.exports = {
  buildCreativePrompt,
  buildEnhancedPrompt
};
