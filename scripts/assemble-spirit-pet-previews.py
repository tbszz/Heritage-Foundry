"""Assemble actual Blender renders into labeled contact sheets and loop GIFs."""
from PIL import Image, ImageDraw
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'artifacts/spirit-pet/heritage-082/preview'
for clip,last in [('walk',30),('run',18)]:
    frames=[Image.open(P/f'{clip}-sequence'/f'{i:03}.png').convert('RGB') for i in range(1,last+1)]
    # GIF delays have 10ms resolution: 30+30+40 preserves the exact cycle length.
    frames[0].save(P/f'{clip}-loop.gif',save_all=True,append_images=frames[1:],duration=[30,30,40]*(last//3),loop=0,optimize=False)
files=['quad-rest-side','quad-rest-front','quad-skeleton-side','quad-rest-three-quarter','walk-01','walk-09','walk-16','walk-24','run-03','run-12','idle-01','idle-16']
sheet=Image.new('RGB',(1200,4*370),(30,32,36))
draw=ImageDraw.Draw(sheet)
for i,name in enumerate(files):
    image=Image.open(P/(name+'.png')).convert('RGB')
    image.thumbnail((400,340))
    x=(i%3)*400;y=(i//3)*370
    sheet.paste(image,(x,y+25))
    draw.text((x+12,y+7),name,fill='white')
sheet.save(P/'quad-contact-sheet.jpg',quality=92)
print('Created walk-loop.gif, run-loop.gif, quad-contact-sheet.jpg')
