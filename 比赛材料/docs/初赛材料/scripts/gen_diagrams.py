#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「遗见 Heritage Foundry」文档配图：技术架构图 + 体验链路图"""
import html
import pathlib

OUT = pathlib.Path("/Users/mychanging/Desktop/华为黑客松/docs/初赛材料/figures")
OUT.mkdir(parents=True, exist_ok=True)

FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif"

# 国潮配色（取自项目 crafts.json / patternGenerator.js 真实主题色）
INK = "#10131a"        # 深墨
SUB = "#6b6558"        # 次级文字
BG = "#f7f2e7"         # 瓷白底
CINNABAR = "#c0392b"   # 朱砂红
PEACOCK = "#1f7a6d"    # 孔雀绿
GOLD = "#b8860b"       # 鎏金黄
INDIGO = "#2f5f9f"     # 靛青蓝
PLUM = "#8854b3"       # 紫


def esc(s):
    return html.escape(s, quote=False)


def text(x, y, s, size=13, fill=INK, weight="400", anchor="middle", ls="0"):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" letter-spacing="{ls}">{esc(s)}</text>')


def rect(x, y, w, h, fill="#ffffff", stroke=None, sw=1.4, rx=10, extra=""):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}{extra}/>'


def badge(x, y, w, h, label, color):
    """层级标签：实心圆角标签 + 白字"""
    return (rect(x, y, w, h, fill=color, rx=h / 2) +
            text(x + w / 2, y + h / 2 + 5, label, size=14, fill="#ffffff", weight="700", ls="0.5"))


def chip(x, y, w, h, title, desc_lines, color, title_size=14, desc_size=11.5):
    """内部功能块：淡色底 + 同色描边 + 标题 + 多行说明"""
    tint = color + "14"  # 8 位 hex alpha
    out = [rect(x, y, w, h, fill=tint, stroke=color, sw=1.1, rx=8)]
    cx = x + w / 2
    if desc_lines:
        ty = y + 26
    else:
        ty = y + h / 2 + 5
    out.append(text(cx, ty, title, size=title_size, fill=INK, weight="600"))
    for i, line in enumerate(desc_lines):
        out.append(text(cx, ty + 20 + i * 17, line, size=desc_size, fill=SUB))
    return "".join(out)


def arrow_down(x, y1, y2, color="#9a917e", label=None, label_side="right"):
    out = [f'<path d="M {x} {y1} L {x} {y2}" stroke="{color}" stroke-width="2" '
           f'fill="none" marker-end="url(#arrow)"/>']
    if label:
        lx = x + 12 if label_side == "right" else x - 12
        anc = "start" if label_side == "right" else "end"
        out.append(text(lx, (y1 + y2) / 2 + 4, label, size=11.5, fill=SUB, anchor=anc))
    return "".join(out)


# ══════════════════════════════════════════════════════════════════
# 图一：技术架构图（七层）
# ══════════════════════════════════════════════════════════════════
W, H = 1080, 1032
L, R = 44, 1036          # 外框左右
IL, IR = 62, 1018        # 内容左右
IW = IR - IL             # 956

s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
     f'viewBox="0 0 {W} {H}" font-family="{FONT}">']
s.append(f'''<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#9a917e"/>
  </marker>
  <marker id="arrowGold" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{GOLD}"/>
  </marker>
  <filter id="sh" x="-4%" y="-4%" width="108%" height="112%">
    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.07"/>
  </filter>
</defs>''')
s.append(rect(0, 0, W, H, fill=BG, rx=0))

# 标题
s.append(text(W / 2, 48, "「遗见 · Heritage Foundry」技术架构", size=27, weight="700", ls="1"))
s.append(text(W / 2, 76, "AR 非遗数字博物馆 × AI 文创共创平台 ｜ 鸿蒙赛道 · 用户体验创新方向",
              size=13.5, fill=SUB))
s.append(f'<path d="M {W/2-190} 90 L {W/2+190} 90" stroke="{GOLD}" stroke-width="1.6" opacity="0.55"/>')

y = 112

