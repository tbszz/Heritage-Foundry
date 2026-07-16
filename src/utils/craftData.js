// 唯一数据源是 src/data/crafts.json（前端 Vite 与后端 Node 均可直接读取）。
// 本模块只做派生与查询，请勿在这里再写死任何技艺数据。
import craftsJson from '../data/crafts.json';

export const CRAFTS_DATA = craftsJson;

export function getCraftById(id) {
  return CRAFTS_DATA.find(craft => craft.id === id);
}

export function getCraftCategories() {
  const categories = new Set(CRAFTS_DATA.map(craft => craft.category));
  return Array.from(categories);
}

export function getCraftsByCategory(category) {
  return CRAFTS_DATA.filter(craft => craft.category === category);
}

// 造物工作台（generator 页）直接支持的技艺：generatorId 指向自身的条目
export function getGeneratorCrafts() {
  return CRAFTS_DATA.filter(craft => craft.generatorId === craft.id);
}

// 任意技艺 id → 工作台可用的技艺 id（不支持的技艺回退到剪纸）
export function getGeneratorCraftId(craftId) {
  const craft = getCraftById(craftId);
  return craft?.generatorId || 'papercut';
}
