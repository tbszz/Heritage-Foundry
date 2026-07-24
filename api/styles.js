module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      code: 405
    });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  res.json({
    success: true,
    styles: [
      { id: 'default', name: '默认', description: '标准生成风格' },
      { id: 'poster', name: '非遗海报', description: '适合海报设计' },
      { id: 'product', name: '文创产品', description: '适合产品展示' },
      { id: 'chinese', name: '国潮风格', description: '中国风设计' },
      { id: 'cute', name: '可爱校园', description: '可爱卡通风格' },
      { id: 'vintage', name: '复古市集', description: '怀旧文艺风格' }
    ]
  });
};
