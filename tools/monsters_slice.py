"""괴물 특성 5종 · 보스 4종 그림을 사람이 준 초록 바탕(#00FF00 크로마키) 시트에서 잘라 assets/monsters/ 에 넣습니다.

  python3 portfolio_src/chiikawa-defense/tools/monsters_slice.py                      # 자르고 monsters.js 쓰기
  python3 portfolio_src/chiikawa-defense/tools/monsters_slice.py --board /tmp/mon.png # + 확대 확인 판 (어두운·밝은 바탕)

재료 (직접 그리지 않음 — 사람이 만든 시트)
  tools/sheets/monsters.webp — 괴물 5줄 × 8칸(분열 줄만 10개). 라벨은 왼쪽 바깥. 시트 괴물은 오른쪽을 봄.
      고속: 걷기 6 · 맞음 · 쓰러짐 / 장갑: 걷기 6 · 맞음 · 쓰러짐 / 재생: 걷기 5 · 회복 반짝 · 맞음 · 쓰러짐
      분열: 걷기 6 · 갈라짐 2 · 작은 젤리 2 / 부활: 걷기 6 · 쓰러짐(초록 반투명 유령) · 다시 일어남
  tools/sheets/bosses.webp — 보스 4줄 × 8칸: 침묵 · 소환 · 회복 · 셔플. 앞 4칸 걷기(0 = 정면, 1~3 = 왼쪽을 봄),
      5·6칸 = 기술 준비, 7·8칸 = 쓰는 중.

하는 일
 1) 칸 나누기 — 아래 CUTS 의 대략 경계(사람이 시트를 보고 적음)를 ±40px 안에서 「그림이 가장 적은 세로줄」 로 옮겨
    옆 칸 이펙트와 붙은 칸(침묵 보스 6~8칸 등)도 가장 얇은 틈에서 끊습니다.
 2) 크로마키 — 초록 정도 gn = G − max(R,B). 바탕은 gn≈225~245 이고, 지키고 싶은 초록은 그보다 훨씬 낮습니다
    (재생 괴물 잎 ≈70 · 부활 쓰러짐 유령 ≈95~120 · 회복 보스 연두 빛은 R 이 높아 gn 이 낮음).
    그래서 키를 좁게: gn ≥ KEY_HI 는 투명, gn ≤ KEY_LO 는 불투명, 그 사이만 반투명. 반투명은 바탕색을 빼서(unmix) 색을 되살림.
 3) 가장자리 초록 번짐 — 투명과 맞닿은 2px 띠에서만 G 를 max(R,B)+DESPILL 로 깎습니다.
    단, R 이 높고 B 가 낮은 연두·노랑 빛(회복 보스의 빛 고리)은 원래 색이라 깎지 않습니다.
 4) 칸 가장자리에 닿은 작은 조각(옆 칸에서 넘어온 것)은 버리고, 남은 것의 테두리로 잘라 냅니다.
 5) 크기 — 줄마다 걷기 프레임의 몸 높이를 게임 도트 키(괴물 MON_H · 보스 BOSS_H)에 맞추고, 3배 해상도(k=1/3)로 저장.
    발 기준점 = 가장 큰 덩어리의 맨 아래 · 위쪽 절반(머리·몸통)의 가로 평균 (걷기 프레임마다 같은 자리에 서게).
 6) assets/monsters/monsters.js 에 {파일, 크기, 기준점, k} 목록을 씁니다 — 게임은 여기 적힌 것만 불러옵니다.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[1]
SHEETS = ROOT / "tools" / "sheets"
OUT = ROOT / "assets" / "monsters"

KEY_HI, KEY_LO = 185, 130     # 이 사이만 반투명 — 넓히면 유령·잎이 같이 지워집니다
DESPILL = 28
BG = np.array([3.0, 247.0, 15.0])   # 시트 바탕 실제 값(가장자리 평균)
DOTS = 3                      # 저장 해상도: 1 도트 = 3px (k = 1/3)
MON_H = 27                    # 괴물 걷기 몸 키(도트) — 예전 그린 괴물(26)·칸(32)에 맞춤
BOSS_H = 56                   # 보스 걷기 몸 키(도트) — 칸 두 개 가까이, 크게

# 줄: (시트, 위, 아래, 대략 경계들, 프레임 이름들)
MON_ROWS = {
    "fast":   (80, 218, [185, 341, 492, 642, 792, 960, 1137, 1305, 1510], ["walk"] * 6 + ["hit", "down"]),
    "armor":  (238, 408, [180, 339, 492, 646, 800, 958, 1131, 1312, 1510], ["walk"] * 6 + ["hit", "down"]),
    "regen":  (422, 588, [185, 327, 481, 645, 810, 965, 1140, 1320, 1510], ["walk"] * 5 + ["heal", "hit", "down"]),
    "split":  (628, 768, [185, 319, 452, 582, 712, 845, 974, 1115, 1296, 1405, 1510], ["walk"] * 6 + ["split", "split", "small", "small"]),
    "revive": (788, 968, [185, 325, 475, 638, 793, 956, 1117, 1300, 1510], ["walk"] * 6 + ["down", "rise"]),
}
BOSS_ROWS = {
    "silence": (30, 264, [142, 313, 458, 600, 748, 924, 1105, 1300, 1530]),
    "summon":  (276, 502, [142, 315, 460, 605, 763, 936, 1108, 1320, 1530]),
    "heal":    (500, 734, [142, 319, 470, 618, 771, 948, 1134, 1339, 1530]),
    "shuffle": (734, 968, [142, 314, 467, 618, 775, 941, 1130, 1313, 1530]),
}
BOSS_NAMES = ["front", "walk", "walk", "walk", "ready", "ready", "cast", "cast"]


def key(a, green=False):
    """RGB float → (RGBA uint8). 좁은 키 + 바탕 빼기 + 초록 번짐 깎기.
    green=False: 원래 초록이 없는 줄 — 모든 픽셀에서 G 를 max(R,B) 까지 깎음(가는 검은 선·흰 먼지에 밴 초록까지).
    green=True : 잎·유령·연두 빛이 있는 줄 — 투명과 맞닿은 3px 띠에서만, 연두·노랑 빛은 빼고 깎음."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gn = g - np.maximum(r, b)
    al = np.clip((KEY_HI - gn) / (KEY_HI - KEY_LO), 0, 1)
    # 반투명: c = α·F + (1−α)·BG → F
    f = a.copy()
    semi = (al > 0) & (al < 1)
    f[semi] = (a[semi] - (1 - al[semi, None]) * BG) / al[semi, None]
    f = np.clip(f, 0, 255)
    # 투명과 맞닿은 띠(2px)의 초록 번짐만 깎기
    clear = al < 0.5
    r2, g2, b2 = f[..., 0], f[..., 1], f[..., 2]
    if not green:
        cap = np.maximum(r2, b2)
        fix = g2 > cap
    else:
        band = nd.binary_dilation(clear, iterations=3) & ~clear
        glow = (r2 > 165) & (b2 < 120)            # 연두·노랑 빛은 원래 색
        cap = np.maximum(r2, b2) + DESPILL
        fix = band & ~glow & (g2 > cap)
    f[..., 1] = np.where(fix, cap, g2)
    out = np.dstack([f, al * 255]).round().astype(np.uint8)
    return out


