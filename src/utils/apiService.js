import { getCraftById } from './craftData.js';

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
  const craftData = getCraftById(craft);
  const craftName = craftData?.promptTitle || craftData?.name || craft;
  const craftDetail = craftData?.promptLanguage || `${craftName}的传统纹样与材质`;
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
  const craftData = getCraftById(craft);
  if (!craftData) {
    return { name: craft, description: '', story: '' };
  }
  return {
    name: craftData.name,
    description: craftData.blurb || craftData.description,
    story: craftData.story
  };
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
