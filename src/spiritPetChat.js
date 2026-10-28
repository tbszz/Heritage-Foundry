// 灵宠对话层：气泡跟着小布头顶走，底部提问栏发问；回答来自讲解员接口的灵宠口吻（persona=pet）。
// 场景只负责报告小布在屏幕上的位置，这里负责对话状态与上下文（所在展厅、刚看过的藏品）。
import { askDocent } from './utils/apiService.js';

const GREETING = '嗷呜！我是小布，布老虎化身的灵宠。逛到哪儿想知道什么，点我或在下面问我就好～';
const CLICK_HINT = '想问什么？点下面的问题，或者直接打字问我～';
const MAX_HISTORY = 6;
const GREETING_MS = 9000;

export function getPetSuggestions({ hall, craft } = {}) {
  const suggestions = [];
  if (craft?.name) suggestions.push(`讲讲${craft.name}`);
  if (hall) {
    suggestions.push(`「${hall}」展厅讲什么？`, '这里哪件最适合做文创？');
  } else {
    suggestions.push('这座馆里有什么？', '布老虎有什么寓意？');
  }
  return suggestions.slice(0, 3);
}

export function getPetErrorText(error) {
  if (error?.code === 'GEMINI_NOT_CONFIGURED' || error?.code === 503) {
    return '小布今天嗓子哑了（讲解服务未配置），先自己逛逛吧～';
  }
  if (error?.code === 429 || /频繁|稍后/.test(error?.message || '')) {
    return '问得太快啦，小布喘口气，稍后再问～';
  }
  return '小布没听清，网络好像打了个盹，再问一次试试？';
}

export function createSpiritPetChat({ stage, getScene }) {
  const bubble = stage.querySelector('#spirit-pet-bubble');
  const bubbleCard = bubble?.querySelector('.spirit-pet-bubble-card');
  const bubbleText = stage.querySelector('#spirit-pet-text');
  const bubbleSources = stage.querySelector('#spirit-pet-sources');
  const dock = stage.querySelector('#spirit-pet-dock');
  const input = stage.querySelector('#spirit-pet-input');
  const chips = stage.querySelector('#spirit-pet-chips');
  const submit = dock?.querySelector('button[type="submit"]');
  if (!bubble || !dock || !input) return null;

  const history = [];
  const context = { hall: '', craft: null };
  let hideTimer = null;
  let talkTimer = null;
  let pending = false;
  let greeted = false;
  let cardSize = { width: 0, height: 0 };

  function showBubble(text, { sources = [], thinking = false, autoHideMs = 0 } = {}) {
    window.clearTimeout(hideTimer);
    bubbleText.textContent = text;
    bubble.classList.toggle('is-thinking', thinking);
    bubbleSources.replaceChildren(...sources.slice(0, 3).map((source) => {
      const tag = document.createElement('span');
      tag.textContent = `典藏 · ${source.name}`;
      return tag;
    }));
    bubbleSources.hidden = !sources.length;
    bubble.hidden = false;
    // 气泡尺寸只在内容变化时量一次，逐帧定位不再触发布局
    cardSize = { width: bubbleCard.offsetWidth, height: bubbleCard.offsetHeight };
    if (autoHideMs) hideTimer = window.setTimeout(hideBubble, autoHideMs);
  }

  function hideBubble() {
    window.clearTimeout(hideTimer);
    bubble.hidden = true;
  }

  function talkFor(text) {
    const scene = getScene();
    window.clearTimeout(talkTimer);
    scene?.petCheer();
    scene?.setPetTalking(true);
    const duration = Math.min(7000, Math.max(2500, text.length * 120));
    talkTimer = window.setTimeout(() => getScene()?.setPetTalking(false), duration);
  }

  function renderChips() {
    chips.replaceChildren(...getPetSuggestions(context).map((question) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = question;
      chip.addEventListener('click', () => ask(question));
      return chip;
    }));
  }

  async function ask(rawQuestion) {
    const question = String(rawQuestion || '').trim().slice(0, 200);
    if (!question || pending) return;
    pending = true;
    submit.disabled = true;
    input.value = '';
    showBubble('小布翻翻资料…', { thinking: true });
    getScene()?.setPetTalking(false);
    try {
      const { answer, sources } = await askDocent(question, {
        craftId: context.craft?.id,
        hall: context.hall ? `${context.hall}展厅` : '百工长廊',
        persona: 'pet',
        history: history.slice()
      });
      history.push({ role: 'user', text: question }, { role: 'docent', text: answer.slice(0, 300) });
      while (history.length > MAX_HISTORY) history.shift();
      showBubble(answer, { sources });
      talkFor(answer);
    } catch (error) {
      console.warn('Spirit pet docent failed:', error);
      showBubble(getPetErrorText(error), { autoHideMs: 8000 });
    } finally {
      pending = false;
      submit.disabled = false;
    }
  }

  dock.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  // 提问栏里的按键不能漏给长廊（方向键 / 数字键 / Escape 都有场景含义）
  dock.addEventListener('keydown', (event) => event.stopPropagation());
  bubble.querySelector('[data-action="close-pet-bubble"]')?.addEventListener('click', hideBubble);
  renderChips();

  return {
    onPetReady() {
      dock.hidden = false;
      if (greeted) return;
      greeted = true;
      // 等小布化光现身后再打招呼
      window.setTimeout(() => {
        showBubble(GREETING, { autoHideMs: GREETING_MS });
        talkFor(GREETING);
      }, 900);
    },
    onPetClick() {
      if (bubble.hidden) showBubble(CLICK_HINT, { autoHideMs: 6000 });
      getScene()?.petCheer();
      input.focus({ preventScroll: true });
    },
    onPetFrame({ visible, x, y }) {
      bubble.classList.toggle('is-offscreen', !visible);
      if (!visible || bubble.hidden) return;
      // 贴边时把气泡收回屏内（16px 边距），顶部给导航留出空间
      const half = cardSize.width / 2;
      const left = Math.min(Math.max(x, half + 16), stage.clientWidth - half - 16);
      const top = Math.max(y, cardSize.height + 88);
      bubble.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    },
    setContext(next) {
      Object.assign(context, next);
      renderChips();
    }
  };
}
