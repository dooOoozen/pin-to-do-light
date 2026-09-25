#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the selection sheet for the candidate materials.

The screenshots are renders of the running app on the second monitor, so the only thing this
adds is the reading that goes with each one: what the variant changes, and the two contrast
numbers the panel reported while it was on screen. A pick made from a picture without the
ratio next to it is a pick that gets reopened the first time somebody reads a task in it.
"""
import io, os, re, sys, glob

LOG = os.path.expandvars(r"%APPDATA%\dev.qoder.pintauri\boot.log")
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "docs/media/cand"
SHEET = os.path.join(OUT_DIR, "candidates.html")

DESC = {
    "poster": ("电蓝海报 · 现状与三个改法", "丝网海报：电光蓝、硬切形状、平涂无阴影"),
    "chrome": ("铬黄丝网 · 新材质三个读法", "一张铬黄纸上印一个黑墨：直角、粗黑线、硬偏移块"),
}
MV = {
    "poster": {
        "1": "现状（淡蓝纸、蓝线到处走、酸绿月亮）——对照用",
        "2": "纸白粗黑：蓝只做实块，酸绿换成信号红，3px 黑线",
        "3": "蓝＋品红双色套印：报纸白底，两色交叉处出紫",
        "4": "电蓝实地：桌面整块是蓝，卡片是白纸（卡内重声明墨色）"},
    "chrome": {
        "1": "黄地黑墨白块：整张铬黄底，黑字黑线，红只留一处",
        "2": "黄黑分栏：大字改长春花蓝，黑只做成块的条",
        "3": "白纸大块黄：白底，黄只在标题条/今天/水印"},
}

row = re.compile(r"^\[P\] (\d+) ([a-z]+)/(\d)/([a-z]+) cr=([\d.]+) weakest=([^\s]+)")
stats = {}
with io.open(LOG, encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = row.match(line.strip())
        if m:
            stats["%s/%s/%s" % (m.group(2), m.group(3), m.group(4))] = {
                "cr": m.group(5), "weak": m.group(6), "idx": m.group(1)}

shots = {}
for path in sorted(glob.glob(os.path.join(OUT_DIR, "*.png"))):
    m = re.match(r"^\d+-([a-z]+)-(\d)-([a-z]+)$", os.path.basename(path)[:-4])
    if m:
        shots[m.groups()] = os.path.basename(path)

# one row per material, variants next to their own night half: the comparison that decides
# a pick is "same variant, other hour", not "same hour, other material"
cells = []
for st in ["poster", "chrome"]:
    zh, blurb = DESC[st]
    cells.append('<h2>%s <span>%s</span></h2><div class="grid">' % (zh, blurb))
    for mv in ["1", "2", "3"]:
        for hour in ["paper", "ink"]:
            key = (st, mv, hour)
            if key not in shots:
                continue
            s = stats.get("%s/%s/%s" % key, {})
            cr = float(s.get("cr", 0) or 0)
            weak = float((s.get("weak", ":0").split(":") + ["0"])[1] or 0)
            flag = "bad" if cr < 4.5 or weak < 2.6 else ("warn" if weak < 3.2 else "ok")
            cells.append(
                '<figure class="%s"><img src="%s" alt="%s">'
                '<figcaption><b>mv%s · %s</b>'
                '<span class="tag">%s</span>'
                '<span class="num %s">正文对比度 %s</span> <span class="num %s">最弱优先级标题 %s</span>'
                '</figcaption></figure>'
                % (flag, shots[key], "/".join(key), mv, "白天" if hour == "paper" else "夜间",
                   MV[st][mv], flag, s.get("cr", "?"), flag, s.get("weak", "?")))
    cells.append("</div>")

TEMPLATE = """<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>候选材质 · 实拍</title>
<style>
 body{margin:0;padding:26px 28px 60px;background:#dcd6c8;color:#14120d;
      font:13px/1.6 "Segoe UI Variable Text","Microsoft YaHei",system-ui,sans-serif}
 h1{font-size:19px;margin:0 0 4px;letter-spacing:.03em}
 .lede{max-width:92ch;color:#4b4536;margin:0 0 20px}
 h2{font-size:15px;margin:34px 0 2px}
 h2 span{font-weight:400;color:#4b4536;font-size:12.5px;margin-left:8px}
 .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
 figure{margin:0;background:#efeade;border:1px solid #b9b1a0;padding:6px}
 figure.bad{outline:2px solid #df4c28}
 figure.warn{outline:2px solid #c9a227}
 img{display:block;width:100%;height:auto;border:1px solid rgba(0,0,0,.18)}
 figcaption{padding:6px 4px 2px;font-size:12px}
 figcaption b{display:block;font-size:12.5px;letter-spacing:.02em}
 .tag{display:inline-block;margin:3px 0 4px;padding:1px 6px;border:1px solid #9c9382;font-size:11.5px}
 .num{font-family:"Cascadia Mono",Consolas,monospace;font-size:11.5px}
 .num.bad{color:#b6351a;font-weight:700}
 .num.ok{color:#4b4536}
 figcaption p{margin:3px 0 0;color:#4b4536;font-size:11.5px}
</style></head><body>
<h1>三套候选材质 · 实拍候选</h1>
<p class="lede">每张都是在第二屏真实跑起来的 app：卡片层、卡盒、任务面板都是它自己画的，
没有拼贴模型图，也没有另写一份 HTML。所以这里看到的圆角、线宽、阴影、颗粒，就是选定之后
会出现在你桌面上的东西。红框 = 正文对比度低于 4.5 或最弱的优先级标题低于 2.6（这两条是
app 自己的度量口径），黄框 = 勉强。选的时候告诉我编号即可，例如「黑黄 mv3，但夜间那条红框要修」。</p>
@@CELLS@@
</body></html>
"""
html = TEMPLATE.replace("@@CELLS@@", chr(10).join(cells))

with io.open(SHEET, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote %s with %d cells" % (SHEET, len(cells)))
