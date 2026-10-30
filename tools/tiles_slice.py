"""판 타일 · 소품 · 배경 맵 · 표지를 사람이 만든 그림에서 잘라 assets/tiles/ · assets/bg/ 에 넣습니다.

  python3 portfolio_src/chiikawa-defense/tools/tiles_slice.py                       # 자르고 tiles.js 쓰기
  python3 portfolio_src/chiikawa-defense/tools/tiles_slice.py --board /tmp/tiles.png  # + 확대 확인 판

재료 (직접 그리지 않음)
  tools/sheets/tiles.webp (1536×1024, 바탕 #00FF00) — 6줄:
    1 풀밭 칸 8 (보통 · 노랑 선택됨 · 보라 봉인됨 · 꽃 · 돌 · 꽃밭 · 덤불 · 꽃)  → 친구 자리
    2 흙길 8 (빈 흙 · 세로 · 가로 · 모서리 셋 · T자 · 十자)                 → 괴물 길 (모서리는 뒤집어 네 방향)
    3 나무 울타리 조각 9 · 4 덤불 7 · 5 꽃무더기 5 · 돌 3 · 버섯 3 · 6 팻말 2 · 그루터기 · 통나무 · 바위 · 이끼 통나무 · 구멍 · 괴물 굴
  tools/sheets/maps.webp (1024×1536, 흰 줄로 2×2) — 왼쪽 위 낮 들판 · 오른쪽 위 밤 숲 · 오른쪽 아래 랜덤 디펜스 표지.
    왼쪽 아래는 다른 게임(자격증) 것이라 쓰지 않습니다.

크로마키는 tools/monsters_slice.py 와 같은 좁은 키(gn = G − max(R,B) ≥ 185 투명 · ≤ 130 불투명) — 타일 안 연두 풀은 gn 이
훨씬 낮아 남고, 투명과 맞닿은 3px 띠에서만 초록 번짐을 깎습니다(연두·노랑은 빼고). 덩어리 찾기는 6px 넓혀 붙은 꽃잎까지 한 장으로.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

import monsters_slice as ms

ROOT = Path(__file__).resolve().parents[1]
SHEETS = ROOT / "tools" / "sheets"
TILES = ROOT / "assets" / "tiles"
BG = ROOT / "assets" / "bg"

# 줄 (위·아래 y) → 왼쪽부터 이름
ROWS = [
    ((30, 212), ["grass", "grass_sel", "grass_seal", "grass_f1", "grass_rock", "grass_f2", "grass_bush", "grass_f3"]),
    ((212, 395), ["dirt", "dirt_v", "dirt_h", "dirt_c1", "dirt_c2", "dirt_c3", "dirt_t", "dirt_x"]),
    ((395, 540), ["fence_long", "post_a", "post_b", "fence_bend_a", "fence_corner", "fence_mid", "fence_rail", "fence_bend_b", "posts"]),
    ((540, 685), ["bush_a", "bush_b", "bush_c", "bush_d", "bush_e", "bush_f", "bush_g"]),
    ((685, 815), ["flowers_w", "flowers_y", "flowers_b", "flowers_mix", "flowers_big", "rock_s", "rock_m", "rock_l", "mush_red", "mush_white", "mush_yellow"]),
    ((815, 1000), ["sign", "sign_arrow", "stump", "log", "rocks", "log_moss", "hole", "cave"]),
]
DOTS = 3          # 1 도트 = 3px 로 저장
TILE_DOT = 32     # 칸 한 변 도트
TILE_KIND = {"grass", "dirt"}   # 이름이 이걸로 시작하면 칸 타일 — 정사각으로 늘려 칸에 꼭 맞춤


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board")
    a = ap.parse_args()
    TILES.mkdir(parents=True, exist_ok=True)
    BG.mkdir(parents=True, exist_ok=True)
    for p in TILES.glob("*.png"):
        p.unlink()
    src = np.asarray(Image.open(SHEETS / "tiles.webp").convert("RGB")).astype(float)
    rgba = ms.key(src, True)
    fg = nd.binary_dilation(rgba[..., 3] > 60, iterations=6)
    lab, n = nd.label(fg)
    boxes = [o for o in nd.find_objects(lab) if (o[0].stop - o[0].start) * (o[1].stop - o[1].start) > 1500]
    man, dbg = {}, []
    tile_px = None
    for (y0, y1), names in ROWS:
        row = sorted([b for b in boxes if y0 <= (b[0].start + b[0].stop) / 2 < y1], key=lambda b: b[1].start)
        assert len(row) == len(names), (y0, len(row), len(names))
        for b, nm in zip(row, names):
            cut = rgba[b[0], b[1]].copy()
            cut[~(lab[b[0], b[1]] > 0)] = 0
            # 덩어리 안만 (옆 덩어리 조각 빼기)
            own = lab[b[0], b[1]] == lab[b[0], b[1]][lab[b[0], b[1]] > 0].max() if False else None
            al = cut[..., 3] > 0
            ys, xs = np.where(al)
            cut = cut[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            if nm.split("_")[0] in TILE_KIND:
                # 칸 타일: 가장자리 풀 술이 칸 밖으로 나오도록 TILE_DOT 보다 조금 크게(1.12배) 정사각으로
                side = round(TILE_DOT * 1.12 * DOTS)
                im = Image.fromarray(cut, "RGBA").convert("RGBa").resize((side, side), Image.LANCZOS).convert("RGBA")
                tile_px = tile_px or cut.shape[1]
            else:
                # 소품: 칸 타일과 같은 배율 (시트 안에서 크기 비율 그대로)
                k = (TILE_DOT * 1.12 * DOTS) / (tile_px or 160)
                im = Image.fromarray(cut, "RGBA").convert("RGBa").resize((max(1, round(cut.shape[1] * k)), max(1, round(cut.shape[0] * k))), Image.LANCZOS).convert("RGBA")
            im.save(TILES / f"{nm}.png", optimize=True)
            man[nm] = {"f": f"{nm}.png", "w": im.width, "h": im.height}
            dbg.append((nm, im))
    js = ("/* 판 타일 · 소품 목록 — tools/tiles_slice.py 가 씁니다(손으로 고치지 말 것). 사람이 만든 시트(tools/sheets/tiles.webp)를 자른 PNG.\n"
          "   w·h = px, k = 그림 1px 의 도트 수. grass*·dirt* 는 칸 타일(가장자리 술 포함 칸의 1.12배 정사각). */\n"
          f"window.CD_TILE_FILES = {json.dumps({'k': round(1 / DOTS, 6), 'pad': 1.12, 'tiles': man}, ensure_ascii=False, separators=(',', ':'))};\n")
    (TILES / "tiles.js").write_text(js)
    print("타일", len(man), "장")
    # 맵 · 표지: 흰 줄(x 505~516, y 758~767)로 나눈 2×2 — 줄 옆 2px 더 깎음
    m = Image.open(SHEETS / "maps.webp").convert("RGB")
    W, H = m.size
    quads = {"day": (0, 0, 503, 756), "night": (519, 0, W, 756), "cover": (519, 770, W, H)}
    for nm, box in quads.items():
        q = m.crop(box)
        q.save(BG / f"{nm}.webp", quality=86, method=6)
        print("배경", nm, q.size)
    if a.board:
        Z = 2
        Wb = sum(im.width * Z + 10 for _, im in dbg[:24])
        out = Image.new("RGB", (max(1800, Wb), 1200), (40, 36, 52))
        d = ImageDraw.Draw(out)
        x, y, rh = 6, 6, 0
        for nm, im in dbg:
            big = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
            if x + big.width > out.width:
                x, y, rh = 6, y + rh + 22, 0
            out.paste(big, (x, y + 14), big)
            d.text((x, y), nm, fill=(255, 120, 120))
            x += big.width + 10
            rh = max(rh, big.height)
        out.save(a.board)
        print("판:", a.board)


if __name__ == "__main__":
    main()
