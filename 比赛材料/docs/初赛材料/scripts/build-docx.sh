#!/bin/bash
# 从 Markdown 重建 Word 版作品说明文档（含配图与中文排版）
# 用法：bash scripts/build-docx.sh
set -e
cd "$(dirname "$0")/.."
MD="01-作品说明文档-遗见HeritageFoundry.md"
DOCX="01-作品说明文档-遗见HeritageFoundry.docx"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "① 生成矢量配图 → figures/*.svg"
python3 scripts/gen_diagrams.py

echo "② SVG → 2 倍 PNG（headless Chrome，中文字体最稳）"
cd figures
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1080,1032 --screenshot="架构图.png" "file://$PWD/架构图.svg" 2>/dev/null
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1080,380 --screenshot="体验链路图.png" "file://$PWD/体验链路图.svg" 2>/dev/null
cd ..

echo "③ Markdown → docx"
rm -f "$DOCX"
pandoc "$MD" -f gfm -o "$DOCX" --resource-path=. -V lang=zh-CN

echo "④ 中文排版后处理（宋体正文/黑体标题/A4/图居中/表格边框/页码）"
python3 scripts/fix_docx.py "$DOCX" submit   # 档位：submit（提交档，主体≤20页）/ normal / compact

echo "✅ 完成：$DOCX"
