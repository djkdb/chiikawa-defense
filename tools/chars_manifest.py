"""캐릭터 프레임 목록(assets/chars/chars.js)을 만듭니다.

  python3 portfolio_src/chiikawa-defense/tools/chars_manifest.py          # chars.js 다시 쓰기
  python3 portfolio_src/chiikawa-defense/tools/chars_manifest.py --board /tmp/frames.png  # 고른 프레임 판도

왜 손으로 고르나: 시트를 칸 단위로 자르다 보니 이웃 칸과 겹쳐 잘린 프레임(모몽가 꼬리 · 쿠리만쥬 skill_2·3 ·
하치와레 귀가 빠진 skill_2)이 섞여 있습니다. 자동 판정(가장자리 불투명 비율)은 둥근 몸·갈기와 잘린 면을 못 가려서,
눈으로 본 결과를 아래 PICK 에 적어 둡니다. 빠진 동작은 게임이 idle_0 · portrait 로 대신합니다.

하는 일
  1) 위 가장자리에 붙은 납작한 부스러기(윗줄 칸에서 넘어온 1~3줄짜리 선) 지우기 — 원본 PNG 를 고칩니다
  2) 발 기준점 계산: 아래 6줄 불투명 픽셀의 가운데 x · 맨 아래 y. 효과(별·불꽃)가 옆에 붙은 프레임도 몸이 칸 가운데 서게
  3) chars.js 에 {파일, 크기, 기준점} 목록을 씁니다 — 게임은 여기 적힌 파일만 불러옵니다(없는 파일 404 방지)
"""
import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CH = ROOT / "assets" / "chars"

# 눈으로 고른 프레임. shot = 투사체로 날릴 효과만 있는 프레임, fx = 스킬이 터질 때 맞은 자리에 띄울 효과 프레임
PICK = {
    "chiikawa":  {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3, 4], "skill": [0, 1, 2, 3, 4], "shot": None, "fx": None},
    # skill_2 는 파란 귀가 빠져 치이카와처럼 보임 · hit_0~2 도 같은 문제(게임은 hit 안 씀)
    "hachiware": {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 3], "shot": "attack_4", "fx": "skill_4"},
    "usagi":     {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 2, 3, 4], "shot": "attack_4", "fx": None},
    # skill_3 은 불꽃 + 잘린 몸 조각 → 효과는 attack_4 불꽃을 크게
    "shisa":     {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 2, 4], "shot": "attack_4", "fx": "attack_4"},
    # idle_1~3 · skill_1·3·4 는 꼬리(파란 털)가 잘림 · attack_0 은 윗줄 부스러기
    "momonga":   {"idle": [0, 4], "attack": [1, 2, 3], "skill": [0], "shot": "attack_4", "fx": "skill_2"},
    "rakko":     {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 2, 3, 4], "shot": "attack_4", "fx": None},
    "pungdengi": {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 2, 3], "shot": "attack_4", "fx": "skill_4"},
    # skill_2·3 깨짐(반쪽 몸)
    "kurimanju": {"idle": [0, 1, 2, 3, 4], "attack": [0, 1, 2, 3], "skill": [0, 1, 4], "shot": "attack_4", "fx": None},
}


def clean_top(im):
    """머리 위에 떠 있는 납작한 부스러기(윗줄 칸에서 넘어온 선)를 지웁니다. 지운 픽셀 수를 돌려줌.
    기준: 맨 위 3줄 안에서 시작하고, 몸과 떨어져 있고, 높이가 3줄 이하. 하트·별(높이 5줄 이상)은 남습니다."""
    w, h = im.size
    px = im.load()
    seen = set()
    removed = 0
    for y0 in range(min(3, h)):
        for x0 in range(w):
            if px[x0, y0][3] < 8 or (x0, y0) in seen:
                continue
            comp, stack = [], [(x0, y0)]
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3] >= 8:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            ys = [p[1] for p in comp]
            if max(ys) - min(ys) <= 2 and max(ys) <= 5 and len(comp) < w * 4:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
                removed += len(comp)
    return removed


