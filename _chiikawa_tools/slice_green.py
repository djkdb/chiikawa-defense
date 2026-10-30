"""초록 바탕 캐릭터 시트(1536×1024, #00FF00 크로마키) 여덟 장을 프레임 PNG 로 잘라 두 게임에 넣습니다.

  python3 _chiikawa_tools/slice_green.py --board /tmp/green_board.png   # 잘라서 판만 (게임 안 건드림)
  python3 _chiikawa_tools/slice_green.py --install                      # 두 게임 assets/chars/<이름>/ 에 넣기
  python3 _chiikawa_tools/slice_green.py --install --style smooth       # 도트 변환 대신 원본을 부드럽게 줄인 것

재료: sheets/green_<이름>.webp — 사람이 새로 만든 같은 그림체·같은 격자의 시트 여덟 장
  (치이카와 · 하치와레 · 우사기 · 시사 · 모몽가 · 랏코 · 풍뎅이 · 쿠리만쥬). 여덟 명 모두 같은 함수·같은 설정으로 뽑음
  (크로마키만 풍뎅이는 공간 키 — 이펙트가 연두라서, 아래 1)).
  시트 구성: 왼쪽 위 큰 정면 그림 1 + 줄 7개(라벨은 왼쪽 바깥 흰 글씨)
    대기 8 · 걷기 8(왼쪽을 봄) · 공격 8(무기·휘두름 이펙트) · 피격 8 · 스킬 8(이펙트 포함) · 감정 8 · 공격 이펙트 8.
  여덟 장의 칸 위치가 같아 한 격자(ROWS · COLS)로 자릅니다.

하는 일
 1) 크로마키 — 픽셀마다 「초록 쏠림」 g = G − max(R, B) 를 재고, 바탕(g≈243)과 무채색 사이 어디쯤인지로 알파를 셈
    (알파 = 1 − g / 바탕 g). 그다음 바탕 초록을 빼서 원래 색을 되살림(언믹스: (P − (1−a)·초록) / a).
    흰 몸 가장자리의 연두빛 픽셀은 「흰색 + 초록이 반쯤」 이라 흰색으로 돌아오고, 검은 외곽선 옆 짙은 초록은 「검정 + 초록」 이라
    알파가 낮아져 빠짐. 발밑 짙은 초록 그림자도 g 가 커서 함께 빠짐.
    하늘색·노랑·분홍 이펙트는 G 가 R 이나 B 보다 크지 않아(g ≤ 0) 알파 1 그대로 남음.
    반투명 가장자리는 가까운 불투명 색 쪽으로 다시 재고(언믹스), G 는 그 색의 초록 쏠림까지만 남김(despill).
    풍뎅이는 잎·빛이 연두라 위 방식이면 회색·노랑으로 바래서 key_spatial — 순수 #00FF00 근처만 바탕으로 보고
    바탕에서 1px 안쪽은 그림 그대로, 맞닿은 1px 테두리만 언믹스, 발밑 진초록 그림자는 옆에 연두 칠이 없는 덩어리로 골라 지움.
 2) 칸 나누기 — 알파 덩어리(8방향)를 찾아 무게중심으로 줄·칸을 정함. 휘두름 궤적이 옆 칸 무기와 붙어 한 덩어리면
    칸 경계에서 픽셀 단위로 나눔. 대기·걷기·정면 그림은 몸 덩어리만(발 먼지·떨어진 잡티 뺌), 나머지는 이펙트까지.
 3) 걷기는 시트에서 왼쪽을 봐서 잘라 뒤집어 둠 — 게임은 「오른쪽을 보는 그림 + 왼쪽이면 좌우 반전」.
    공격은 오른쪽으로 찌르며 끝나므로(4~6번) 그대로. 랏코는 시트 전체가 왼쪽 3/4 얼굴(흉터 쪽)이라 걷기만 뒤집히고 나머지는 그린 그대로.
 4) 발 기준점 — 몸 덩어리를 둥근 판(반지름 OPEN_R)으로 열어(opening) 가는 무기·궤적을 떼어 낸 「몸통」 의 가로 가운데 ·
    그 몸통 밑 줄. 프레임마다 크기가 달라도 이 점을 발밑에 두면 걸을 때 출렁이지 않음.
 5) 크기 — 여덟 장이 같은 그림체라 한 배율로 줄임: 치이카와 대기 몸 높이(중앙값)를 DOT_H 칸으로.
    그래서 귀 긴 우사기는 조금 크고, 갈기 있는 시사는 조금 넓게 — 시트에 그려진 키 차이를 그대로 둠.
    게임 단위 k = TARGET_H / DOT_H (= 0.5, 28 단위 키 — 옛 그림인 랏코·풍뎅이·쿠리만쥬와 같은 키).
 6) 도트 변환(기본, --style pixel) — 알파를 곱한 채 면적 평균 축소 → 알파 0/255 → 캐릭터마다 뽑은 팔레트로 고정.
    여덟 명 모두 같은 함수·같은 설정. --style smooth 는 같은 크기로 부드럽게 줄인 원본(비교 판에서 고른 근거는 README).
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

HERE = Path(__file__).resolve().parent
SHEETS = HERE / "sheets"
GAMES = [HERE.parent]
NAMES = ["chiikawa", "hachiware", "usagi", "shisa", "momonga", "rakko", "pungdengi", "kurimanju"]
KOR = {"chiikawa": "치이카와", "hachiware": "하치와레", "usagi": "우사기", "shisa": "시사", "momonga": "모몽가",
       "rakko": "랏코", "pungdengi": "풍뎅이", "kurimanju": "쿠리만쥬"}
# 이펙트가 연두·초록이라 「초록 쏠림」 키로는 잎·빛이 회색·노랑으로 바래는 시트 → 공간 키(key_spatial).
# 다른 시트에 공간 키를 쓰면 외곽선 옆 초록 얼룩이 남아(확인 판) 쓰지 않음
SPATIAL = {"pungdengi"}

TARGET_H = 28     # 게임 안 서 있는 키(단위) — 옛 시트 친구들(25~33칸)과 같은 키
DOT_H = 56        # 치이카와 대기 몸 높이를 이 칸 수로 (= TARGET_H × 2 → 게임 2배 자리에서 그림 1칸 = 화면 1칸)

# 격자 (시트 여덟 장 공통 — 덩어리 위치를 재서 칸 사이 가운데로 끊은 값)
ROWS = [("idle", 90, 245), ("walk", 245, 372), ("attack", 372, 503), ("hit", 503, 624),
        ("skill", 624, 752), ("emo", 752, 889), ("fx", 889, 1015)]
COLS = [330, 487, 632, 773, 913, 1054, 1197, 1345, 1536]
PORTRAIT_BOX = (0, 0, 330, 290)       # 왼쪽 위 큰 정면 그림 (라벨 「대기」 는 x 255 부터라 몸 덩어리만 남김)
BODY_ONLY = {"idle", "walk", "portrait"}
MIRROR = {"walk"}
# 감정 줄 순서 (시트 왼쪽부터) — 파일 이름 emo_<이름>
EMO_NAMES = ["joy", "surprise", "cry", "angry", "love", "sleep", "wink", "sulk"]
# 공격 이펙트 줄 순서 — 게임은 번호(fx_0..7)로 부르고, 뜻은 여기 한 곳에
FX_NAMES = ["burst", "crescent", "explode", "swirl", "sparkle", "dash", "ring", "rise"]

GREEN_G = 243.0                       # 바탕의 초록 쏠림 (G − max(R,B)) — 시트 여덟 장 모두 241~247
BG_RGB = np.array([3.0, 247.0, 4.0])
OPEN_R = 13                           # 발 기준점용 몸통 찾기: 이보다 가는 것(무기 자루·궤적·귀 끝)은 몸통이 아님
INK = np.array([30, 24, 26])


def load(name):
    return np.asarray(Image.open(SHEETS / f"green_{name}.webp").convert("RGB")).astype(np.float32)


def key(c):
    """크로마키: RGB(float) → (언믹스한 RGB, 알파 0..1).
    1차 알파 = 1 − g / 바탕 g (원래 색이 무채색이라고 보고). 분홍·하늘색 빛처럼 원래 색이 초록 반대쪽이면 1차 알파가
    너무 커서 색이 탁한 노랑으로 돌아오므로, 반투명 픽셀은 가까운(4칸 안) 불투명 픽셀 색 F 를 「원래 색」 으로 보고
    바탕→F 선분에 투영해 알파를 다시 셈: a = (P−BG)·(F−BG) / |F−BG|².
    그다음 언믹스((P − (1−a)·BG) / a)로 색을 되살리고, G 는 F 의 초록 쏠림만큼까지만 남김(despill)."""
    g = c[..., 1] - np.maximum(c[..., 0], c[..., 2])
    a0 = np.clip(1 - g / GREEN_G, 0, 1)
    solid = g <= 6
    a0[solid] = 1
    semi = (a0 > 0.02) & ~solid
    dist, (iy, ix) = nd.distance_transform_edt(~solid, return_indices=True)
    F = c[iy, ix]
    near = semi & (dist <= 4)
    d = F - BG_RGB
    a1 = ((c - BG_RGB) * d).sum(-1) / np.maximum((d * d).sum(-1), 1)
    a = a0.copy()
    a[near] = np.clip(a1[near], 0, 1)
    aa = np.maximum(a, 1e-3)[..., None]
    f = np.clip((c - (1 - a)[..., None] * BG_RGB) / aa, 0, 255)
    gF = np.where(near, np.maximum(F[..., 1] - np.maximum(F[..., 0], F[..., 2]), 0), 0)
    lim = np.maximum(f[..., 0], f[..., 2]) + gF
    f[..., 1] = np.where(~solid, np.minimum(f[..., 1], lim), f[..., 1])
    return f, a


BG_NEAR = 46          # 공간 키: 바탕 초록과 이만큼(RGB 거리) 가까우면 「확실한 바탕」


def key_spatial(c):
    """공간 키 — 초록 이펙트가 있는 시트(풍뎅이: 연두 잎·빛, 진초록 잎 외곽선)용.
    픽셀 하나만 보고는 「진초록 잎 외곽선 (0,96,0)」 과 「검정 외곽선 + 바탕 반쯤」 · 「발밑 그림자」 를 가를 수 없어서 자리로 가름:
      1) 확실한 바탕 = 바탕 초록과 RGB 거리 < BG_NEAR (순수 #00FF00 근처만 — 키 범위를 좁게)
      2) 바탕에서 1px 넘게 안쪽(거리 ≥ 1.5)은 「진짜 그림」 — 원래 색 그대로 불투명 (연두 잎 속·빛도 남음)
      3) 바탕에 맞닿은 1px 테두리만 가까운 안쪽 색 F 를 원래 색으로 보고 바탕→F 선분에 투영해 알파·색을 되살림 + despill
      4) 발밑 그림자 = 「바탕을 어둡게 한 색」(R·B 가 낮고 G 만 높음) 덩어리 가운데 옆에 밝은 연두 칠이 없는 것 → 지움
         (잎 외곽선은 속에 연두 칠이 있어 남음)."""
    d = np.sqrt(((c - BG_RGB) ** 2).sum(-1))
    bg = d < BG_NEAR
    dist = nd.distance_transform_edt(~bg)
    inner = (~bg) & (dist >= 1.5)
    _, (iy, ix) = nd.distance_transform_edt(~inner, return_indices=True)
    F = c[iy, ix]
    dF = F - BG_RGB
    a1 = np.clip(((c - BG_RGB) * dF).sum(-1) / np.maximum((dF * dF).sum(-1), 1), 0, 1)
    a = np.where(inner, 1.0, np.where(bg, 0.0, a1))
    aa = np.maximum(a, 1e-3)[..., None]
    f = np.where(inner[..., None], c, np.clip((c - (1 - a)[..., None] * BG_RGB) / aa, 0, 255))
    band = (~bg) & ~inner
    gF = np.maximum(F[..., 1] - np.maximum(F[..., 0], F[..., 2]), 0)
    lim = np.maximum(f[..., 0], f[..., 2]) + gF
    f[..., 1] = np.where(band, np.minimum(f[..., 1], lim), f[..., 1])
    # 발밑 그림자: 어두운 초록(바탕 × 0.3~0.95) 덩어리 중 둘레 2px 안에 밝은 연두 칠(잎 속)이 없는 것
    R, Gc, B = c[..., 0], c[..., 1], c[..., 2]
    shade = (~bg) & (np.maximum(R, B) < 60) & (Gc > np.maximum(R, B) + 45) & (Gc < 238)
    leaf = (~bg) & (Gc > 150) & (R > 70) & (R < 215) & (B < 140) & (Gc > R + 15)
    lab, n = nd.label(shade, structure=np.ones((3, 3)))
    if n:
        near_leaf = nd.binary_dilation(leaf, iterations=2)
        has = nd.maximum(near_leaf, lab, range(1, n + 1))
        drop = np.isin(lab, 1 + np.nonzero(np.asarray(has) == 0)[0])
        a = np.where(drop, 0.0, a)
    return f, a


def despill(f, a, on):
    """알파 경계 2칸 안쪽은 G 를 max(R,B) 로 — 흰 몸·외곽선 가장자리에 연두 테가 남지 않게.
    안쪽 픽셀(초록 잎·연두 반짝이처럼 원래 G 가 큰 색)은 건드리지 않음."""
    edge = on & ~nd.binary_erosion(on, np.ones((5, 5)), border_value=0)
    m = np.maximum(f[..., 0], f[..., 2])
    f = f.copy()
    f[..., 1] = np.where(edge, np.minimum(f[..., 1], m), f[..., 1])
    return f


def opened(m, r=OPEN_R):
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    return nd.binary_opening(m, structure=(xx * xx + yy * yy) <= r * r)


def cut_sheet(sheet, spatial=False):
    """시트 한 장 → {동작: [RGBA(uint8) …]} (원본 해상도). 걷기는 뒤집어 둠."""
    f, a = (key_spatial if spatial else key)(sheet)
    on = a > 0.5
    # 몸 속 작은 구멍(웹p 압축 얼룩이 바탕처럼 읽힌 1~몇 px)은 메움 — 40px 넘는 구멍(팔 사이 등)은 그대로
    holes = nd.binary_fill_holes(on) & ~on
    hl, hn = nd.label(holes)
    if hn:
        hs = nd.sum(holes, hl, range(1, hn + 1))
        small = np.isin(hl, 1 + np.nonzero(hs <= 40)[0])
        a = np.where(small, 1.0, a)
        on = on | small
    f = despill(f, a, on)
    H, W = on.shape
    out = {r[0]: [None] * 8 for r in ROWS}

    def rgba(mask, box=None):
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        al = np.where(mask, np.clip(a * 255, 0, 255), 0)[y0:y1, x0:x1]
        rgb = f[y0:y1, x0:x1]
        return np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8)

    # 정면 큰 그림: 왼쪽 위 상자 안 가장 큰 덩어리
    px0, py0, px1, py1 = PORTRAIT_BOX
    sub = np.zeros_like(on)
    sub[py0:py1, px0:px1] = on[py0:py1, px0:px1]
    lab, n = nd.label(sub, structure=np.ones((3, 3)))
    sizes = nd.sum(sub, lab, range(1, n + 1))
    out["portrait"] = [rgba(lab == int(np.argmax(sizes)) + 1)]

    # 격자 칸: 덩어리마다 무게중심으로 줄·칸을 정하고, 칸 경계를 넘는 덩어리는 경계에서 나눔
    grid = on.copy()
    grid[:, :COLS[0]] = False
    lab, n = nd.label(grid, structure=np.ones((3, 3)))
    cells = {}
    for i, sl in enumerate(nd.find_objects(lab), start=1):
        comp = lab[sl] == i
        sz = int(comp.sum())
        if sz < 6:
            continue
        ys, xs = np.nonzero(comp)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        cy = ys.mean()
        r = next((k for k, (_, y0, y1) in enumerate(ROWS) if y0 <= cy < y1), None)
        if r is None:
            continue
        col_of = np.searchsorted(COLS, xs, side="right") - 1
        col_of = np.clip(col_of, 0, 7)
        cnt = np.bincount(col_of, minlength=8)
        if cnt.max() >= 0.85 * sz:
            cols = np.full_like(col_of, int(cnt.argmax()))
        else:
            cols = col_of
        for c in np.unique(cols):
            sel = cols == c
            cells.setdefault((r, int(c)), []).append((ys[sel], xs[sel]))
    for (r, c), parts in cells.items():
        act = ROWS[r][0]
        m = np.zeros_like(on)
        for ys, xs in parts:
            m[ys, xs] = True
        if act in BODY_ONLY:
            l2, n2 = nd.label(m, structure=np.ones((3, 3)))
            s2 = nd.sum(m, l2, range(1, n2 + 1))
            m = l2 == int(np.argmax(s2)) + 1
        else:
            # 잡티(4px 이하) 빼기
            l2, n2 = nd.label(m, structure=np.ones((3, 3)))
            s2 = nd.sum(m, l2, range(1, n2 + 1))
            m = np.isin(l2, 1 + np.nonzero(s2 > 4)[0])
        im = rgba(m)
        if act in MIRROR:
            im = np.ascontiguousarray(im[:, ::-1])
        out[act][c] = im
    return out


def body_anchor(rgba):
    """발 기준점 [ax, ay](원본 px) · 몸통 높이. 몸통 = 가장 큰 덩어리를 둥근 판으로 열어 가는 것을 뗀 것."""
    on = rgba[..., 3] > 127
    lab, n = nd.label(on, structure=np.ones((3, 3)))
    sizes = nd.sum(on, lab, range(1, n + 1))
    main = lab == int(np.argmax(sizes)) + 1
    core = opened(main)
    if core.sum() < 200:
        core = main
    l2, n2 = nd.label(core)
    if n2 > 1:
        s2 = nd.sum(core, l2, range(1, n2 + 1))
        core = l2 == int(np.argmax(s2)) + 1
    ys, xs = np.nonzero(core)
    top, bot = ys.min(), ys.max()
    # 가로 가운데: 몸통 위 65%(발·꼬리 빼고 머리·몸)의 좌우 끝 가운데
    band = core & (np.arange(on.shape[0])[:, None] <= top + (bot - top) * 0.65)
    bx = np.nonzero(band)[1]
    cx = (bx.min() + bx.max() + 1) / 2
    # 발 줄: 몸통 가로 범위 안에서 원래 덩어리의 맨 아래(열기로 깎인 발끝을 되살림). 3칸 이상 차 있는 줄만
    x0, x1 = xs.min(), xs.max() + 1
    cand = main[:, x0:x1]
    rows = np.nonzero(cand.sum(1) >= 3)[0]
    feet = rows[rows <= bot + OPEN_R].max() if len(rows) else bot
    return [round(float(cx), 1), int(feet) + 1], int(feet - top + 1)


def premul_resize(rgba, k):
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    f = rgba.astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    im = Image.fromarray((f * 255 + 0.5).astype(np.uint8), "RGBA")
    r = np.asarray(im.resize((nw, nh), Image.BOX)).astype(np.float32) / 255
    al = r[..., 3:4]
    rgb = np.where(al > 0.01, r[..., :3] / np.maximum(al, 1e-3), 0)
    return np.clip(rgb, 0, 1), al[..., 0]


def smooth(rgba, k):
    """부드러운 축소(비교·--style smooth 용) — 알파를 곱한 채 LANCZOS."""
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    f = rgba.astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    im = Image.fromarray((f * 255 + 0.5).astype(np.uint8), "RGBA").resize((nw, nh), Image.LANCZOS)
    r = np.asarray(im).astype(np.float32) / 255
    al = r[..., 3:4]
    rgb = np.where(al > 0.01, r[..., :3] / np.maximum(al, 1e-3), 0)
    return (np.dstack([np.clip(rgb, 0, 1), al]) * 255 + 0.5).astype(np.uint8)


def make_palette(frames, k_dot, n=26):
    """캐릭터 한 명의 모든 프레임(축소 후 불투명 칸)에서 대표색 n 개 + 외곽선·흰색 고정."""
    import cv2
    pts = []
    for rgba in frames:
        rgb, al = premul_resize(rgba, k_dot)
        pts.append((rgb * 255)[al > 0.5])
    P = np.concatenate(pts).astype(np.float32)
    rng = np.random.default_rng(0)
    if len(P) > 80000:
        P = P[rng.choice(len(P), 80000, replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    cv2.setRNGSeed(0)
    _, _, cent = cv2.kmeans(P, n, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    fixed = np.array([INK, [255, 253, 250]], np.float32)
    keep = [c for c in cent if np.sqrt(((fixed - c) ** 2).sum(1)).min() > 20]
    return np.vstack([fixed, np.array(keep)]).astype(np.float32)


def pixelize(rgba, k, palette, dark_keep=0.34):
    """도트 변환: 면적 평균 축소 → 알파 0/255 → 팔레트 고정.
    외곽선 지키기 — 이 시트는 얼굴 쪽 외곽선이 1~2px 로 가늘어 그냥 평균 내면 흰 몸과 섞여 회색 → 흰색으로 사라짐
    (걸을 때 얼굴 쪽 테두리가 뚫려 보임). 그래서 칸마다 「짙은 픽셀(밝기 < 100) 비율」 을 따로 재서
    dark_keep 이상이면 그 칸은 짙은 픽셀들만의 평균색으로 칠하고 불투명으로 둠. 눈·입 선도 같은 이유로 또렷해짐."""
    rgb, al = premul_resize(rgba, k)
    src = rgba.astype(np.float32)
    dark = ((src[..., :3].mean(-1) < 100) & (src[..., 3] > 127)).astype(np.float32)
    h, w = rgba.shape[:2]
    nw, nh = rgb.shape[1], rgb.shape[0]
    dfrac = np.asarray(Image.fromarray((dark * 255).astype(np.uint8)).resize((nw, nh), Image.BOX)).astype(np.float32) / 255
    dimg = rgba.copy()
    dimg[..., 3] = (dark * 255).astype(np.uint8)
    drgb, dal = premul_resize(dimg, k)
    use_dark = dfrac >= dark_keep
    rgb = np.where(use_dark[..., None], drgb, rgb)
    on = (al > 0.5) | use_dark
    px = (rgb * 255)[on]
    # 사람 눈 기준 거리(초록 가중) — 흰 몸·연노랑이 엉뚱한 색으로 붙지 않게
    wt = np.array([3.0, 4.0, 2.0], np.float32)
    dd = (((px[:, None, :] - palette[None, :, :]) ** 2) * wt).sum(-1)
    q = palette[dd.argmin(1)]
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[on, :3] = np.clip(q, 0, 255)
    out[on, 3] = 255
    # 그래도 남는 틈: 원본 외곽선이 1px 짜리 회색(밝기 100~150)이면 짙은 비율이 모자라 흰색/회색 칸이 테두리에 섬.
    # 투명과 맞닿은 테두리 칸 가운데 밝은 무채색이고, 원본에서 그 칸 둘레 2px 안에 선 픽셀(밝기 < 170)이 있던 칸만 외곽선 색으로.
    # (모몽가 꼬리·이펙트처럼 원래 짙은 선이 없는 테두리는 그대로)
    grayline = (src[..., :3].mean(-1) < 170) & (src[..., 3] > 127)
    near = nd.binary_dilation(grayline, iterations=2).astype(np.uint8) * 255
    near = np.asarray(Image.fromarray(near).resize((nw, nh), Image.BOX)) > 0
    rim = on & ~nd.binary_erosion(on, structure=nd.generate_binary_structure(2, 1), border_value=0)
    c = out[..., :3].astype(int)
    lightish = (c.mean(-1) > 110) & ((c.max(-1) - c.min(-1)) < 70)
    fix = rim & lightish & near
    out[fix, :3] = palette[0].astype(np.uint8)
    return out


def green_left(rgba, thr=28):
    """불투명 픽셀 가운데 초록이 남은(G − max(R,B) > thr) 개수 — 0 이어야 함."""
    c = rgba[..., :3].astype(int)
    g = c[..., 1] - np.maximum(c[..., 0], c[..., 2])
    return int(((rgba[..., 3] > 127) & (g > thr)).sum())


def build(style="pixel"):
    """여덟 명 전부 자르기 → {이름: {"src": {act: [..]}, "dot": …, "anchor": …}} + 배율."""
    cut = {nm: cut_sheet(load(nm), spatial=nm in SPATIAL) for nm in NAMES}
    idle_h = int(np.median([body_anchor(f)[1] for f in cut["chiikawa"]["idle"]]))
    k_dot = DOT_H / idle_h
    res = {"idle_h": idle_h, "k_dot": k_dot, "chars": {}, "style": style}
    for nm in NAMES:
        acts = cut[nm]
        allf = [f for L in acts.values() for f in L if f is not None]
        pal = make_palette(allf, k_dot)
        C = {"palette": pal, "frames": {}}
        for act, L in acts.items():
            C["frames"][act] = []
            for i, f in enumerate(L):
                if f is None:
                    C["frames"][act].append(None)
                    continue
                e = {"src": f}
                if act == "fx":
                    e["anchor"] = (f.shape[1] / 2, f.shape[0] / 2)
                else:
                    e["anchor"], e["h"] = body_anchor(f)
                if act != "portrait":
                    e["dot"] = pixelize(f, k_dot, pal)
                    e["smooth"] = smooth(f, k_dot)
                    ax, ay = e["anchor"]
                    e["dot_anchor"] = (round(ax * e["dot"].shape[1] / f.shape[1], 1), round(ay * e["dot"].shape[0] / f.shape[0], 1))
                C["frames"][act].append(e)
        res["chars"][nm] = C
    return res


def fname(act, i):
    if act == "emo":
        return "emo_" + EMO_NAMES[i]
    if act == "portrait":
        return "portrait"
    return f"{act}_{i}"


def install(res, style):
    """두 게임 assets/chars/<이름>/ 를 새 프레임으로 통째 바꾸고 frames.json 을 씀."""
    k = TARGET_H / DOT_H
    for nm, C in res["chars"].items():
        man = {"style": style, "target_h": TARGET_H, "dot_h": DOT_H, "source": f"sheets/green_{nm}.webp (사람이 만든 초록 바탕 시트)",
               "emo_names": EMO_NAMES, "fx_names": FX_NAMES, "frames": {}, "fx": []}
        files = {}
        for act, L in C["frames"].items():
            if act == "portrait":
                e = L[0]
                files["portrait"] = e["src"]
                man["portrait"] = {"f": "portrait", "w": int(e["src"].shape[1]), "h": int(e["src"].shape[0])}
                continue
            lst = []
            for i, e in enumerate(L):
                if e is None:
                    continue
                im = e["dot"] if style == "pixel" else e["smooth"]
                ax, ay = e["dot_anchor"]
                n = fname(act, i)
                files[n] = im
                lst.append({"f": n, "i": i, "w": int(im.shape[1]), "h": int(im.shape[0]), "ax": ax, "ay": ay, "k": k})
            if act == "fx":
                man["fx"] = lst
            else:
                man["frames"][act] = lst
        for g in GAMES:
            d = g / "assets" / "chars" / nm
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True)
            for n, im in files.items():
                Image.fromarray(im, "RGBA").save(d / f"{n}.png", optimize=True)
            (d / "frames.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
        print("넣음:", nm, len(files), "장 →", ", ".join(str(g / "assets" / "chars" / nm) for g in GAMES))


def checker(w, h, s=6):
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.where(((yy // s) + (xx // s)) % 2, 200, 238).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v, np.full_like(v, 255)]), "RGBA")


def board(res, dst, which="dot", zoom=2):
    """여덟 명 프레임 전체: 캐릭터마다 줄 7개(+정면). 투명 체크무늬 위 — 초록 테가 남았는지 확대해서 보는 판.
    which = dot(도트 ×zoom nearest) · smooth(같은 크기 부드럽게 ×zoom) · src(원본 해상도). 파란 점 = 발 기준점."""
    acts = ["portrait"] + [r[0] for r in ROWS]
    cells = []
    for nm, C in res["chars"].items():
        for act in acts:
            for i, e in enumerate(C["frames"][act]):
                if e is None:
                    continue
                if act == "portrait" or which == "src":
                    t = Image.fromarray(e["src"], "RGBA")
                    if act == "portrait":
                        s = 150 / t.height
                        t = t.resize((round(t.width * s), 150), Image.LANCZOS)
                    ax, ay = (e["anchor"][0] * t.width / e["src"].shape[1], e["anchor"][1] * t.height / e["src"].shape[0])
                else:
                    t = Image.fromarray(e[which], "RGBA")
                    t = t.resize((t.width * zoom, t.height * zoom), Image.NEAREST)
                    ax, ay = e["dot_anchor"][0] * zoom, e["dot_anchor"][1] * zoom
                cells.append((nm, act, i, t, ax, ay))
    cw = max(c[3].width for c in cells if c[1] != "portrait") + 8
    chh = {act: max([c[3].height for c in cells if c[1] == act] + [20]) + 8 for act in acts}
    head = 110
    per = sum(chh.values()) + 28
    W = head + cw * 8
    out = Image.new("RGBA", (W, per * len(res["chars"])), (250, 246, 240, 255))
    dr = ImageDraw.Draw(out)
    yoff = {}
    y = 0
    for act in acts:
        yoff[act] = y
        y += chh[act]
    for ci, nm in enumerate(res["chars"]):
        base = ci * per
        dr.text((6, base + 6), f"{nm} — {which}" + (f" x{zoom}" if which != "src" else ""), fill=(40, 30, 30, 255))
        for act in acts:
            dr.text((6, base + 28 + yoff[act] + chh[act] // 2), act, fill=(60, 40, 40, 255))
    for nm, act, i, t, ax, ay in cells:
        ci = list(res["chars"]).index(nm)
        x = head + i * cw
        y = ci * per + 28 + yoff[act]
        out.paste(checker(t.width + 4, chh[act] - 4), (x + 2, y + 2))
        ox, oy = x + 4, y + chh[act] - 4 - t.height
        out.alpha_composite(t, (ox, oy))
        if act not in ("fx", "portrait"):
            px, py = ox + ax, oy + ay
            dr.line((px - 4, py, px + 4, py), fill=(0, 120, 255, 255), width=2)
            dr.line((px, py - 4, px, py), fill=(0, 120, 255, 255), width=2)
    out.save(dst)
    print("판:", dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", metavar="PNG", help="자른 프레임 전체(도트)를 한 장으로")
    ap.add_argument("--install", action="store_true", help="두 게임 assets/chars/<이름>/ 에 넣고 frames.json 쓰기")
    ap.add_argument("--style", choices=["pixel", "smooth"], default="pixel")
    a = ap.parse_args()
    res = build(a.style)
    print("치이카와 대기 몸 높이", res["idle_h"], "px → 도트", DOT_H, "칸 (×%.3f)" % res["k_dot"])
    for nm, C in res["chars"].items():
        miss = {act: [i for i, e in enumerate(L) if e is None] for act, L in C["frames"].items()}
        miss = {k: v for k, v in miss.items() if v}
        gl = sum(green_left(e["dot"]) for L in C["frames"].values() for e in L if e and "dot" in e)
        gs = sum(green_left(e["src"]) for L in C["frames"].values() for e in L if e)
        ih = int(np.median([e["h"] for e in C["frames"]["idle"] if e]))
        print(f"  {nm}: 대기 키 {ih}px · 빠진 칸 {miss or '없음'} · 초록 남은 픽셀 원본 {gs} / 도트 {gl} · 팔레트 {len(C['palette'])}색")
    if a.board:
        board(res, a.board)
    if a.install:
        install(res, a.style)


if __name__ == "__main__":
    main()
