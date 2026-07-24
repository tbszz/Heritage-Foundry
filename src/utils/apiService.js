import { getCraftById } from './craftData.js';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
  magnet: '冰箱贴',
  figurine: '3D手办'
};

const CARRIER_PROMPT_MAP = {
  keychain: '必须适合转译成 96x96 高密度拼豆图纸和拼豆挂件，主体占画面约 88%，轮廓清晰并保留眼睛、纹样转折等中等细节，使用 16–20 色且颜色分区明确，使用纯白或浅灰的纯色背景且不要投影',
  bag: '输出可直接印在帆布包正面的独立印花图案，完整构图，不要商品展示图，不要场景 mockup',
  phone: '输出适合手机壳背面的竖版独立印花图案，避开镜头区域，不要商品展示图，不要场景 mockup',
  sticker: '输出一组轮廓完整、留有白边的独立贴纸图案，不要商品展示图，不要场景 mockup',
  magnet: '输出适合做浅浮雕冰箱贴的独立图案，主体轮廓闭合、层级清楚，不要商品展示图，不要场景 mockup',
  figurine: '用于图生3D的3D手办参考图：完整主体从头到脚全部入镜，三分之四正面视角，无遮挡，干净纯色背景，单一角色，不要底座以外的场景道具'
};

export function generatePrompt(craft, ip, style, carrier = 'keychain') {
  const craftData = getCraftById(craft);
  const craftName = craftData?.promptTitle || craftData?.name || craft;
  const craftDetail = craftData?.promptLanguage || `${craftName}的传统纹样与材质`;
  const ipName = IP_MAP[ip] || ip;
  const styleName = STYLE_MAP[style] || style;
  const carrierName = CARRIER_MAP[carrier] || carrier;
  const carrierConstraint = CARRIER_PROMPT_MAP[carrier] || CARRIER_PROMPT_MAP.keychain;
  
  return [
    `脑洞大开的非遗 × 流行 IP 跨界设计：${craftName} × ${ipName} × ${carrierName}`,
    `把${ipName}的可识别轮廓与${craftDetail}融合，${styleName}，奇思妙想但主体清晰`,
    '单个主体居中，高对比色块，清晰轮廓，保留中等细节，干净纯色背景，无文字，无水印',
    carrierConstraint
  ].join('，');
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await response.json();
    return { response, data };
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', forwardAbort);
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
      signal,
      timeoutMs = 135000
    } = options;

    const { response, data } = await fetchJsonWithTimeout(`${API_BASE_URL}/generate-image`, {
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
      }),
      signal
    }, timeoutMs);
    
    if (data.success && data.image) {
      return {
        imageUrl: data.image,
        message: data.message || 'AI生成成功'
      };
    }
    
    throw new Error(data.error || '生成图片失败');
  } catch (error) {
    console.warn('Image generation failed:', error);
    const message = error.name === 'AbortError'
      ? 'AI 生成超时，请稍后重试'
      : error.name === 'TypeError' && /failed to fetch|networkerror|load failed/i.test(error.message || '')
        ? '无法连接本地生成服务，请确认已通过 npm run dev 启动前后端'
        : error.message || '生成图片失败';
    throw new Error(message);
  }
}

function createApiError(data, fallbackMessage) {
  const message = typeof data?.error === 'string'
    ? data.error
    : data?.error?.message || fallbackMessage;
  const error = new Error(message);
  error.code = data?.code || data?.error?.code;
  error.provider = data?.provider;
  error.category = data?.category;
  error.retryable = data?.retryable;
  return error;
}

export async function get3DCapabilities(options = {}) {
  const { timeoutMs = 10000 } = options;
  const { response, data } = await fetchJsonWithTimeout(
    `${API_BASE_URL}/3d-capabilities`,
    { method: 'GET' },
    timeoutMs
  );
  if (!response.ok || !data?.success || !data?.capabilities) {
    throw createApiError(data, '无法读取真实 3D 服务状态');
  }
  return data.capabilities;
}

export async function create3DGenerationTask(imageUrl, options = {}) {
  if (!imageUrl) {
    throw new Error('请先生成 3D 参考图');
  }

  const {
    carrier = 'figurine',
    target_polycount = 100000,
    timeoutMs = 30000
  } = options;
  const { response, data } = await fetchJsonWithTimeout(`${API_BASE_URL}/generate-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: imageUrl,
      carrier,
      ai_model: 'latest',
      model_type: 'standard',
      should_texture: true,
      enable_pbr: true,
      should_remesh: true,
      target_polycount
    })
  }, timeoutMs);

  if (!response.ok || !data?.success || !data?.task?.id) {
    throw createApiError(data, '无法创建真实 3D 生成任务');
  }

  return data.task;
}

export async function get3DGenerationTask(taskId, options = {}) {
  if (!taskId) {
    throw new Error('缺少 3D 任务编号');
  }

  const { timeoutMs = 30000 } = options;
  const { response, data } = await fetchJsonWithTimeout(
    `${API_BASE_URL}/generate-3d/${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    timeoutMs
  );

  if (!response.ok || !data?.success || !data?.task) {
    throw createApiError(data, '无法查询真实 3D 生成进度');
  }

  return data.task;
}

export async function editImage(imageBase64, prompt, options = {}) {
  try {
    const { aspect_ratio = '1:1', mime_type = 'image/png' } = options;

    const { response, data } = await fetchJsonWithTimeout(`${API_BASE_URL}/edit-image`, {
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
    console.warn('Image editing failed:', error);
    throw new Error(error.name === 'AbortError' ? 'AI 编辑超时，请稍后重试' : error.message || '编辑图片失败');
  }
}

export async function getStyles() {
  try {
    const response = await fetch(`${API_BASE_URL}/styles`);
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
  const response = await fetch(`${API_BASE_URL}/creations`, {
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
  try {
    const response = await fetch(`${API_BASE_URL}/creations?limit=${encodeURIComponent(limit)}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      return [];
    }

    return data.data || [];
  } catch (error) {
    console.warn('Failed to list creations:', error);
    return [];
  }
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
    magnet: { name: '冰箱贴', description: '带独立浮雕正面和磁性背板的非遗主题冰箱贴' },
    figurine: { name: '3D手办', description: '由参考图生成、可旋转和下载的真实三维手办' }
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
