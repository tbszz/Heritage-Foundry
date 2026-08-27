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

// 造物工作台（generator 页）支持的技艺：crafts.json 中带提示词语料（promptLanguage）的条目。
// 目前 18 项技艺全部有语料，即全部直接支持，首页与 generator 页共用同一份 id，不再做借道映射。
export function getGeneratorCrafts() {
  return CRAFTS_DATA.filter((craft) => Boolean(craft.promptLanguage));
}

// 任意技艺 id → 工作台可用的技艺 id（无语料或未知 id 统一回退到剪纸）
export function getGeneratorCraftId(craftId) {
  const craft = getCraftById(craftId);
  return craft?.promptLanguage ? craft.id : 'papercut';
}
