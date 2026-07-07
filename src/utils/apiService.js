const CRAFT_MAP = {
  papercut: '剪纸艺术',
  shadow: '皮影艺术',
  embroidery: '苗绣艺术',
  'tie-dye': '扎染艺术',
  'new-year': '木版年画',
  porcelain: '景德镇陶瓷',
  calligraphy: '中国书法',
  seal: '中国篆刻',
  brocade: '南京云锦',
  tangka: '唐卡艺术',
  clay: '泥塑艺术',
  tea: '制茶技艺'
};

const CRAFT_DETAIL_MAP = {
  papercut: '镂空红纸、对称窗花、连绵云纹、利落剪影边缘',
  shadow: '半透明皮影、戏台光幕、铆钉关节、强烈侧光',
  embroidery: '苗绣针脚、银饰反光、蝴蝶妈妈纹、几何彩线',
  'tie-dye': '蓝白扎染、旋涡纹、手工布料肌理、自然渐变',
  'new-year': '木版年画、门神配色、套色版印、粗黑线',
  porcelain: '青花瓷、釉面高光、瓷片花纹、温润白胎',
  calligraphy: '飞白笔触、墨色层次、宣纸肌理、行草动势',
  seal: '朱文白文、石章肌理、篆刻边框、刀刻痕迹',
  brocade: '南京云锦、金线织锦、团花纹、皇家织造光泽',
  tangka: '唐卡矿物颜料、宝石色、金线勾勒、庄严对称坛城',
  clay: '手捏泥塑、圆润体块、彩塑高光、庙会色彩',
  tea: '茶山曲线、竹匾、茶汤琥珀光、手作器具'
};

const IP_MAP = {
  doraemon: '哆啦A梦',
  bears: '熊大熊二',
  nezha: '哪吒',
  monkey: '孙悟空',
  pikachu: '皮卡丘',
  mickey: '米老鼠',
  helloKitty: 'Hello Kitty',
  spiderMan: '蜘蛛侠',
  batman: '蝙蝠侠',
  pokemon: '宝可梦'
};

const STYLE_MAP = {
  chinese: '国潮明亮风格',
  cute: '可爱校园风格',
  vintage: '复古市集风格',
  minimal: '极简日常风格',
  festive: '节日礼物风格'
};

const CARRIER_MAP = {
  keychain: '拼豆挂件',
  bag: '帆布包',
  phone: '手机壳',
  sticker: '贴纸套组',
  magnet: '冰箱贴'
};

export function generatePrompt(craft, ip, style, carrier = 'keychain') {
  const craftName = CRAFT_MAP[craft] || craft;
  const craftDetail = CRAFT_DETAIL_MAP[craft] || `${craftName}的传统纹样与材质`;
  const ipName = IP_MAP[ip] || ip;
  const styleName = STYLE_MAP[style] || style;
  const carrierName = CARRIER_MAP[carrier] || carrier;
  
  return [
    `脑洞大开的非遗 × 流行 IP 跨界设计：${craftName} × ${ipName} × ${carrierName}`,
    `把${ipName}的可识别轮廓与${craftDetail}融合，${styleName}，奇思妙想但主体清晰`,
    '单个主体居中，高对比色块，粗轮廓，干净背景，无文字，无水印',
    '必须适合转译成 18x12 拼豆图纸和拼豆挂件，边缘不要过碎，颜色数量克制'
  ].join('，');
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await response.json();
    return { response, data };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function generateImage(prompt, options = {}) {
  try {
    const {
      aspect_ratio = '1:1',
      image_size = '1K',
      mime_type = 'image/jpeg',
      style = 'default',
      craft_type,
      ip,
      carrier,
      timeoutMs = 90000
    } = options;

    const { response, data } = await fetchJsonWithTimeout('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio,
        image_size,
        mime_type,
        style,
        craft_type,
        ip,
        carrier
      })
    }, timeoutMs);
    
    if (data.success && data.image) {
      return {
        imageUrl: data.image,
        message: data.message || 'AI生成成功'
      };
    }
    
    throw new Error(data.error || '生成图片失败');
  } catch (error) {
    console.warn('Image generation fallback:', error);
    return {
      imageUrl: generateMockImage(),
      message: error.name === 'AbortError' ? 'AI生成超时，已使用本地模拟图像' : error.message || '生成失败，使用模拟图像'
    };
  }
}

export async function editImage(imageBase64, prompt, options = {}) {
  try {
    const { aspect_ratio = '1:1', mime_type = 'image/png' } = options;

    const { response, data } = await fetchJsonWithTimeout('/api/edit-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: imageBase64,
        prompt,
        aspect_ratio,
        mime_type
      })
    });
    
    if (data.success && data.image) {
      return {
        imageUrl: data.image,
        message: data.message || '编辑成功'
      };
    }
    
    throw new Error(data.error || '编辑图片失败');
  } catch (error) {
    console.warn('Image editing fallback:', error);
    return {
      imageUrl: generateMockImage(),
      message: error.name === 'AbortError' ? 'AI编辑超时，已使用本地模拟图像' : error.message || '编辑失败，使用模拟图像'
    };
  }
}

