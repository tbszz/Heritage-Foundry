"""Fetch source-page evidence; print explicit distribution links for review."""
import urllib.request, re
from pathlib import Path
OUT = Path(__file__).resolve().parents[1] / 'artifacts/spirit-pet/anim-library'
OUT.mkdir(parents=True, exist_ok=True)
for name, url in [('quaternius', 'https://quaternius.com/packs/ultimateanimatedanimals.html'), ('poly-pizza', 'https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS')]:
    try:
        text = urllib.request.urlopen(url, timeout=25).read().decode()
        (OUT / (name+'.html')).write_text(text, encoding='utf-8')
        print(name, re.findall(r'(?:href|src)=[\"\x27]([^\"\x27]+)', text))
    except Exception as e:
        print(name, type(e).__name__, str(e))

url = 'https://drive.google.com/drive/folders/1zIacLXjG-W1A_DN_fCbAGlZy1h-9qAfb'
try:
    text = urllib.request.urlopen(url, timeout=25).read().decode()
    (OUT / 'blends-folder.html').write_text(text, encoding='utf-8')
    print('BLENDS', re.findall(r'data-id="([^"]+)"[^>]*data-tooltip="([^"]+)"', text))
except Exception as e:
    print('blends-folder', str(e))