def refine(mask, xs, win=40):
    """대략 경계를 그림이 가장 적은 세로줄로."""
    cols = mask.sum(0)
    o = [xs[0]]
    for x in xs[1:-1]:
        lo, hi = max(0, x - win), min(len(cols) - 1, x + win)
        seg = cols[lo:hi]
        m = seg.min()
        idx = np.where(seg == m)[0]
        # 가장 적은 줄이 여럿이면 원래 경계에 가장 가까운 것
        best = idx[np.argmin(np.abs(idx + lo - x))] + lo
        o.append(int(best))
    o.append(xs[-1])
    return o


def cut(rgba, side_drop=500):
    """칸 하나: 칸 가장자리에 닿은 작은 조각 버리고 테두리로 자르기. 돌려줌: (그림, 가장 큰 덩어리 마스크)"""
    al = rgba[..., 3] > 60
    lab, n = nd.label(al, structure=np.ones((3, 3)))
    if n == 0:
        return None, None
    sizes = nd.sum(al, lab, range(1, n + 1))
    H, W = al.shape
    keep = np.zeros_like(al)
    big = int(np.argmax(sizes)) + 1
    objs = nd.find_objects(lab)
    for i in range(1, n + 1):
        sl = objs[i - 1]
        touch = sl[1].start == 0 or sl[1].stop == W or sl[0].start == 0 or sl[0].stop == H
        if sizes[i - 1] < 6:
            continue
        if touch and sizes[i - 1] < side_drop and i != big:
            continue
        keep |= lab == i
    # 반투명 가장자리도 같이 (덩어리에 붙은 것만)
    keep2 = nd.binary_dilation(keep, iterations=2) & (rgba[..., 3] > 0)
    ys, xs = np.where(keep2)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = rgba.copy()
    out[~keep2] = 0
    return out[y0:y1, x0:x1], (lab == big)[y0:y1, x0:x1]