export async function getStyles() {
  try {
    const response = await fetch('/api/styles');
    const data = await response.json();
    
    if (data.success) {
      return data.styles || [];
    }
    
    throw new Error(data.error || '获取风格列表失败');
  } catch (error) {
    console.error('Failed to get styles:', error);
    return [];
  }
}

export async function saveCreation(payload) {
  const response = await fetch('/api/creations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    const error = new Error(data.error?.message || data.error || '保存作品失败');
    error.code = data.error?.code;
    throw error;
  }

  return data.data;
}

export async function listCreations(limit = 6) {
  const response = await fetch(`/api/creations?limit=${encodeURIComponent(limit)}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    return [];
  }

  return data.data || [];
}

function generateMockImage() {
  const colors = ['#d3382f', '#1f7a6d', '#c99a2e', '#2f5f9f'];
  const emojis = ['🐯', '✂️', '🪡', '🏺', '🎨', '🖋️', '🧶', '🍵', '🪁', '🏮'];
  const craftNames = ['剪纸', '皮影', '苗绣', '陶瓷', '扎染', '书法', '云锦', '泥塑', '风筝', '花灯'];
  
  const emoji1 = emojis[Math.floor(Math.random() * emojis.length)];
  const emoji2 = emojis[Math.floor(Math.random() * emojis.length)];
  const bgColor = colors[Math.floor(Math.random() * colors.length)];
  const craftName = craftNames[Math.floor(Math.random() * craftNames.length)];

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = bgColor;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(62, 62, 388, 388, 36);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bgColor;
    ctx.font = '120px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji1, 206, 210);
    ctx.fillText(emoji2, 306, 290);

    ctx.fillStyle = '#1f2328';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(`${craftName}风格`, 256, 374);
    ctx.fillStyle = '#687076';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('非遗文创设计', 256, 412);

    return canvas.toDataURL('image/png');
  }
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="${bgColor}" opacity="0.1"/>
      <rect x="64" y="64" width="384" height="384" rx="32" fill="white" stroke="${bgColor}" stroke-width="4"/>
      <text x="256" y="180" font-size="80" text-anchor="middle" font-family="sans-serif">${emoji1}</text>
      <text x="256" y="280" font-size="120" text-anchor="middle" font-family="sans-serif">${emoji2}</text>
      <text x="256" y="360" font-size="24" text-anchor="middle" font-family="sans-serif" fill="#666">${craftName}风格</text>
      <text x="256" y="400" font-size="20" text-anchor="middle" font-family="sans-serif" fill="#999">非遗文创设计</text>
    </svg>`;
  
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function getCraftInfo(craft) {
  const info = {
    papercut: {
      name: '剪纸',
      description: '中国传统民间艺术，以剪刀或刻刀在纸上剪刻花纹',
      story: '剪纸是中国最古老的民间艺术之一，距今已有1500多年历史。剪纸艺术通过一把剪刀、一张红纸，就能创造出形态各异的图案，表达人们对美好生活的向往和祝福。2009年被列入联合国人类非物质文化遗产代表作名录。'
    },
    shadow: {
      name: '皮影',
      description: '用兽皮或纸板做成的人物剪影以表演故事的民间戏剧',
      story: '皮影戏是中国民间古老的传统艺术，又称"影子戏"或"灯影戏"。表演者在白色幕布后面，一边操纵影人，一边用当地流行的曲调讲述故事，同时配以乐器伴奏。皮影戏是世界上最早的动画形式之一。'
    },
    embroidery: {
      name: '苗绣',
      description: '苗族民间刺绣，色彩鲜艳，纹样繁复',
      story: '苗绣是苗族妇女世代传承的传统技艺，被誉为"穿在身上的史诗"。苗绣以其色彩鲜艳、纹样繁复、针法多样而著称，每一件作品都蕴含着苗族人民的历史记忆和文化信仰。'
    },
    'tie-dye': {
      name: '扎染',
      description: '中国民间传统而独特的染色工艺',
      story: '扎染是中国传统的手工染色技艺，通过纱、线、绳等工具，对织物进行扎、缝、缚、缀、夹等多种形式组合后进行染色。扎染作品色彩斑斓、图案独特，每一件都是独一无二的艺术品。'
    },
    'new-year': {
      name: '木版年画',
      description: '用木版印刷的年画，线条粗犷，色彩鲜明',
      story: '木版年画是中国民间美术中一个重要的门类，始于汉代，发展于唐宋，盛行于明清。木版年画以其线条粗犷、色彩鲜明、题材丰富而深受人们喜爱，是春节期间重要的装饰艺术品。'
    },
    porcelain: {
      name: '景德镇陶瓷',
      description: '中国著名的瓷器制作技艺，白如玉、明如镜、薄如纸、声如磬',
      story: '景德镇陶瓷享誉千年，素有"白如玉、明如镜、薄如纸、声如磬"的千古美誉。从汉代原始青瓷起步，经唐宋发展、明清鼎盛，景德镇成为独步世界的东方瓷器名片。一器之成，历经七十二道工序。'
    },
    calligraphy: {
      name: '中国书法',
      description: '以汉字为表象的书写艺术，具有独特的造型符号和笔墨韵律',
      story: '中国书法通过汉字书写，在完成信息交流实用功能的同时，以特有的造型符号和笔墨韵律，融入人们对自然、社会、生命的思考，从而表现出中国人特有的思维方式、人格精神与性情志趣。2009年被列入联合国人类非物质文化遗产代表作名录。'
    },
    seal: {
      name: '中国篆刻',
      description: '以石材为主要材料，以刻刀为工具，以汉字为表象的镌刻艺术',
      story: '中国篆刻是以石材为主要材料，以刻刀为工具，以汉字为表象的一门独特的镌刻艺术。它由中国古代的印章制作技艺发展而来，至今已有3000多年的历史。2009年被列入联合国人类非物质文化遗产代表作名录。'
    },
    brocade: {
      name: '南京云锦',
      description: '中国织锦技艺最高水平的代表，存续着皇家织造传统',
      story: '南京云锦织造技艺存续着中国皇家织造的传统，是中国织锦技艺最高水平的代表。它将"通经断纬"等核心技术运用在构造复杂的大型织机上，由上下两人手工操作，是人类非凡创造力的见证。2009年被列入联合国人类非物质文化遗产代表作名录。'
    },
    tangka: {
      name: '唐卡',
      description: '藏族传统绘画艺术，色彩鲜艳，内容丰富',
      story: '唐卡是藏族文化中一种独具特色的绘画艺术形式，具有鲜明的民族特点、浓郁的宗教色彩和独特的艺术风格。唐卡题材内容涉及藏族的历史、政治、文化和社会生活等诸多领域。'
    },
    clay: {
      name: '泥塑',
      description: '以黏土为原料塑造各种形象的传统民间艺术',
      story: '泥塑是中国民间传统艺术之一，以黏土为原料塑造各种形象。泥塑艺术历史悠久，早在新石器时代就已出现。著名的天津泥人张、无锡惠山泥人等都是中国泥塑艺术的杰出代表。'
    },
    tea: {
      name: '制茶技艺',
      description: '中国传统制茶工艺，包括采摘、萎凋、杀青、揉捻等多道工序',
      story: '中国是茶的故乡，制茶技艺历史悠久。从采摘、萎凋、杀青到揉捻、成型，繁复的工序里蕴含着每一个茶匠孜孜不倦的追求与心血。2022年"中国传统制茶技艺及其相关习俗"被列入联合国人类非物质文化遗产代表作名录。'
    }
  };
  
  return info[craft] || { name: craft, description: '', story: '' };
}

export function getIPInfo(ip) {
  const info = {
    doraemon: { name: '哆啦A梦', origin: '日本动漫《哆啦A梦》' },
    bears: { name: '熊大熊二', origin: '国产动画《熊出没》' },
    nezha: { name: '哪吒', origin: '中国神话《封神演义》' },
    monkey: { name: '孙悟空', origin: '中国古典名著《西游记》' },
    pikachu: { name: '皮卡丘', origin: '日本动漫《精灵宝可梦》' },
    mickey: { name: '米老鼠', origin: '迪士尼经典动画角色' },
    helloKitty: { name: 'Hello Kitty', origin: '日本三丽鸥卡通形象' },
    spiderMan: { name: '蜘蛛侠', origin: '漫威超级英雄' },
    batman: { name: '蝙蝠侠', origin: 'DC超级英雄' },
    pokemon: { name: '宝可梦', origin: '日本动漫《精灵宝可梦》' }
  };
  
  const fallback = info[ip] || { name: ip, origin: '' };
  return {
    ...fallback,
    description: fallback.origin || fallback.description || ''
  };
}

export function getCarrierInfo(carrier) {
  const info = {
    keychain: { name: '拼豆挂件', description: '用拼豆制作的挂饰' },
    bag: { name: '帆布包', description: '印有非遗纹样的帆布包' },
    phone: { name: '手机壳', description: '印有非遗纹样的手机壳' },
    sticker: { name: '贴纸套组', description: '非遗主题贴纸套装' },
    magnet: { name: '冰箱贴', description: '非遗主题冰箱贴' }
  };
  
  return info[carrier] || { name: carrier, description: '' };
}

export function getStyleInfo(style) {
  const info = {
    chinese: { name: '国潮明亮', description: '高饱和度配色，现代国潮风格' },
    cute: { name: '可爱校园', description: '圆润线条，可爱卡通风格' },
    vintage: { name: '复古市集', description: '怀旧色调，复古文艺风格' },
    minimal: { name: '极简日常', description: '简约线条，低饱和度配色' },
    festive: { name: '节日礼物', description: '喜庆配色，节日氛围' }
  };
  
  return info[style] || { name: style, description: '' };
}
