const { createClient } = require('@supabase/supabase-js');

const NOT_CONFIGURED_ERROR = {
  code: 'SUPABASE_NOT_CONFIGURED',
  message: 'Supabase 未配置，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY'
};

let cachedClient = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
}

function isEnabled() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

function getClient() {
  if (!isEnabled()) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(getSupabaseUrl(), getSupabaseKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return cachedClient;
}

function disabledResult() {
  return {
    data: null,
    error: NOT_CONFIGURED_ERROR
  };
}

function normalizeCreation(payload = {}) {
  return {
    title: payload.title || '未命名非遗文创方案',
    craft_id: payload.craftId || payload.craft_id || null,
    craft_name: payload.craftName || payload.craft_name || null,
    ip_id: payload.ipId || payload.ip_id || null,
    ip_name: payload.ipName || payload.ip_name || null,
    carrier_id: payload.carrierId || payload.carrier_id || null,
    carrier_name: payload.carrierName || payload.carrier_name || null,
    style_id: payload.styleId || payload.style_id || null,
    style_name: payload.styleName || payload.style_name || null,
    prompt: payload.prompt || null,
    image_url: payload.imageUrl || payload.image_url || null,
    pattern: payload.pattern || null,
    materials: payload.materials || null,
    stats: payload.stats || null,
    story: payload.story || null,
    is_public: payload.isPublic ?? payload.is_public ?? true
  };
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'heritage-creations';

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

// 把 base64 图片上传到 Storage 桶，成功返回公开 URL，失败返回 null
// （报告 4.3 P4：base64 直接写 image_url 文本列会让作品列表越来越慢）
async function uploadImageToStorage(client, dataUrl) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    return null;
  }

  const extension = (parsed.mimeType.split('/')[1] || 'png')
    .replace('jpeg', 'jpg')
    .replace(/[^a-z0-9]/gi, '');
  const filePath = `creations/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: false
    });

  if (error) {
    console.warn('Supabase Storage 上传失败，回退 base64 入库:', error.message || error);
    return null;
  }

  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

async function saveCreation(payload) {
  const client = getClient();
  if (!client) {
    return disabledResult();
  }

  const record = normalizeCreation(payload);
  if (typeof record.image_url === 'string' && record.image_url.startsWith('data:')) {
    const publicUrl = await uploadImageToStorage(client, record.image_url);
    if (publicUrl) {
      record.image_url = publicUrl;
    }
  }

  const { data, error } = await client
    .from('heritage_creations')
    .insert(record)
    .select()
    .single();

  return { data, error };
}

async function listCreations(options = {}) {
  const client = getClient();
  if (!client) {
    return disabledResult();
  }

  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 50);
  let query = client
    .from('heritage_creations')
    .select('*')
    .eq('is_public', true);

  if (options.sort === 'likes') {
    query = query
      .order('likes', { ascending: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(limit);

  return { data, error };
}

// F1 统计面板：共创作品总数、带图作品数、按技艺分布
// Supabase 未配置时返回全零数据而非报错，保证前端降级可用
async function getCreationStats() {
  const client = getClient();
  if (!client) {
    return {
      data: { totalCreations: 0, totalWithImage: 0, craftDistribution: {} },
      error: null
    };
  }

  const { count: totalCreations, error: totalError } = await client
    .from('heritage_creations')
    .select('id', { count: 'exact', head: true })
    .eq('is_public', true);
  if (totalError) {
    return { data: null, error: totalError };
  }

  const { count: totalWithImage, error: imageError } = await client
    .from('heritage_creations')
    .select('id', { count: 'exact', head: true })
    .eq('is_public', true)
    .not('image_url', 'is', null);
  if (imageError) {
    return { data: null, error: imageError };
  }

  const { data: rows, error: distributionError } = await client
    .from('heritage_creations')
    .select('craft_name')
    .eq('is_public', true);
  if (distributionError) {
    return { data: null, error: distributionError };
  }

  const craftDistribution = {};
  (rows || []).forEach((row) => {
    const key = row.craft_name || '未分类';
    craftDistribution[key] = (craftDistribution[key] || 0) + 1;
  });

  return {
    data: {
      totalCreations: totalCreations ?? 0,
      totalWithImage: totalWithImage ?? 0,
      craftDistribution
    },
    error: null
  };
}

// F3 点赞：creation_likes 表防重复，成功后累加 heritage_creations.likes
async function likeCreation(creationId, visitorId) {
  const client = getClient();
  if (!client) {
    return disabledResult();
  }

  if (!creationId || !visitorId) {
    return {
      data: null,
      error: { code: 'INVALID_INPUT', message: '缺少 creationId 或 visitorId' }
    };
  }

  const { data: existing, error: lookupError } = await client
    .from('creation_likes')
    .select('id')
    .eq('creation_id', creationId)
    .eq('visitor_id', visitorId)
    .maybeSingle();
  if (lookupError) {
    return { data: null, error: lookupError };
  }
  if (existing) {
    return { data: { liked: false, alreadyLiked: true, message: '已点赞过' }, error: null };
  }

  const { error: insertError } = await client
    .from('creation_likes')
    .insert({ creation_id: creationId, visitor_id: visitorId });
  if (insertError) {
    // 并发下唯一约束兜底，视为已点赞
    if (insertError.code === '23505') {
      return { data: { liked: false, alreadyLiked: true, message: '已点赞过' }, error: null };
    }
    return { data: null, error: insertError };
  }

  const { data: current, error: readError } = await client
    .from('heritage_creations')
    .select('likes')
    .eq('id', creationId)
    .single();
  if (readError) {
    return { data: null, error: readError };
  }

  const likes = (current?.likes ?? 0) + 1;
  const { error: updateError } = await client
    .from('heritage_creations')
    .update({ likes })
    .eq('id', creationId);
  if (updateError) {
    return { data: null, error: updateError };
  }

  return { data: { liked: true, likes }, error: null };
}

async function getCreation(id) {
  const client = getClient();
  if (!client) {
    return disabledResult();
  }

  const { data, error } = await client
    .from('heritage_creations')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

module.exports = {
  isEnabled,
  getClient,
  saveCreation,
  listCreations,
  getCreation,
  getCreationStats,
  likeCreation,
  normalizeCreation,
  parseImageDataUrl,
  uploadImageToStorage
};