def clean_pinch(im):
    """머리에 붙어 버린 윗줄 그림자 조각(연한 회색 렌즈 모양)을 잘라 냅니다. 지운 줄 수를 돌려줌.
    머리 꼭대기는 아래로 갈수록 넓어지기만 하는데, 그림자 조각은 아래로 좁아졌다가 머리에서 다시 넓어집니다.
    그래서 맨 위 4줄 안에서 「좁아졌다 → 다시 넓어짐」 이 있고, 좁아지는 줄들이 연한 색이면 그 줄까지 지웁니다."""
    w, h = im.size
    px = im.load()

    def row(y):
        xs = [x for x in range(w) if px[x, y][3] > 100]
        if not xs:
            return 0, 255
        lum = sum(0.3 * px[x, y][0] + 0.59 * px[x, y][1] + 0.11 * px[x, y][2] for x in xs) / len(xs)
        return len(xs), lum

    R = [row(y) for y in range(min(6, h))]
    for k in range(1, 4):
        if k + 1 >= len(R):
            break
        if R[k][0] < R[0][0] and R[k + 1][0] > R[k][0] and all(R[j][1] > 175 for j in range(1, k + 1)) and R[k + 1][1] < R[k][1] - 25:
            for y in range(k + 1):
                for x in range(w):
                    px[x, y] = (0, 0, 0, 0)
            return k + 1
    return 0


def trim(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def anchor(im, body=True):
    w, h = im.size
    a = im.split()[3].load()
    if not body:
        return w / 2, h / 2
    xs = [x for y in range(max(0, h - 6), h) for x in range(w) if a[x, y] > 128]
    ax = (min(xs) + max(xs)) / 2 if xs else w / 2
    return round(ax, 1), h


def entry(name, fn, body=True, fix=True):
    p = CH / name / (fn + ".png")
    im = Image.open(p).convert("RGBA")
    if fix:
        n = clean_top(im)
        k = clean_pinch(im)
        if n or k:
            im = trim(im)
            im.save(p)
            print(f"  {name}/{fn}: 윗줄 부스러기 {n}px · 붙은 그림자 {k}줄 지움")
    ax, ay = anchor(im, body)
    return {"f": f"{name}/{fn}.png", "w": im.width, "h": im.height, "ax": ax, "ay": ay}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", metavar="PNG", help="고른 프레임을 한 장으로 펴서 여기 저장")
    a = ap.parse_args()
    out = {}
    for name, pk in PICK.items():
        d = {"portrait": entry(name, "portrait", body=False, fix=False)}
        for k in ("idle", "attack", "skill"):
            d[k] = [entry(name, f"{k}_{i}") for i in pk[k]]
        d["shot"] = entry(name, pk["shot"], body=False) if pk["shot"] else None
        d["fx"] = entry(name, pk["fx"], body=False) if pk["fx"] else None
        out[name] = d
    js = (
        "/* 캐릭터 프레임 목록 — tools/chars_manifest.py 가 씁니다(손으로 고치지 말고 그 파일의 PICK 을 고친 뒤 다시 실행).\n"
        "   그림: 사람이 준 팬 도트 시트를 자른 PNG(공식 그림 아님). 잘리거나 깨진 프레임은 빼 두었습니다.\n"
        "   f = 파일, w·h = 크기, ax·ay = 발 기준점(몸 프레임) 또는 가운데(효과 프레임). */\n"
        "window.CD_CHAR_FILES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )
    (CH / "chars.js").write_text(js)
    print("chars.js 씀:", sum(len(v["idle"]) + len(v["attack"]) + len(v["skill"]) for v in out.values()), "프레임")
    if a.board:
        S, cw = 4, 40 * 4
        rows = list(out.items())
        n = max(len(v["idle"]) + len(v["attack"]) + len(v["skill"]) + 3 for _, v in rows)
        img = Image.new("RGBA", (cw * n, cw * len(rows)), (201, 229, 166, 255))
        for r, (name, v) in enumerate(rows):
            items = [v["portrait"]] + v["idle"] + v["attack"] + v["skill"] + [x for x in (v["shot"], v["fx"]) if x]
            for c, e in enumerate(items):
                im = Image.open(CH / e["f"]).convert("RGBA")
                k = 2 if e is v["portrait"] else S
                b = im.resize((im.width * k, im.height * k), Image.NEAREST)
                img.paste(b, (c * cw + int(cw / 2 - e["ax"] * k), r * cw + cw - 4 - int(e["ay"] * k)), b)
        dst = Path(a.board)
        img.save(dst)
        print("판:", dst)


if __name__ == "__main__":
    main()
