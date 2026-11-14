from PIL import Image, ImageDraw
from pathlib import Path
root = Path('artifacts/workflow/polish/authentication-ui')
names = ['welcome-1440','email-entry','email-focused','email-validation','otp-entry','otp-error','verification-pending','external','success','organization','selection','invitation','expired','network','welcome-780x640','otp-320x568']
w,h = 420,310
sheet = Image.new('RGB',(w*4,h*4),'#edf0f3')
draw = ImageDraw.Draw(sheet)
for i,name in enumerate(names):
    im = Image.open(root/(name+'.png')).convert('RGB')
    im.thumbnail((w-16,h-38))
    sheet.paste(im,((i%4)*w+(w-im.width)//2,(i//4)*h+28))
    draw.text(((i%4)*w+12,(i//4)*h+8),name+' · DEV FIXTURE',fill='#202226')
sheet.save(root/'contact-sheet.png')
# Historical before capture was preserved before rerunning the transport suite.
prior = root/'before'/'welcome-1440.png'
if not prior.exists():
    prior = Path('artifacts/workflow/authentication-supabase/live-gmail/otp-entry-or-error.png')
a=Image.open(prior).convert('RGB')
b=Image.open(root/'welcome-1440.png').convert('RGB')
comparison=Image.new('RGB',(1400,500),'#edf0f3')
d=ImageDraw.Draw(comparison)
for i,(label,im) in enumerate([('Before: Phase 1 authentication capture',a),('After: Phase 2.3A real Electron visual fixture',b)]):
    im.thumbnail((680,440))
    comparison.paste(im,(i*700+(700-im.width)//2,38))
    d.text((i*700+14,12),label,fill='#202226')
comparison.save(root/'before-after-contact-sheet.png')
