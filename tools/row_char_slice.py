"""한 줄(8칸)짜리 친구 시트를 친구 프레임으로 자릅니다 — 56칸 큰 시트(_chiikawa_tools/slice_green.py)가 없는 친구용.

  python3 tools/row_char_slice.py                 # assets/chars/<id>/ 에 PNG + entry.json
  python3 tools/row_char_slice.py --board /tmp/k.png

재료 (직접 그리지 않음 — 사람이 만든 초록 바탕 시트)
  tools/sheets/kani.webp — 카니 8칸: 0 책 읽기(책 더미) · 1 걷기 · 2 「!!!」 들어 올림 · 3 책 휘두름(궤적) · 4 책 내리침(번쩍) ·
      5 거두기 · 6 웃으며 읽기 · 7 책 읽기. 시트 카니는 왼쪽을 향해 휘두르는데 다른 친구 시트는 오른쪽을 보므로 좌우를 뒤집어 저장.

하는 일: monsters_slice.py 의 크로마키 · 칸 자르기 · 기준점을 그대로 씀. 몸 키를 BODY_DOTS 도트로(고해상도 그대로, k 로 줄임).
chars_manifest.py 가 entry.json 을 읽어 chars.js 에 넣습니다(감정은 joy 하나 · 투사체/효과 그림은 없음 → 게임 기본 효과).
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from monsters_slice import key, cut, anchor, align, refine  # noqa: E402

CH = ROOT / "assets" / "chars"
BODY_DOTS = 33     # 몸 키(도트) — 치이카와 30 · 우사기 36 사이 (집게 귀 포함)

# 친구: (시트, 위, 아래, 대략 칸 경계, 동작 → 칸 번호, 초상 칸, 감정 → 칸)
ROWS = {
    "kani": ("kani.webp", 390, 610, [140, 293, 466, 618, 794, 1002, 1175, 1342, 1520],
             {"idle": [0, 7, 0, 6], "attack": [2, 3, 4, 5], "skill": [2, 3, 4, 4]}, 6, {"joy": 6}),
}


def slice_one(cid, spec):
    sheet, y0, y1, xs, acts, por, emo = spec
    a = np.asarray(Image.open(ROOT / "tools" / "sheets" / sheet).convert("RGB")).astype(float)
    kd = key(a, False)[y0:y1]
    xs = refine(kd[..., 3] > 60, xs)
    cells = []
    for i in range(len(xs) - 1):
        c, m = cut(kd[:, xs[i]:xs[i + 1]])
        c, m = c[:, ::-1].copy(), m[:, ::-1].copy()   # 오른쪽을 보게
        cells.append((c, m))
    ref = cells[0][1]
    body_h = int(np.ptp(np.where(ref.any(1))[0]) + 1)
    k = round(BODY_DOTS / body_h, 5)
    rax = anchor(ref)[0]
    out = CH / cid
    out.mkdir(parents=True, exist_ok=True)
    for p in out.glob("*.png"):
        p.unlink()
    ent = {}
    for i, (c, m) in enumerate(cells):
        ax, ay = anchor(m)
        if i != 0:
            ax = rax + align(ref, m)
        Image.fromarray(c, "RGBA").save(out / f"f_{i}.png", optimize=True)
        ent[i] = {"f": f"{cid}/f_{i}.png", "w": c.shape[1], "h": c.shape[0], "ax": round(float(ax), 1), "ay": round(float(ay), 1), "k": k}
    e = {act: [ent[i] for i in L] for act, L in acts.items()}
    p = ent[por]
    e["portrait"] = dict(p, ax=p["w"] / 2, ay=p["h"] / 2, k=round(64 / p["w"], 5))
    e["emo"] = {nm: ent[i] for nm, i in emo.items()}
    (out / "entry.json").write_text(json.dumps(e, ensure_ascii=False, indent=1))
    print(f"{cid}: 칸 경계 {xs} · 몸 키 {body_h}px → k {k}")
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board")
    a = ap.parse_args()
    for cid, spec in ROWS.items():
        cells = slice_one(cid, spec)
        if a.board:
            H = max(c.shape[0] for c, _ in cells) + 8
            W = sum(c.shape[1] + 8 for c, _ in cells)
            img = Image.new("RGBA", (W, H * 2), (40, 36, 52, 255))
            img.paste((255, 247, 228, 255), (0, H, W, H * 2))
            x = 0
            for c, _ in cells:
                im = Image.fromarray(c, "RGBA")
                img.paste(im, (x + 4, H - 4 - c.shape[0]), im)
                img.paste(im, (x + 4, 2 * H - 4 - c.shape[0]), im)
                x += c.shape[1] + 8
            img.save(a.board)
            print("판:", a.board)


if __name__ == "__main__":
    main()
