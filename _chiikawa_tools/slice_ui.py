"""초록 바탕 UI 키트 시트(sheets/ui_kit.webp, 1536×1024, #00FF00) 를 부품 PNG 로 잘라 이름을 붙입니다.

  python3 _chiikawa_tools/slice_ui.py                 # ui/ 에 부품 + ui.json + 확인 판(ui/_board.png 는 커밋 안 함 → --board)
  python3 _chiikawa_tools/slice_ui.py --install       # + 자격증 게임 assets/ui/ 에 복사 · index.html 의 ui-kit CSS 블록 다시 씀
  python3 _chiikawa_tools/slice_ui.py --board /tmp/ui_board.png   # 투명 체크무늬 위 확대 판 · 9-slice 늘려 보기

키트 구성(사람이 만든 시트 한 장): 둥근 종이 버튼 4색 × 보통/눌림/비활성 · 마스킹테이프 쪽지 탭 4 · 점선 테두리 ·
찢긴 종이 패널 3 · 말풍선 8 · 리본 3(쓰지 않음 — 흔한 게임 느낌이라 사람이 뺌) · 나무 팻말 3 · 아이콘 15 · 등급 테두리 5.
키트엔 글자가 없어 글자는 화면에서 HTML 로 올립니다.

하는 일
 1) 크로마키 — slice_green.key(초록 쏠림 알파 + 언믹스 + despill) 그대로. 연두 칠이 있는 부품(클로버 · 초록 테이프 탭 ·
    무지개 테두리)은 초록 쏠림 키로 하면 바래므로 slice_green.key_spatial(순수 #00FF00 근처만 바탕).
    둘 다 끝에 경계 2칸 despill(slice_green.despill) — 크림 종이 가장자리에 연두 테가 남지 않게.
 2) 부품 — 아래 PARTS 상자 안의 덩어리(알파 > 0.5)를 모아 알파 테두리로 꼭 맞게 자름. keep="largest" 는 가장 큰 덩어리만
    (노란 탭 옆 반짝 선은 따로 spark 로).
 3) 테이프 — 탭 넷 · 테이프 패널에서 마스킹테이프만 따로(tape_<색>) — 공고 패널 위에 핀 대신 붙임.
    테이프 색 칠(채도 높은 밝은 색) + 그 둘레 3칸(테이프 외곽선)만 남김.
 4) 9-slice 값 — 늘려 쓰는 부품(버튼·탭·패널·말풍선·팻말·등급 테두리·점선 테두리)은 가로·세로로 「모양이 같은 줄」 이
    가장 길게 이어지는 구간을 재서(열마다 위·아래 끝, 줄마다 왼·오른 끝이 가운데와 ±TOL px) 그 바깥을 테두리(slice)로 기록.
    CSS 는 border-image: url(부품) T R B L fill / (T·k)px … 로 씀 (k = 화면 배율, 게임 index.html 의 --ui-k).
 5) 확인 — 불투명 픽셀에 초록이 남았는지(green_left) 부품마다 세고, 연두가 원래 있는 부품 말고는 0 이어야 함.
 6) 흰 종이 보정(--install 때만) — 사람이 「크림색 하지 마」 라고 해서, 자격증 게임에 넣는 사본은 종이 부품(패널·말풍선·
    쪽지 탭·점선 테두리·책 아이콘)의 크림·베이지 칠을 깨끗한 흰색으로 바꿈. 따뜻한 색(색상 15~70°) · 채도 낮음 · 밝음
    세 조건을 부드럽게 곱한 만큼만 무채색 흰색 쪽으로 옮기므로 외곽선·그림자·테이프 색은 그대로. 탭의 테이프는 tape_mask 로 빼고.
    공용 사본(ui/)은 원본 그대로 둠 — 디펜스가 다른 결을 쓸 수 있어서. --paper cream 이면 보정 안 함.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from slice_green import key, key_spatial, despill, checker, green_left  # noqa: E402

SHEET = HERE / "sheets" / "ui_kit.webp"
OUT = HERE / "ui"
GAME_UI = HERE.parent / "assets" / "ui"   # 이 저장소에서는 --install 대신 tools/ui_install.py 를 쓸 것 (index.html 블록은 자격증 게임 형식)

# 이름: (x0, y0, x1, y1) 시트 좌표 상자 · 종류 · 선택
#   kind: slice(9-slice 로 늘려 씀) · icon(그대로) · tape
#   keyer: spatial = 연두 칠이 원래 있는 부품
# 상자는 덩어리 위치를 잰 값(덩어리 bbox)에서 둘레 6px 정도 띄움 — 옆 부품과 겹치지 않게
PARTS = {}


def _add(name, box, kind="slice", **kw):
    PARTS[name] = dict(box=box, kind=kind, **kw)


# 둥근 종이 버튼 4색 × 3줄 (보통 · 눌림 · 비활성)
for col, (x0, x1) in zip(["cream", "yellow", "sky", "pink"], [(30, 202), (220, 389), (404, 572), (585, 752)]):
    for row, (y0, y1) in zip(["", "_down", "_off"], [(38, 123), (124, 207), (207, 289)]):
        _add(f"btn_{col}{row}", (x0, y0, x1, y1), keep="largest")
# 마스킹테이프 쪽지 탭 (위 왼쪽 분홍 · 위 오른쪽 하늘 · 아래 왼쪽 노랑 · 아래 오른쪽 초록)
_add("tab_pink", (784, 33, 975, 144), keep="largest")
_add("tab_sky", (983, 33, 1166, 144), keep="largest")
_add("tab_yellow", (788, 160, 978, 288), keep="largest")
_add("tab_green", (991, 160, 1174, 288), keep="largest", keyer="spatial")
_add("spark", (760, 160, 792, 214), kind="icon")            # 노란 탭 왼쪽 위 반짝 선 세 줄
# 점선 테두리 — 시트에 이미 사각형으로 놓여 있어 통째로 (모서리 4 + 변 4)
_add("dash_frame", (1184, 22, 1515, 308))
# 찢긴 종이 패널
_add("panel_curl", (28, 330, 352, 524), keep="largest")      # 오른쪽 아래가 말린 가로 패널
_add("panel_tape", (364, 321, 562, 520), kind="whole", keep="largest")   # 위 가운데 하늘 테이프 — 늘리면 테이프가 늘어나 통째로만
_add("panel_wide", (572, 330, 898, 523), keep="largest")     # 모서리에 점 넷 — 가장 넓은 패널
# 말풍선 (위 줄 왼→오 · 아래 줄 왼→오)
_add("bubble_oval", (910, 325, 1078, 431))
_add("bubble_small", (1085, 332, 1218, 432))
_add("bubble_shout", (1225, 321, 1361, 437))
_add("bubble_cloud", (1366, 320, 1510, 431))
_add("bubble_think", (909, 436, 1064, 540))
_add("bubble_hex", (1074, 434, 1211, 538))
_add("bubble_round", (1223, 442, 1346, 542))
_add("bubble_jag", (1363, 436, 1512, 530))
# 나무 팻말
_add("sign_post", (888, 545, 1060, 676), keep="largest")
_add("sign_wide", (1087, 548, 1286, 674), keep="largest")
_add("sign_arrow", (1324, 552, 1515, 670), keep="largest")
# 아이콘 15
for name, (x0, x1) in {
    "coin": (20, 106), "clover": (114, 192), "star": (198, 281), "heart": (288, 362), "lock": (378, 447),
    "sound_on": (466, 564), "sound_off": (576, 668), "note": (678, 751), "gear": (760, 846), "back": (854, 940),
    "close": (957, 1030), "book": (1042, 1184), "clock": (1190, 1294), "trophy": (1295, 1410), "crown": (1411, 1516),
}.items():
    _add(f"icon_{name}", (x0, 684, x1, 792), kind="icon", **({"keyer": "spatial"} if name == "clover" else {}))
# 등급 테두리 (안쪽 초록 = 투명)
for name, (x0, x1) in {"gray": (19, 195), "sky": (196, 367), "purple": (368, 540), "yellow": (542, 722), "rainbow": (724, 914)}.items():
    _add(f"frame_{name}", (x0, 807, x1, 979), keep="largest", **({"keyer": "spatial"} if name == "rainbow" else {}))
# 테이프만 (탭·테이프 패널에서) — 공고 패널의 핀 자리
for t, src in {"pink": "tab_pink", "sky": "tab_sky", "yellow": "tab_yellow", "green": "tab_green", "blue": "panel_tape"}.items():
    PARTS[f"tape_{t}"] = dict(box=PARTS[src]["box"], kind="tape", keyer=PARTS[src].get("keyer"))
# 원래 연두가 있어 green_left 가 0 이 아니어도 되는 부품
GREEN_OK = {"tab_green", "tape_green", "icon_clover", "frame_rainbow"}

TOL = 3          # 9-slice: 「모양이 같은 줄」 의 허용 오차(px)
MARGIN = 2       # 잰 구간 안쪽으로 이만큼 더 들여 slice (손그림 흔들림이 늘어나지 않게)


def keyed_sheet():
    c = np.asarray(Image.open(SHEET).convert("RGB")).astype(np.float32)
    out = {}
    for mode, fn in (("chroma", key), ("spatial", key_spatial)):
        f, a = fn(c)
        on = a > 0.5
        # 압축 얼룩이 바탕처럼 읽힌 작은 구멍(40px 이하)은 메움 — 등급 테두리 안쪽 같은 큰 구멍은 그대로
        holes = nd.binary_fill_holes(on) & ~on
        hl, hn = nd.label(holes)
        if hn:
            hs = nd.sum(holes, hl, range(1, hn + 1))
            small = np.isin(hl, 1 + np.nonzero(hs <= 40)[0])
            a = np.where(small, 1.0, a)
            on = on | small
        f = despill(f, a, on)
        # 반투명 가장자리 색은 가장 가까운 불투명 픽셀 색으로 (색 번짐) — 언믹스가 남긴 보라·연두 기운이
        # 크림 바탕 위에서 테로 보이지 않게. 매끈함은 알파가 그대로 맡음
        solid = a >= 0.9
        _, (iy, ix) = nd.distance_transform_edt(~solid, return_indices=True)
        f = np.where(solid[..., None], f, f[iy, ix])
        a = np.where(a < 0.04, 0, a)
        out[mode] = (f, a)
    return out


# 흰 종이 보정을 받는 부품 (버튼·테이프·나무 팻말·등급 테두리·다른 아이콘은 원래 색)
WHITEN = lambda n: n.startswith(("panel_", "bubble_", "tab_")) or n in ("dash_frame", "icon_book")


def whiten(im, name):
    """크림·베이지 종이 칠 → 깨끗한 흰 종이 (RGBA uint8 배열을 받아 새 배열).
    w = 밝기(150→200) × 낮은 채도(<0.30) × 따뜻한 색상(15~70°) — 셋 다 부드러운 경사라 경계에 테가 생기지 않음.
    밝기는 255 쪽으로 조금 당겨(종이 결의 얼룩은 남기되 옅게) 아주 살짝 푸른 흰색으로."""
    c = im[..., :3].astype(float)
    al = im[..., 3] / 255.0
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = c @ [0.3, 0.59, 0.11]
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    w = np.clip((lum - 150) / 50, 0, 1) * np.clip((0.30 - sat) / 0.10, 0, 1)
    w *= np.clip(1 - np.maximum(15 - hue, hue - 70) / 12, 0, 1) * (mx - mn > 1) + (mx - mn <= 1)
    if name.startswith("tab_"):
        tm = tape_mask(c, al)
        if tm is not None:
            w = np.where(nd.binary_dilation(tm, iterations=2), 0, w)
    t = 255 - (255 - lum) * 0.55
    target = np.stack([t - 3, t - 1, t], -1)
    out = c * (1 - w[..., None]) + target * w[..., None]
    return np.dstack([np.clip(out, 0, 255), im[..., 3]]).astype(np.uint8)


def tape_mask(rgb, alpha):
    """테이프 = 채도 높은 밝은 칠(분홍·하늘·노랑·초록) 덩어리 중 가장 큰 것 + 둘레 3칸(외곽선)."""
    c = rgb.astype(float)
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    paint = (alpha > 0.5) & (sat > 0.22) & (mx > 120)
    lab, n = nd.label(paint)
    if not n:
        return None
    sizes = nd.sum(paint, lab, range(1, n + 1))
    m = lab == int(np.argmax(sizes)) + 1
    m = nd.binary_fill_holes(m)
    return nd.binary_dilation(m, iterations=3) & (alpha > 0.04)


def cut(keyed, name, spec):
    f, a = keyed["spatial" if spec.get("keyer") == "spatial" else "chroma"]
    x0, y0, x1, y1 = spec["box"]
    rgb, al = f[y0:y1, x0:x1], a[y0:y1, x0:x1].copy()
    on = al > 0.5
    if spec["kind"] == "tape":
        m = tape_mask(rgb, al)
        keep = m
    else:
        lab, n = nd.label(nd.binary_dilation(on, iterations=2), structure=np.ones((3, 3)))
        if spec.get("keep") == "largest" and n > 1:
            sizes = nd.sum(on, lab, range(1, n + 1))
            keep = lab == int(np.argmax(sizes)) + 1
        else:
            # 4px 이하 잡티는 뺌
            sizes = nd.sum(on, lab, range(1, n + 1))
            keep = np.isin(lab, 1 + np.nonzero(sizes > 4)[0])
    al = np.where(keep, al, 0)
    ys, xs = np.nonzero(al > 0.04)
    yy0, yy1, xx0, xx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    im = np.dstack([np.clip(rgb, 0, 255), np.clip(al * 255, 0, 255)])[yy0:yy1, xx0:xx1].astype(np.uint8)
    return im, (x0 + xx0, y0 + yy0)


def longest_run(flags):
    best, cur, start, bs = 0, 0, 0, 0
    for i, v in enumerate(flags):
        if v:
            if cur == 0:
                start = i
            cur += 1
            if cur > best:
                best, bs = cur, start
        else:
            cur = 0
    return bs, bs + best


def measure_slice(im):
    """9-slice 테두리 [위, 오른, 아래, 왼](원본 px).
    열마다 불투명(알파>0.5) 위·아래 끝을 재서, 가운데 열과 ±TOL 인 열이 가장 길게 이어지는 구간 = 가로로 늘려도 되는 곳.
    줄도 같은 식(왼·오른 끝). 그 구간 바깥 + MARGIN 이 slice."""
    on = im[..., 3] > 127
    H, W = on.shape

    def ends(mask, axis):
        n = mask.shape[1 - axis] if axis == 0 else mask.shape[0]
        idx = np.arange(mask.shape[axis])
        has = mask.any(axis=axis)
        lo = np.where(has, np.argmax(mask, axis=axis), -999)
        hi = np.where(has, mask.shape[axis] - 1 - np.argmax(np.flip(mask, axis=axis), axis=axis), -999)
        return lo, hi

    top, bot = ends(on, 0)          # 열마다
    lef, rig = ends(on, 1)          # 줄마다
    cx, cy = W // 2, H // 2
    # 가운데 기준은 가운데 ±W/6 열의 중앙값 (가운데에 테이프·기둥이 있어도 흔들리지 않게)
    ref_t, ref_b = np.median(top[W // 3: 2 * W // 3]), np.median(bot[W // 3: 2 * W // 3])
    ref_l, ref_r = np.median(lef[H // 3: 2 * H // 3]), np.median(rig[H // 3: 2 * H // 3])
    fx = (np.abs(top - ref_t) <= TOL) & (np.abs(bot - ref_b) <= TOL)
    fy = (np.abs(lef - ref_l) <= TOL) & (np.abs(rig - ref_r) <= TOL)
    # 고리 모양(등급 테두리·점선 테두리)은 안쪽 구멍 가장자리까지가 테두리 — 띠가 늘어나지 않게
    holes = nd.binary_fill_holes(on) & ~on
    hl, hn = nd.label(holes)
    hole = None
    if hn:
        hs = nd.sum(holes, hl, range(1, hn + 1))
        if hs.max() > 0.1 * on.sum():
            hy, hx = np.nonzero(hl == int(np.argmax(hs)) + 1)
            hole = (hy.min(), W - hx.max(), H - hy.max(), hx.min())   # 위 오른 아래 왼 = 띠 두께
    a, b = longest_run(fx)
    c, d = longest_run(fy)
    L, R = a + MARGIN, W - b + MARGIN
    T, B = c + MARGIN, H - d + MARGIN
    if hole is not None:
        T, R, B, L = max(T, hole[0] + MARGIN), max(R, hole[1] + MARGIN), max(B, hole[2] + MARGIN), max(L, hole[3] + MARGIN)
    # 안쪽의 짙은 그림(패널 모서리 못 자국 · 말린 귀퉁이 선)이 가장자리 35% 안에 있으면 그것까지 테두리로 —
    # 안 그러면 늘어나는 띠에 끼어 세로 줄무늬로 번짐
    lum = im[..., :3].astype(float) @ [0.3, 0.59, 0.11]
    dy, dx = np.nonzero(nd.binary_erosion(on, iterations=8) & (lum < 120))
    for yv, xv in zip(dy, dx):
        if yv < 0.35 * H:
            T = max(T, yv + 1 + MARGIN)
        if H - yv < 0.35 * H:
            B = max(B, H - yv + MARGIN)
        if xv < 0.35 * W:
            L = max(L, xv + 1 + MARGIN)
        if W - xv < 0.35 * W:
            R = max(R, W - xv + MARGIN)
    # 늘릴 가운데가 최소 2px 은 남게
    if L + R > W - 2:
        L = R = (W - 2) // 2
    if T + B > H - 2:
        T = B = (H - 2) // 2
    return [int(T), int(R), int(B), int(L)]


def nine(im, sl, w, h):
    """PIL 로 9-slice 늘리기 (확인 판용 — CSS border-image stretch 와 같은 셈)."""
    T, R, B, L = sl
    H, W = im.shape[:2]
    src = Image.fromarray(im, "RGBA")
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    xs_s, xs_d = [0, L, W - R, W], [0, L, w - R, w]
    ys_s, ys_d = [0, T, H - B, H], [0, T, h - B, h]
    for i in range(3):
        for j in range(3):
            sx0, sx1, dx0, dx1 = xs_s[j], xs_s[j + 1], xs_d[j], xs_d[j + 1]
            sy0, sy1, dy0, dy1 = ys_s[i], ys_s[i + 1], ys_d[i], ys_d[i + 1]
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            out.alpha_composite(src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS), (dx0, dy0))
    return out


def board(parts, meta, dst):
    """투명 체크무늬 위: 부품 전부(원본 크기) · 가장자리 4배 확대 몇 개 · 9-slice 늘려 보기."""
    pad = 14
    rows, x, y, rowh, W = [], pad, pad, 0, 1600
    place = {}
    for n, im in parts.items():
        h, w = im.shape[:2]
        if x + w + pad > W:
            x, y, rowh = pad, y + rowh + 26, 0
        place[n] = (x, y)
        x += w + pad
        rowh = max(rowh, h)
    y += rowh + 40
    zoom_names = ["btn_cream", "tab_yellow", "panel_wide", "bubble_round", "icon_clover", "frame_rainbow", "tape_green", "sign_wide"]
    zoom_y = y
    y += 4 * 60 + 40
    st_y = y
    y += 8 * 190
    can = checker(W, y)
    d = ImageDraw.Draw(can)
    for n, im in parts.items():
        px, py = place[n]
        can.alpha_composite(Image.fromarray(im, "RGBA"), (px, py))
        g = meta[n].get("green_left", 0)
        d.text((px, py + im.shape[0] + 2), f"{n}" + (f" G{g}" if g else ""), fill=(200, 0, 0) if g and n not in GREEN_OK else (40, 40, 40))
    # 가장자리 확대 — 왼쪽 위 60×60 을 ×4 (nearest)
    zx = pad
    for n in zoom_names:
        im = Image.fromarray(parts[n], "RGBA")
        cr = im.crop((0, 0, min(60, im.width), min(60, im.height)))
        big = cr.resize((cr.width * 4, cr.height * 4), Image.NEAREST)
        can.alpha_composite(big, (zx, zoom_y))
        d.text((zx, zoom_y + big.height + 2), n + " ×4", fill=(40, 40, 40))
        zx += big.width + 12
        if zx > W - 250:
            break
    # 9-slice 늘려 보기 — 같은 부품을 좁게·넓게·높게
    sx, sy = pad, st_y
    for n in [k for k in parts if meta[k]["kind"] == "slice" and not (k.startswith("btn_") and k not in ("btn_yellow", "btn_yellow_down"))]:
        im = parts[n]
        sl = meta[n]["slice"]
        h, w = im.shape[:2]
        for (ww, hh) in [(int(w * 1.8), h), (w, int(h * 1.5))]:
            ww, hh = max(ww, sl[1] + sl[3] + 4), max(hh, sl[0] + sl[2] + 4)
            img = nine(im, sl, ww, hh)
            if img.height > 180:
                k = 180 / img.height
                img = img.resize((int(img.width * k), 180), Image.LANCZOS)
            if sx + img.width + pad > W:
                sx, sy = pad, sy + 190
            if sy + 190 > can.height:
                break
            can.alpha_composite(img, (sx, sy))
            sx += img.width + 10
    can.convert("RGB").save(dst)
    print("판:", dst)


CSS_START, CSS_END = "/* ui-kit:start — slice_ui.py --install 이 씀, 손으로 고치지 않음 */", "/* ui-kit:end */"


def css_block(meta, base="assets/ui/"):
    """9-slice 부품마다 .k-<이름> 클래스(변수 넷) + 버튼 상태(눌림·비활성 그림으로 바꾸기).
    쓰는 쪽(index.html)은 .kit::before 하나가 이 변수로 border-image 를 그리고, --uk(원본 px → 화면 px) 만 자리마다 정함."""
    def vars_(n):
        T, R, B, L = meta[n]["slice"]
        return f"--src:url({base}{n}.png);--sl:{T} {R} {B} {L};--t:{T}px;--r:{R}px;--b:{B}px;--l:{L}px"
    lines = [CSS_START]
    for n, m in meta.items():
        if m["kind"] == "slice":
            lines.append(f".k-{n}{{{vars_(n)}}}")
    for col in ["cream", "yellow", "sky", "pink"]:
        lines.append(f".k-btn_{col}:active:not([disabled]),.k-btn_{col}.is-down{{{vars_(f'btn_{col}_down')}}}")
        lines.append(f".k-btn_{col}[disabled],.k-btn_{col}.is-off{{{vars_(f'btn_{col}_off')}}}")
    lines.append(CSS_END)
    return "\n".join(lines)


def write_css(meta, html):
    t = html.read_text()
    i, j = t.find(CSS_START), t.find(CSS_END)
    if i < 0 or j < 0:
        raise SystemExit(f"{html} 의 <style> 안에 다음 두 줄을 먼저 넣으세요:\n{CSS_START}\n{CSS_END}")
    html.write_text(t[:i] + css_block(meta) + t[j + len(CSS_END):])
    print("CSS:", html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", action="store_true", help="자격증 게임 assets/ui/ 에도 복사")
    ap.add_argument("--board", metavar="PNG", help="투명 체크무늬 위 확대 판 · 9-slice 늘려 보기")
    ap.add_argument("--paper", choices=["white", "cream"], default="white", help="게임 사본의 종이 색 (기본 white — 사람이 크림을 뺌)")
    a = ap.parse_args()
    keyed = keyed_sheet()
    OUT.mkdir(exist_ok=True)
    parts, meta = {}, {}
    for n, spec in PARTS.items():
        im, (ox, oy) = cut(keyed, n, spec)
        parts[n] = im
        h, w = im.shape[:2]
        m = {"file": f"{n}.png", "w": w, "h": h, "kind": spec["kind"], "sheet_xy": [int(ox), int(oy)]}
        if spec["kind"] == "slice":
            m["slice"] = measure_slice(im)
            if n.startswith("tab_"):
                # 탭은 왼쪽 위 테이프가 늘어나지 않게: 왼쪽 slice 가 테이프 오른 끝 · 위 slice 가 테이프 아래 끝을 넘게
                tm = tape_mask(im[..., :3].astype(float), im[..., 3] / 255.0)
                ty, tx = np.nonzero(tm)
                T, R, B, L = measure_slice(im[:, tx.max() + 1:])     # 테이프 오른쪽 종이만 다시 잼
                L = int(tx.max() + 1 + L)
                m["slice"] = [int(max(T, ty.max() + 1 + MARGIN)), R, B, L]
                m["tape_box"] = [int(tx.min()), int(ty.min()), int(tx.max() + 1), int(ty.max() + 1)]
        m["green_left"] = green_left(im)
        meta[n] = m
        Image.fromarray(im, "RGBA").save(OUT / f"{n}.png", optimize=True)
    bad = {n: m["green_left"] for n, m in meta.items() if m["green_left"] and n not in GREEN_OK}
    doc = {
        "_": "slice_ui.py 가 만듦 — 손으로 고치지 않음. slice = 9-slice 테두리 [위, 오른, 아래, 왼] 원본 px "
             "(CSS: border-image-source 이 PNG · border-image-slice 이 값 fill · border-width 는 이 값 × 화면 배율). "
             "green_left = 불투명 픽셀 중 초록이 남은 수(연두가 원래 있는 부품 말고는 0).",
        "sheet": "sheets/ui_kit.webp",
        "parts": meta,
    }
    (OUT / "ui.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print(f"부품 {len(parts)}개 → {OUT}")
    for n, m in meta.items():
        print(f"  {n:16s} {m['w']:4d}×{m['h']:<4d} {m['kind']:5s} {m.get('slice', '')} {('초록 ' + str(m['green_left'])) if m['green_left'] else ''}")
    if bad:
        print("⚠ 초록이 남은 부품:", bad)
    if a.install:
        GAME_UI.mkdir(parents=True, exist_ok=True)
        for old in GAME_UI.glob("*.png"):
            old.unlink()
        for n in parts:
            if a.paper == "white" and WHITEN(n):
                Image.fromarray(whiten(parts[n], n), "RGBA").save(GAME_UI / f"{n}.png", optimize=True)
            else:
                shutil.copy(OUT / f"{n}.png", GAME_UI / f"{n}.png")
        if a.paper == "white":
            print("흰 종이 보정:", ", ".join(n for n in parts if WHITEN(n)))
        shutil.copy(OUT / "ui.json", GAME_UI / "ui.json")
        write_css(meta, GAME_UI.parent.parent / "index.html")
        print("설치:", GAME_UI)
    if a.board:
        board(parts, meta, a.board)


if __name__ == "__main__":
    main()