def anchor(main):
    """발 기준점: y = 가장 큰 덩어리의 맨 아래 · x = 그 덩어리 위쪽 절반(머리·몸통)의 가로 평균.
    발밑 먼지·꼬리는 프레임마다 달라 아래쪽으로 가운데를 잡으면 걸을 때 좌우로 떨림."""
    ys, xs = np.where(main)
    top, bot = ys.min(), ys.max()
    up = xs[ys <= top + (bot - top) * 0.5]
    return float(up.mean()), int(bot + 1)


def align(a, b, win=14):
    """발(맨 아래)을 맞춘 두 마스크를 가로로 밀어 가장 많이 겹치는 dx — b 의 x 를 a 좌표로 바꾸는 값의 반대."""
    H = max(a.shape[0], b.shape[0])
    W = max(a.shape[1], b.shape[1]) + 2 * win
    A = np.zeros((H, W), bool)
    A[H - a.shape[0]:, win:win + a.shape[1]] = a
    best, bd = -1, 0
    for dx in range(-win, win + 1):
        B = np.zeros((H, W), bool)
        x0 = win + dx
        if x0 < 0 or x0 + b.shape[1] > W:
            continue
        B[H - b.shape[0]:, x0:x0 + b.shape[1]] = b
        v = (A & B).sum()
        if v > best:
            best, bd = v, dx
    # b 의 점 x 는 a 좌표로 x + bd → a 의 기준점 rax 는 b 좌표로 rax − bd
    return -bd


def scale_rgba(arr, k):
    im = Image.fromarray(arr, "RGBA").convert("RGBa")
    w, h = max(1, round(arr.shape[1] * k)), max(1, round(arr.shape[0] * k))
    return np.asarray(im.resize((w, h), Image.LANCZOS).convert("RGBA"))


# 원래 초록(잎 · 초록 유령 · 연두 빛)이 있는 줄 → 그 프레임 이름들(None = 줄 전체). 부활은 쓰러짐(초록 유령)만 —
# 걷기·일어남의 하늘색 꼬리는 전부 깎아야 청록으로 물들지 않음
GREEN = {"regen": None, "heal": None, "revive": {"down"}}
ROW_H = {"split": 22}                        # 분열 젤리는 납작하고 넓어서 키를 조금 낮춤 (칸 폭을 넘지 않게)


