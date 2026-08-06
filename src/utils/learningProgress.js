/**
 * 学习进度追踪 + 徽章成就系统
 * 基于 localStorage 持久化，追踪用户对每种非遗的学习进度
 *
 * 学习等级：
 *   - 探索者 (Explorer)  : 浏览过该非遗
 *   - 学徒 (Apprentice)  : 通过知识测验
 *   - 匠人 (Artisan)     : 通过测验 + 生成过作品
 *   - 大师 (Master)      : 满分通过测验 + 生成 >= 3 件作品
 */

const STORAGE_KEY = 'heritage-foundry-learning';

// ─── 数据结构 ───

const DEFAULT_PROGRESS = {
  version: 1,
  crafts: {},           // { craftId: { visited, quizPassed, quizScore, quizDate, creationsCount, lastCreated } }
  totalQuizTaken: 0,
  totalQuizPassed: 0,
  totalCreations: 0,
  lastActive: null
};

// ─── 内部函数 ───

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, crafts: {} };
    const data = JSON.parse(raw);
    // 迁移旧版本
    if (!data.crafts) data.crafts = {};
    if (!data.totalQuizTaken) data.totalQuizTaken = 0;
    if (!data.totalQuizPassed) data.totalQuizPassed = 0;
    if (!data.totalCreations) data.totalCreations = 0;
    return data;
  } catch {
    return { ...DEFAULT_PROGRESS, crafts: {} };
  }
}

function saveProgress(data) {
  try {
    data.lastActive = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 满时静默失败
  }
}

function ensureCraftEntry(data, craftId) {
  if (!data.crafts[craftId]) {
    data.crafts[craftId] = {
      visited: false,
      quizPassed: false,
      quizScore: 0,
      quizDate: null,
      creationsCount: 0,
      lastCreated: null
    };
  }
}

// ─── 徽章计算 ───

const BADGES = {
  explorer:     { emoji: '🔍', name: '探索者', desc: '浏览过该项非遗', threshold: (c) => c.visited },
  apprentice:   { emoji: '📖', name: '学徒',   desc: '通过知识测验', threshold: (c) => c.quizPassed },
  artisan:      { emoji: '🛠️', name: '匠人',   desc: '通过测验并创作作品', threshold: (c) => c.quizPassed && c.creationsCount >= 1 },
  master:       { emoji: '👑', name: '大师',   desc: '满分通过测验并创作≥3件', threshold: (c) => c.quizScore >= 100 && c.creationsCount >= 3 },
  collector:    { emoji: '🏆', name: '收藏家', desc: '学习了10种以上非遗', threshold: (_, all) => all >= 10 },
  scholar:      { emoji: '🎓', name: '非遗学者', desc: '全部通过测验', threshold: (_, all) => all >= 18 },
  creator:      { emoji: '✨', name: '创作者', desc: '累计创作10件作品', threshold: (_, __, total) => total >= 10 }
};

function getBadgeLevel(craftEntry) {
  if (!craftEntry) return null;
  if (craftEntry.quizScore >= 100 && craftEntry.creationsCount >= 3) return 'master';
  if (craftEntry.quizPassed && craftEntry.creationsCount >= 1) return 'artisan';
  if (craftEntry.quizPassed) return 'apprentice';
  if (craftEntry.visited) return 'explorer';
  return null;
}

// ─── 公开 API ───

/** 记录浏览事件 */
export function recordVisit(craftId) {
  const data = loadProgress();
  ensureCraftEntry(data, craftId);
  data.crafts[craftId].visited = true;
  saveProgress(data);
}

/** 记录测验通过 */
export function recordQuizResult(craftId, score, passed) {
  const data = loadProgress();
  ensureCraftEntry(data, craftId);
  data.totalQuizTaken += 1;
  if (passed) {
    data.crafts[craftId].quizPassed = true;
    data.totalQuizPassed += 1;
  }
  data.crafts[craftId].quizScore = Math.max(data.crafts[craftId].quizScore, score);
  data.crafts[craftId].quizDate = new Date().toISOString();
  saveProgress(data);
}

/** 记录创作事件 */
export function recordCreation(craftId) {
  const data = loadProgress();
  ensureCraftEntry(data, craftId);
  data.crafts[craftId].creationsCount += 1;
  data.crafts[craftId].lastCreated = new Date().toISOString();
  data.totalCreations += 1;
  saveProgress(data);
}

/** 获取某非遗的学习进度 */
export function getCraftProgress(craftId) {
  const data = loadProgress();
  const entry = data.crafts[craftId];
  if (!entry) return { visited: false, quizPassed: false, level: null, badge: null };
  const level = getBadgeLevel(entry);
  return {
    ...entry,
    level,
    badge: level ? BADGES[level] : null
  };
}

/** 获取全局学习统计 */
export function getGlobalStats() {
  const data = loadProgress();
  const craftIds = Object.keys(data.crafts);
  const visitedCount = craftIds.filter(id => data.crafts[id].visited).length;
  const passedCount = craftIds.filter(id => data.crafts[id].quizPassed).length;
  const masterCount = craftIds.filter(id => data.crafts[id].quizScore >= 100 && data.crafts[id].creationsCount >= 3).length;

  // 全局徽章
  const globalBadges = [];
  if (visitedCount >= 10) globalBadges.push(BADGES.collector);
  if (passedCount >= 18) globalBadges.push(BADGES.scholar);
  if (data.totalCreations >= 10) globalBadges.push(BADGES.creator);

  return {
    totalCrafts: craftIds.length,
    visitedCount,
    passedCount,
    masterCount,
    totalQuizTaken: data.totalQuizTaken,
    totalQuizPassed: data.totalQuizPassed,
    totalCreations: data.totalCreations,
    globalBadges,
    lastActive: data.lastActive
  };
}

/** 获取所有非遗的学习进度列表 */
export function getAllProgress() {
  const data = loadProgress();
  return Object.entries(data.crafts).map(([id, entry]) => ({
    craftId: id,
    level: getBadgeLevel(entry),
    ...entry
  }));
}

/** 获取学习进度百分比 */
export function getLearningProgressPercent() {
  const stats = getGlobalStats();
  return Math.round((stats.passedCount / 18) * 100);
}

/** 获取所有徽章定义 */
export function getAllBadges() {
  return BADGES;
}

/** 重置学习进度 */
export function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默
  }
}