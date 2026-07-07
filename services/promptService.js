const CRAFT_LIBRARY = {
  papercut: {
    name: '剪纸',
    language: '镂空红纸、对称窗花、连绵云纹、利落剪影边缘',
    twist: '把角色轮廓拆成会发光的纸雕星门'
  },
  shadow: {
    name: '皮影',
    language: '半透明牛皮质感、戏台光幕、铆钉关节、强烈侧光',
    twist: '让角色像从影幕里跳出的未来戏偶'
  },
  embroidery: {
    name: '苗绣',
    language: '密集针脚、银饰反光、蝴蝶妈妈纹、几何彩线',
    twist: '把角色服装织成会流动的史诗地图'
  },
  'tie-dye': {
    name: '扎染',
    language: '蓝白晕染、旋涡纹、手工布料肌理、自然渐变',
    twist: '让角色站在扎染星云和海潮之间'
  },
  'new-year': {
    name: '木版年画',
    language: '门神配色、套色版印、粗黑线、年节祥瑞纹',
    twist: '把角色重塑成开年好运守护者'
  },
  porcelain: {
    name: '景德镇陶瓷',
    language: '青花蓝、釉面高光、瓷片花纹、温润白胎',
    twist: '让角色像从瓷器裂纹里复活的蓝白精灵'
  },
  calligraphy: {
    name: '中国书法',
    language: '飞白笔触、墨色层次、宣纸肌理、行草动势',
    twist: '让角色由一笔巨大的墨痕变形成形'
  },
  seal: {
    name: '中国篆刻',
    language: '朱文白文、石章肌理、篆字边框、刀刻痕迹',
    twist: '把角色压缩成一枚会跃出的印章图腾'
  },
  brocade: {
    name: '南京云锦',
    language: '金线织锦、团花纹、皇家织造光泽、层叠纹样',
    twist: '让角色披着像星河一样展开的云锦披风'
  },
  tangka: {
    name: '唐卡',
    language: '矿物颜料、宝石色、金线勾勒、庄严对称坛城、细密装饰纹样',
    twist: '把角色放进会旋转的赛博坛城和祥云轨道'
  },
  clay: {
    name: '泥塑',
    language: '手捏泥土纹、圆润体块、彩塑高光、民间庙会色彩',
    twist: '让角色像刚从神奇泥土里醒来的守护偶'
  },
  tea: {
    name: '制茶技艺',
    language: '茶山曲线、蒸汽、竹匾、茶汤琥珀光、手作器具',
    twist: '把角色变成一杯茶香升起的奇幻形象'
  },
  jade: {
    name: '玉雕',
    language: '温润半透明玉质、瑞兽纹、浅浮雕层次、柔和冷光',
    twist: '让角色像从玉石内核里透光出现'
  },
  'wood-carving': {
    name: '木雕',
    language: '刀刻纹理、木质年轮、浮雕层次、古建纹样',
    twist: '把角色刻成会动的木作机关挂件'
  },
  'stone-carving': {
    name: '石刻',
    language: '岩石颗粒、浮雕阴影、碑刻边缘、厚重灰调',
    twist: '让角色像从古老石壁中破壁而出'
  }
};

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
