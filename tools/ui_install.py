"""공용 UI 키트(portfolio_src/_chiikawa_tools/ui/, 다른 작업 — slice_ui.py)를 디펜스에 입힙니다.

  python3 portfolio_src/chiikawa-defense/tools/ui_install.py

하는 일
 1) 아래 MAP 에 적힌 부품 PNG 와 아이콘을 assets/ui/ 로 복사 (키트 원본은 건드리지 않음)
 2) index.html 의 「ui-kit:defense」 표시 사이에 CSS 를 다시 씀 — 디펜스 화면의 기존 클래스(.btn · .pill · .sheet · .diff …)
    마다 어떤 부품을 9-slice(border-image)로 깔지. 글자는 그대로 HTML. 그래서 화면 코드(game.js)는 고치지 않아도 됨.
    --uk = 원본 px → 화면 px 배율 (자리마다 다름: 작은 알약은 작게, 덮개 종이는 크게).
 키트가 바뀌면(slice_ui.py 다시 실행) 이것만 다시 돌리면 됩니다.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT.parent / "_chiikawa_tools" / "ui"
DST = ROOT / "assets" / "ui"
HTML = ROOT / "index.html"
START, END = "/* ui-kit:defense:start — tools/ui_install.py 가 씀, 손으로 고치지 않음 */", "/* ui-kit:defense:end */"

# 선택자 → (부품, 배율). 버튼 부품은 눌림 · 비활성 그림도 같이
# 덮개 종이(.sheet)는 스크롤되는 상자라 ::before 가 내용과 같이 밀려 올라감 → 상자 자체의 border-image 로 (DIRECT)
DIRECT = [(".sheet", "panel_wide", 0.45)]
MAP = [
    (".card", "panel_wide", 0.32),
    (".pill", "btn_sky", 0.42),
    (".btn", "btn_yellow", 0.5),
    (".btn.pink", "btn_pink", 0.5),
    (".btn.sky", "btn_sky", 0.5),
    ("#summonBtn", "btn_yellow", 0.62),
    (".up", "btn_sky", 0.38),
    (".tool", "btn_yellow", 0.38),
    (".lrow", "btn_sky", 0.42),
    (".diff", "frame_gray", 0.34),
    (".diff[data-i='0']", "frame_yellow", 0.34),
    (".diff[data-i='1']", "frame_sky", 0.34),
    (".diff[data-i='2']", "frame_purple", 0.34),
    (".diff[data-i='3']", "frame_rainbow", 0.34),
    (".rcard", "frame_yellow", 0.36),
    (".rcard.gam", "frame_rainbow", 0.36),
    (".recipe", "frame_gray", 0.3),
    (".recipe.ready", "frame_rainbow", 0.3),
    (".rules", "dash_frame", 0.22),
]
ICONS = ["icon_clover", "icon_lock", "icon_coin", "icon_book", "icon_star"]


def whiten(path):
    """「크림색 하지 마」 — 종이 패널의 따뜻한 미색 바탕을 깨끗한 흰 종이로. 밝고 채도 낮은 픽셀만 흰색 쪽으로 (선 · 그림자는 그대로)"""
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    rgb = a[..., :3]
    light = rgb.min(-1)
    sat = rgb.max(-1) - rgb.min(-1)
    k = np.clip((light - 200) / 40, 0, 1) * (sat < 40)
    rgb += (255 - rgb) * k[..., None]
    a[..., :3] = rgb
    Image.fromarray(a.round().astype("uint8"), "RGBA").save(path)


def main():
    meta = json.loads((KIT / "ui.json").read_text())["parts"]
    DST.mkdir(parents=True, exist_ok=True)
    used = set()
    for _, part, _k in MAP + DIRECT:
        used.add(part)
        if part.startswith("btn_"):
            used |= {part + "_down", part + "_off"}
    for p in sorted(used | set(ICONS)):
        shutil.copy2(KIT / f"{p}.png", DST / f"{p}.png")
        if p.startswith("panel_"):
            whiten(DST / f"{p}.png")

    def v(part):
        T, R, B, L = meta[part]["slice"]
        return f"--src:url(assets/ui/{part}.png);--sl:{T} {R} {B} {L};--t:{T}px;--r:{R}px;--b:{B}px;--l:{L}px"

    sels = ",".join(s for s, _, _ in MAP)
    lines = [START,
             f"{sels}{{position:relative;isolation:isolate;background:none!important;border-color:transparent!important;box-shadow:none!important}}",
             ",".join(s + "::before" for s, _, _ in MAP) + "{content:\"\";position:absolute;inset:calc(var(--ui-bw)*-1);z-index:-1;pointer-events:none;border-style:solid;border-color:transparent;"
             "border-image-source:var(--src);border-image-slice:var(--sl) fill;border-image-repeat:stretch;"
             "border-width:calc(var(--t)*var(--uk)) calc(var(--r)*var(--uk)) calc(var(--b)*var(--uk)) calc(var(--l)*var(--uk))}"]
    for s, part, k in MAP:
        lines.append(f"{s}{{{v(part)};--uk:{k}}}")
        if part.startswith("btn_"):
            lines.append(f"{s}:active:not([disabled]){{{v(part + '_down')}}}")
            lines.append(f"{s}[disabled],{s}[aria-disabled='true']{{{v(part + '_off')}}}")
    for s_, part, k in DIRECT:
        lines.append(f"{s_}{{{v(part)};--uk:{k};background:none!important;box-shadow:none!important;border-style:solid;border-color:transparent;"
                     "border-image-source:var(--src);border-image-slice:var(--sl) fill;border-image-repeat:stretch;"
                     "border-width:calc(var(--t)*var(--uk)) calc(var(--r)*var(--uk)) calc(var(--b)*var(--uk)) calc(var(--l)*var(--uk));padding:2px 6px 4px}")
    lines.append(END)
    t = HTML.read_text()
    i, j = t.find(START), t.find(END)
    if i < 0 or j < 0:
        raise SystemExit(f"index.html <style> 안에 두 줄을 먼저 넣으세요:\n{START}\n{END}")
    HTML.write_text(t[:i] + "\n".join(lines) + t[j + len(END):])
    print("부품", len(used), "· 아이콘", len(ICONS), "→", DST)


if __name__ == "__main__":
    main()