# ── ① 应用壳层 ────────────────────────────────────────────────
h1 = 122
s.append(rect(L, y, R - L, h1, stroke=CINNABAR, sw=1.6, extra=' filter="url(#sh)"'))
s.append(badge(IL, y + 14, 224, 26, "① 应用壳层 · HarmonyOS", CINNABAR))
s.append(text(IR, y + 32, "一次开发多端部署 → 手机 / 平板 / 智慧屏", size=12, fill=CINNABAR,
              weight="600", anchor="end"))
cw = (IW - 2 * 16) / 3
for i, (t, d) in enumerate([
        ("ArkTS 原生壳", ["首页 · AR 入口 · 流转控制"]),
        ("ArkWeb 容器", ["复用 Web 实现的技艺浏览与工作台"]),
        ("Stage 模型 · 元服务卡片", ["「今日文物」桌面卡片 · 小艺语音唤起"])]):
    s.append(chip(IL + i * (cw + 16), y + 50, cw, 56, t, d, CINNABAR))
y += h1

s.append(arrow_down(W / 2, y + 4, y + 30))
y += 34

# ── ② 体验渲染层 ──────────────────────────────────────────────
h2 = 122
s.append(rect(L, y, R - L, h2, stroke=GOLD, sw=1.6, extra=' filter="url(#sh)"'))
s.append(badge(IL, y + 14, 180, 26, "② 体验渲染层", GOLD))
s.append(text(IR, y + 32, "高端精致视觉 + 自然高效交互", size=12, fill=GOLD, weight="600", anchor="end"))
for i, (t, d) in enumerate([
        ("Three.js 第一人称 3D 博物馆", ["18 展台漫游 · 靠近即交互"]),
        ("model-viewer / WebXR AR", ["真实尺度放置 · 解码器自托管"]),
        ("拼豆图纸引擎", ["18×12 网格 · 图纸与物料导出"])]):
    s.append(chip(IL + i * (cw + 16), y + 50, cw, 56, t, d, GOLD))
y += h2

s.append(arrow_down(W / 2, y + 4, y + 30, label="/api  ·  HTTPS"))
y += 34

# ── ③ 服务编排层 ──────────────────────────────────────────────
h3 = 122
s.append(rect(L, y, R - L, h3, stroke=PEACOCK, sw=1.6, extra=' filter="url(#sh)"'))
s.append(badge(IL, y + 14, 210, 26, "③ 服务编排层 · Express 5", PEACOCK))
s.append(text(IR, y + 32, "密钥全部驻留服务端 · 前端零暴露", size=12, fill=PEACOCK,
              weight="600", anchor="end"))
for i, (t, d) in enumerate([
        ("导演式 Prompt 服务", ["五重文化约束编译 · 7200 组合"]),
        ("滑动窗口限流 · 参数校验", ["公开部署不被刷爆"]),
        ("统一错误处理 · CORS 白名单", ["降级可用 · 缺 Key 不白屏"])]):
    s.append(chip(IL + i * (cw + 16), y + 50, cw, 56, t, d, PEACOCK))
y += h3

