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

async function saveCreation(payload) {
  const client = getClient();
  if (!client) {
    return disabledResult();
  }

  const { data, error } = await client
    .from('heritage_creations')
    .insert(normalizeCreation(payload))
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
  const { data, error } = await client
    .from('heritage_creations')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
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
  saveCreation,
  listCreations,
  getCreation,
  normalizeCreation
};
