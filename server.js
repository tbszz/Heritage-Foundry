require('dotenv').config();

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');

const generateRoutes = require('./routes/generate');
const creationRoutes = require('./routes/creations');
const errorHandler = require('./middleware/errorHandler');
const createRateLimiter = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS：设置 ALLOWED_ORIGINS（逗号分隔）即收敛为白名单，未设置保持开发期全开
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 生图/改图接口限流（默认每 IP 每分钟 10 次，可用环境变量覆盖）
const generateLimiter = createRateLimiter({
  windowMs: Number(process.env.GENERATE_RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.GENERATE_RATE_MAX) || 10,
  message: 'AI 生成请求过于频繁，请稍后再试'
});
app.use('/api/generate-image', generateLimiter);
app.use('/api/edit-image', generateLimiter);

app.use('/api', generateRoutes);
app.use('/api/creations', creationRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 生产部署形态（报告 GAP 03）：构建产物存在时由 Express 直接托管，
// 一个进程同时提供页面与 API，演示链接开箱即用
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
  console.log(`Serving frontend from ${DIST_DIR}`);
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