# 三路分叉箭头
fork_y = y + 4
col_w = (IW - 2 * 20) / 3
col_x = [IL + i * (col_w + 20) for i in range(3)]
col_cx = [x + col_w / 2 for x in col_x]
s.append(f'<path d="M {W/2} {fork_y} L {W/2} {fork_y+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
s.append(f'<path d="M {col_cx[0]} {fork_y+16} L {col_cx[2]} {fork_y+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
for cx in col_cx:
    s.append(f'<path d="M {cx} {fork_y+16} L {cx} {fork_y+38}" stroke="#9a917e" stroke-width="2" fill="none" marker-end="url(#arrow)"/>')
y = fork_y + 44

# ── ④⑤⑥ 三列 ────────────────────────────────────────────────
h4 = 178
cols = [
    (INDIGO, "④ AI 生成层", [
        ("Gemini 图像生成与二次编辑", []),
        ("模块可替换", ["可切换华为云盘古等国产多模态模型", "上层体验代码零改动"])]),
    (PLUM, "⑤ 空间资产层", [
        ("Draco + WebP 压缩管线", []),
        ("18 件展品级 GLB", ["420 MB → 14 MB（−96.7%）", "解码器自托管 · 离线可演示"])]),
    (PEACOCK, "⑥ 数据与作品层", [
        ("Supabase 作品库 + Storage", []),
        ("crafts.json 唯一数据源", ["18 项技艺前后端共享", "公共画廊沉淀作品"])]),
]
for i, (color, title, blocks) in enumerate(cols):
    x = col_x[i]
    s.append(rect(x, y, col_w, h4, stroke=color, sw=1.6, extra=' filter="url(#sh)"'))
    s.append(badge(x + 16, y + 14, col_w - 32, 26, title, color))
    by = y + 52
    for bt, bd in blocks:
        bh = 34 if not bd else 34 + 17 * len(bd) + 6
        s.append(chip(x + 16, by, col_w - 32, bh, bt, bd, color, title_size=12.5, desc_size=11))
        by += bh + 10
y += h4

# 三路汇合箭头（fork 的镜像）
mg = y + 4
s.append(f'<path d="M {col_cx[0]} {mg} L {col_cx[0]} {mg+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
s.append(f'<path d="M {col_cx[2]} {mg} L {col_cx[2]} {mg+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
s.append(f'<path d="M {col_cx[1]} {mg} L {col_cx[1]} {mg+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
s.append(f'<path d="M {col_cx[0]} {mg+16} L {col_cx[2]} {mg+16}" stroke="#9a917e" stroke-width="2" fill="none"/>')
s.append(f'<path d="M {W/2} {mg+16} L {W/2} {mg+38}" stroke="#9a917e" stroke-width="2" fill="none" marker-end="url(#arrow)"/>')
y = mg + 44

# ── ⑦ 分布式协同层 ────────────────────────────────────────────
h7 = 146
s.append(rect(L, y, R - L, h7, stroke=CINNABAR, sw=2.2, extra=' filter="url(#sh)"'))
s.append(badge(IL, y + 14, 268, 26, "⑦ 分布式协同层 · HarmonyOS 软总线", CINNABAR))
s.append(text(IR, y + 32, "★ 只有鸿蒙能做到无缝的一层", size=12.5, fill=CINNABAR,
              weight="700", anchor="end"))
relay = [("手机 · 见", "AR 真实尺度放置"), ("平板 · 创", "精修文创设计"), ("智慧屏 · 传", "全家共赏成品")]
rw = 236
gap = (IW - 3 * rw) / 2
for i, (t, d) in enumerate(relay):
    x = IL + i * (rw + gap)
    s.append(chip(x, y + 52, rw, 52, t, [d], CINNABAR, title_size=13, desc_size=11))
    if i < 2:
        ax = x + rw + 6
        s.append(f'<path d="M {ax} {y+78} L {ax+gap-12} {y+78}" stroke="{CINNABAR}" '
                 f'stroke-width="2" fill="none" marker-end="url(#arrowGold)" opacity="0.85"/>')
# 底部说明：居中独立一行，与卡片留出安全间距
s.append(rect(W / 2 - 232, y + 114, 464, 22, fill=CINNABAR + "12", stroke=CINNABAR, sw=0.9, rx=11))
s.append(text(W / 2, y + 129, "分布式数据对象：创作状态跨设备无缝接续", size=11.5,
              fill=CINNABAR, weight="600", anchor="middle"))
y += h7

# 页脚
s.append(text(W / 2, H - 22,
              "全部技术数据可在 github.com/tbszz/Heritage-Foundry 复现　｜　33 项自动化测试 · CI 全绿 · MIT 开源",
              size=11.5, fill=SUB))
s.append("</svg>")

(OUT / "架构图.svg").write_text("".join(s), encoding="utf-8")
print("✅ 架构图.svg", H, "px 高")


# ══════════════════════════════════════════════════════════════════
# 图二：五幕体验链路图
# ══════════════════════════════════════════════════════════════════
W2, H2 = 1080, 380
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W2}" height="{H2}" '
     f'viewBox="0 0 {W2} {H2}" font-family="{FONT}">']
s.append(f'''<defs>
  <marker id="arrow2" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{GOLD}"/>
  </marker>
  <marker id="arrowBack" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{PEACOCK}"/>
  </marker>
  <filter id="sh2" x="-6%" y="-6%" width="112%" height="116%">
    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.08"/>
  </filter>
</defs>''')
s.append(rect(0, 0, W2, H2, fill=BG, rx=0))
s.append(text(W2 / 2, 44, "完整体验链路：见 → 懂 → 创 → 作 → 传", size=25, weight="700", ls="1.5"))
s.append(text(W2 / 2, 70, "市面上的非遗类应用绝大多数只做到了第一格，我们做完了五格，并且让它闭环",
              size=13, fill=SUB))

stages = [
    ("见", "3D 博物馆 · AR 落地", "文物以真实尺寸\n落在你家茶几上", "真实尺度", CINNABAR),
    ("懂", "故事卡点读", "从哪来 · 谁还在做\n为什么快失传", "情感共鸣", GOLD),
    ("创", "AI 共创设计", "18 技艺 × 10 IP × 5 载体\n× 8 风格 = 7200 种组合", "文化约束", PEACOCK),
    ("作", "实体图纸 + 物料", "Oklab 匹配 75 个\n市售拼豆色号", "可制造性", INDIGO),
    ("传", "跨设备多屏共赏", "手机 → 平板 → 智慧屏\n分布式软总线", "鸿蒙原生", PLUM),
]
n = len(stages)
bw, bh = 178, 156
gap2 = (W2 - 2 * 44 - n * bw) / (n - 1)
top = 100
for i, (key, title, desc, tag, color) in enumerate(stages):
    x = 44 + i * (bw + gap2)
    s.append(rect(x, top, bw, bh, fill="#ffffff", stroke=color, sw=1.8, rx=12,
                  extra=' filter="url(#sh2)"'))
    # 顶部色带
    s.append(f'<path d="M {x+12} {top} L {x+bw-12} {top}" stroke="{color}" stroke-width="5" '
             f'stroke-linecap="round"/>')
    # 大字幕号
    s.append(f'<circle cx="{x+bw/2}" cy="{top+40}" r="21" fill="{color}"/>')
    s.append(text(x + bw / 2, top + 48, key, size=22, fill="#ffffff", weight="700"))
    s.append(text(x + bw / 2, top + 84, title, size=13.5, weight="600"))
    for j, line in enumerate(desc.split("\n")):
        s.append(text(x + bw / 2, top + 104 + j * 16, line, size=11, fill=SUB))
    # 底部标签
    s.append(rect(x + bw / 2 - 40, top + bh - 27, 80, 20, fill=color + "1f",
                  stroke=color, sw=0.9, rx=10))
    s.append(text(x + bw / 2, top + bh - 13, tag, size=11, fill=color, weight="600"))
    if i < n - 1:
        ax = x + bw + 5
        s.append(f'<path d="M {ax} {top+bh/2} L {ax+gap2-11} {top+bh/2}" stroke="{GOLD}" '
                 f'stroke-width="2.4" fill="none" marker-end="url(#arrow2)"/>')

# 闭环回流：从「传」回到「见」——作品沉淀成为下一个人的灵感
by = top + bh + 44
s.append(f'<path d="M {W2-44-bw/2} {top+bh+6} L {W2-44-bw/2} {by} L {44+bw/2} {by} '
         f'L {44+bw/2} {top+bh+8}" stroke="{PEACOCK}" stroke-width="2" fill="none" '
         f'stroke-dasharray="7 5" marker-end="url(#arrowBack)" opacity="0.8"/>')
s.append(rect(W2 / 2 - 200, by - 15, 400, 30, fill=BG, rx=0))
s.append(text(W2 / 2, by + 5, "作品沉淀进公共画廊，成为下一个人的灵感 —— 内容飞轮",
              size=12.5, fill=PEACOCK, weight="600"))
s.append(text(W2 / 2, H2 - 20,
              "「遗见 · Heritage Foundry」 ｜ 每一幕都对应「用户体验创新」方向的一条官方解析",
              size=11.5, fill=SUB))
s.append("</svg>")

(OUT / "体验链路图.svg").write_text("".join(s), encoding="utf-8")
print("✅ 体验链路图.svg")
