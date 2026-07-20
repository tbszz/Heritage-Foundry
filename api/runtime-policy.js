function getServerless3DPolicy({
  provider = process.env.THREE_D_PROVIDER || 'meshy',
  isVercel = Boolean(process.env.VERCEL)
} = {}) {
  const normalizedProvider = String(provider).trim().toLowerCase() || 'meshy';
  if (isVercel && normalizedProvider === 'local') {
    return {
      allowed: false,
      provider: 'local',
      statusCode: 503,
      code: 'LOCAL_3D_UNAVAILABLE_ON_VERCEL',
      message: '本地 TripoSR 在 Vercel 环境中不可用，请将 THREE_D_PROVIDER 设置为 meshy'
    };
  }

  return { allowed: true, provider: normalizedProvider };
}

module.exports = { getServerless3DPolicy };