def slice_rows(sheet, rows, names_of, target_h, prefix):
    a = np.asarray(Image.open(sheet).convert("RGB")).astype(float)
    keyed = {False: key(a, False), True: key(a, True)}
    man, cells_dbg = {}, {}
    for name, spec in rows.items():
        y0, y1, xs = spec[0], spec[1], spec[2]
        names = names_of(spec)
        gset = GREEN.get(name, set())
        frames = []
        xs = refine(keyed[False][y0:y1][..., 3] > 60, xs)
        for i in range(len(xs) - 1):
            green = gset is None or names[i] in gset
            c, main = cut(keyed[green][y0:y1, xs[i]:xs[i + 1]])
            frames.append((names[i], c, main, (xs[i], y0, xs[i + 1], y1)))
        # 크기: 걷기 프레임 몸(가장 큰 덩어리) 높이의 중앙값을 target_h 도트로
        hs = sorted(int(np.ptp(np.where(m.any(1))[0]) + 1) for n, c, m, _ in frames if n == "walk")
        body_h = hs[len(hs) // 2]
        k = ROW_H.get(name, target_h) * DOTS / body_h
        ent = {}
        cnt = {}
        ref = next((m for n, c, m, _ in frames if n == "walk"), None)
        rax = anchor(ref)[0] if ref is not None else 0
        for n, c, m, box in frames:
            ax, ay = anchor(m)
            # 걷기·맞음·회복은 첫 걷기 프레임과 가장 잘 겹치는 자리로 — 옆에 붙은 잎·먼지 때문에 흔들리지 않게
            if ref is not None and n in ("walk", "hit", "heal", "small") and m is not ref and n != "small":
                ax = rax + align(ref, m)
            sc = scale_rgba(c, k)
            j = cnt.get(n, 0)
            cnt[n] = j + 1
            fn = f"{prefix}{name}_{n}_{j}.png"
            Image.fromarray(sc, "RGBA").save(OUT / fn, optimize=True)
            ent.setdefault(n, []).append({"f": fn, "w": sc.shape[1], "h": sc.shape[0], "ax": round(ax * k, 1), "ay": round(ay * k, 1)})
            cells_dbg.setdefault(name, []).append((n, sc, box))
        man[name] = ent
        print(f"{prefix}{name}: 몸 키 {body_h}px → ×{k:.3f} · 칸 경계 {xs}")
    return man, cells_dbg


def board(dbg, path):
    """확대 판: 줄마다 프레임을 어두운 바탕·밝은 바탕에 나란히 ×2 — 초록 번짐·지워진 초록을 눈으로."""
    Z = 2
    rows = []
    for name, fr in dbg.items():
        for bgc in ((40, 36, 52), (255, 246, 228)):
            W = sum(s.shape[1] * Z + 8 for _, s, _ in fr) + 8
            H = max(s.shape[0] for _, s, _ in fr) * Z + 26
            im = Image.new("RGB", (W, H), bgc)
            d = ImageDraw.Draw(im)
            x = 8
            for n, s, _ in fr:
                sp = Image.fromarray(s, "RGBA").resize((s.shape[1] * Z, s.shape[0] * Z), Image.NEAREST)
                im.paste(sp, (x, 20), sp)
                d.text((x, 4), f"{name}:{n}", fill=(255, 80, 80))
                x += s.shape[1] * Z + 8
            rows.append(im)
    W = max(r.width for r in rows)
    out = Image.new("RGB", (W, sum(r.height for r in rows)), (128, 128, 128))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    out.save(path)
    print("판:", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()
    mon, d1 = slice_rows(SHEETS / "monsters.webp", MON_ROWS, lambda s: s[3], MON_H, "m_")
    boss, d2 = slice_rows(SHEETS / "bosses.webp", BOSS_ROWS, lambda s: BOSS_NAMES, BOSS_H, "b_")
    js = (
        "/* 괴물 특성 5종 · 보스 4종 프레임 목록 — tools/monsters_slice.py 가 씁니다(손으로 고치지 말 것).\n"
        "   그림: 사람이 만든 초록 바탕 시트(tools/sheets/)를 자른 PNG. 시트 괴물은 오른쪽, 보스 걷기는 왼쪽을 봅니다.\n"
        "   f = 파일, w·h = 크기(px), ax·ay = 발 기준점(px), k = 그림 1px 의 도트 수. */\n"
        f"window.CD_MON_FILES = {json.dumps({'k': round(1 / DOTS, 6), 'mon': mon, 'boss': boss}, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    (OUT / "monsters.js").write_text(js)
    print("monsters.js 씀 ·", len(list(OUT.glob('*.png'))), "장")
    if a.board:
        board({**d1, **d2}, a.board)


if __name__ == "__main__":
    main()
