#!/usr/bin/env python3
"""字体子集化脚本（报告 4.3 P2：首屏 −69MB）。

从 assets-src/fonts/ 读取完整字体，扫描 src/ 下所有源码收集实际用到的字符，
子集化后输出 woff2 到 public/fonts/。文案变更后重新运行即可：

    python3 scripts/subset_fonts.py

依赖：pip install fonttools brotli
"""
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / 'src'
FONTS_SRC = ROOT / 'assets-src' / 'fonts'
FONTS_OUT = ROOT / 'public' / 'fonts'

FONTS = [
    'SourceHanSerifSC-Regular.otf',
    'SourceHanSerifSC-Heavy.otf',
    'LXGWWenKai-Regular.ttf',
]

# 源码之外必须保留的字符：ASCII 可打印区 + 中文常用标点 + 全角符号
EXTRA_CHARS = (
    ''.join(chr(c) for c in range(0x20, 0x7F))
    + '、。，！？；：""''（）《》〈〉【】「」『』…—–·×÷≈℃％＋－'
    + '　〇一二三四五六七八九十百千万亿'
)


def collect_chars():
    chars = set(EXTRA_CHARS)
    patterns = ['*.html', '*.js', '*.css', '*.json']
    for pattern in patterns:
        for path in SRC_DIR.rglob(pattern):
            chars.update(path.read_text(encoding='utf-8', errors='ignore'))
    # 去掉控制字符
    return {c for c in chars if ord(c) >= 0x20}


def subset_font(filename, text):
    src = FONTS_SRC / filename
    if not src.exists():
        print(f'⚠️  跳过 {filename}：{src} 不存在')
        return
    out = FONTS_OUT / (Path(filename).stem + '.woff2')

    font = TTFont(str(src))
    options = Options()
    options.flavor = 'woff2'
    options.desubroutinize = True
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True

    subsetter = Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)

    FONTS_OUT.mkdir(parents=True, exist_ok=True)
    font.save(str(out))

    before = src.stat().st_size / 1024 / 1024
    after = out.stat().st_size / 1024
    print(f'✓ {filename}: {before:.1f}MB → {out.name} {after:.0f}KB')


def main():
    chars = collect_chars()
    text = ''.join(sorted(chars))
    print(f'共收集 {len(chars)} 个字符（源码扫描 + 常用标点）')
    for filename in FONTS:
        subset_font(filename, text)


if __name__ == '__main__':
    sys.exit(main())
