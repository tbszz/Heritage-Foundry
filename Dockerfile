# 构建阶段：安装全部依赖并构建前端产物
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 运行阶段：只带生产依赖 + 构建产物，单进程提供页面与 API
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY middleware ./middleware
# promptService 依赖唯一数据源 src/data/crafts.json
COPY src/data ./src/data
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server.js"]
