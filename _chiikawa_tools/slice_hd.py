"""치이카와 고해상도 시트(분홍 바탕 1536×1024)를 프레임 PNG 로 잘라 두 게임에 넣습니다.

※ 지금은 쓰지 않음 — 치이카와도 다른 넷과 화풍을 맞추려고 초록 바탕 시트(slice_green.py)로 바꿨습니다.
  --install 은 --force 없이는 거절합니다(돌리면 치이카와만 옛 분홍 시트 그림으로 돌아가 다섯 명 화풍이 어긋남).
  분홍 바탕 flood fill · 외곽선 메우기 방법을 참고용으로 남겨 둡니다.

  python3 _chiikawa_tools/slice_hd.py --board /tmp/hd_board.png   # 잘라서 판만 (게임 안 건드림)
  python3 _chiikawa_tools/slice_hd.py --install                   # 두 게임 assets/chars/chiikawa/ 에 넣기
  python3 _chiikawa_tools/slice_hd.py --install --style smooth    # 도트 변환 대신 원본 해상도 그대로

재료: sheets/chiikawa_hd.webp — 사람이 준 치이카와 전용 시트 셋(8·9·11번) 가운데 9번.
  · 칸이 가장 정돈돼 있고(동작마다 줄이 나뉘고 라벨이 칸 밖), 외곽선이 가장 짙고 고르다.
  · 대기·앉기/휴식·걷기·달리기·공격(포크)·피격·스킬·감정·아이템·이펙트가 한 장에 다 있어 다른 시트를 섞을 필요가 없다
    (8·11번은 얼굴 크기·선 굵기가 달라 섞으면 프레임마다 얼굴이 바뀌어 깜빡인다).
  · 화남 표정은 셋 다 없어 만들지 않았다(상상으로 그리지 않음).

하는 일
 1) 칸 자르기 — 아래 CELLS 의 좌표(사람이 시트를 보고 적은 칸). 라벨 알약·옆 칸 조각이 안 들어오게 칸 사이 가운데로 끊음.
 2) 바탕 지우기 — 칸 테두리 픽셀로 바탕색 평면(그라데이션)을 맞추고, 그 바탕과 색이 가까운 픽셀을 칸 가장자리에서
    flood fill 로 지운다. 치이카와는 흰 몸 + 짙은 외곽선이라 외곽선 안쪽 흰색(몸)·분홍(볼)은 닿지 않아 남는다.
    분홍 하트·이펙트는 바탕보다 채도가 높거나 어두워서 「바탕과 다름」 으로 남는다.
 3) body 칸은 몸 덩어리(가장 큰 것 + 붙은 포크)만 남기고, 발밑 분홍 그림자(외곽선 밖 · 맨 아래 띠의 분홍)를 지운다.
    emote 칸(감정·잠)은 머리 위 !·?·하트·zzz·눈물도 남김. 칸 테두리에 닿은 작은 조각은 옆 칸 것이라 버림.
 4) 가장자리 1px — 외곽선 밖으로 남은 밝은 픽셀(바탕과 섞인 테두리)은 반투명으로 → 어두운 바탕에서 흰/분홍 테두리가 덜 보임.
 5) 도트 변환(기본, --style pixel) — 몸 높이 94px 를 DOT_H(56)칸으로 면적 평균 축소 → 알파는 0/255 로 끊고 →
    프레임 전체에서 뽑은 색 몇 개로 고정 → 몸 외곽선 1칸이 빠진 자리를 짙은 색으로 다시 채움.
    게임은 이것을 정수 배 nearest 로 키움. 비교 판(--board)에 부드러운 축소와 나란히 찍어 고른 결과(README 참고).
 6) 발 기준점 — 머리·몸통(흰색·검정 픽셀)의 가로 가운데 · 몸 덩어리의 맨 아래 줄. 프레임마다 크기가 달라도 이 점을
    발밑에 두면 걸을 때 출렁이지 않음. frames.json 에 적고 각 게임의 목록 도구(prep_chars.py · chars_manifest.py)가 읽음.
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

HERE = Path(__file__).resolve().parent
SHEET = HERE / "sheets" / "chiikawa_hd.webp"
GAMES = [HERE.parent]

# 게임 안 목표 키 — 다른 일곱 친구(시트 프레임 25~33칸)와 같은 키로 보이도록 서 있는 몸 높이를 이 단위로 맞춤
TARGET_H = 28
# 도트 변환 격자: 서 있는 몸 높이를 이 칸 수로 (= TARGET_H 의 2배 → 게임의 2배 자리에서 1:1)
DOT_H = 56

# (x0, y0, x1, y1) — 시트 9번 기준. 칸 사이 가운데로 끊어 옆 칸 조각이 덜 들어오게
CELLS = {
    # 대기 6 — 0→5 가 숨쉬기·두리번 순서
    "idle": ("body", [(397, 54, 512, 184), (512, 54, 624, 184), (624, 54, 737, 184),
                      (737, 54, 852, 184), (852, 54, 967, 184), (967, 54, 1090, 184)]),
    # 앉기/휴식 3: 컵 들고 앉기 · 엎드려 지침 · 잠(zzz)
    "rest": ("emote", [(1110, 56, 1245, 184), (1245, 56, 1377, 184), (1377, 34, 1528, 184)]),
    # 걷기 5 (왼쪽을 봄) — 발 먼지는 몸에서 떨어져 있어 body 칸에선 빠짐
    "walk": ("body", [(400, 228, 520, 346), (520, 228, 630, 346), (630, 228, 737, 346),
                      (737, 228, 838, 346), (838, 228, 975, 346)]),
    # 달리기 4 (왼쪽을 봄)
    "run": ("body", [(995, 228, 1138, 346), (1138, 228, 1262, 346), (1262, 228, 1402, 346), (1402, 228, 1528, 346)]),
    # 공격 4: 포크 들기 → 휘두르기 → 찌르기 → 반달 베기
    "attack": ("body", [(398, 395, 527, 512), (527, 395, 662, 512), (662, 395, 802, 512), (802, 395, 955, 512)]),
    # 피격 5: 놀람 · 질끈 · 별 · 납작(기절) · 울상
    "hit": ("emote", [(965, 384, 1077, 512), (1077, 384, 1187, 512), (1187, 384, 1297, 512),
                      (1297, 384, 1422, 512), (1422, 384, 1528, 512)]),
    # 스킬 5 (치이카와가 있는 칸): 포크 반짝 · 모으기 · 분홍 방울 · 하트 포크 · 큰 하트
    "skill": ("emote", [(392, 548, 532, 684), (737, 548, 880, 684), (880, 548, 1050, 684),
                        (1060, 535, 1300, 684), (1300, 535, 1530, 684)]),
    # 감정 8: 놀람 ! · 갸웃 ? · 하트 · 반짝(기쁨) · 흐뭇 · 글썽 · 울음 · 펑펑
    "emo": ("emote", [(22, 718, 146, 862), (146, 718, 270, 862), (270, 718, 394, 862), (382, 718, 520, 862),
                      (518, 718, 641, 862), (641, 718, 752, 862), (752, 718, 859, 862), (859, 718, 958, 862)]),
    # 아이템 4: 음료 · 빵 · 하트 쿠션 · 음표+잎
    "item": ("emote", [(980, 718, 1112, 862), (1112, 718, 1247, 862), (1247, 718, 1382, 862), (1382, 718, 1528, 862)]),
    # 정면 큰 그림 — 몸만(옆의 하트·반짝은 빼서 창틀·카드에 깔끔히)
    "portrait": ("body", [(16, 150, 372, 548)]),
}
# 외곽선 색 (도트 변환 때 끊긴 외곽선을 메우는 색 · 테두리 번짐을 덮는 색)
INK = np.array([34, 22, 24])
# 이펙트 줄은 칸이 없어 덩어리를 찾아 하나씩: 이름은 왼쪽부터 순서대로
FX_BAND = (20, 900, 1528, 1008)
FX_NAMES = ["heart", "hearts", "sparkle", "slash", "heart_bubble", "heart_orb", "heart_burst",
            "bubbles", "cloud", "cloud_s", "sparkle2", "starburst"]
# 스킬 줄의 효과만 있는 칸 둘(분홍 하트 · 빛나는 하트) — 투사체로 씀
FX_CELLS = {"heart_shot": (532, 548, 625, 670), "heart_shine": (625, 548, 735, 684)}
# 시트에서 왼쪽을 보는 동작 — 게임은 「오른쪽을 보는 그림 + 왼쪽이면 좌우 반전」 이라 잘라서 뒤집어 둠
MIRROR = {"walk", "run"}
# 감정 이름 (게임이 이름으로 부름)
EMO_NAMES = ["surprise", "confused", "love", "joy", "calm", "teary", "cry", "sob"]


def load_sheet():
    return np.asarray(Image.open(SHEET).convert("RGB")).astype(np.float32)


def bg_plane(c):
    """칸 테두리 픽셀로 바탕 평면(채널별 a + b·x + c·y)을 맞춤. 테두리에 걸친 캐릭터 픽셀은 중앙값 근처만 써서 버림."""
    h, w, _ = c.shape
    ys = np.r_[np.zeros(w), np.full(w, h - 1), np.arange(h), np.arange(h)].astype(int)
    xs = np.r_[np.arange(w), np.arange(w), np.zeros(h), np.full(h, w - 1)].astype(int)
    px = c[ys, xs]
    med = np.median(px, axis=0)
    ok = np.abs(px - med).max(axis=1) < 22
    A = np.c_[np.ones(ok.sum()), xs[ok], ys[ok]]
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.empty_like(c)
    for ch in range(3):
        coef, *_ = np.linalg.lstsq(A, px[ok, ch], rcond=None)
        out[..., ch] = coef[0] + coef[1] * xx + coef[2] * yy
    return out


def sat(c):
    mx, mn = c.max(axis=-1), c.min(axis=-1)
    return (mx - mn) / np.maximum(mx, 1)


def is_bar(sl):
    """칸 테두리·라벨 알약의 가로 띠(납작하고 긴 덩어리) — 캐릭터 것이 아님."""
    hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    return hh <= 18 and ww >= 28 and ww > hh * 3.5


def segment(c, mode):
    """칸 하나 → RGBA. mode: body(몸 덩어리만) · emote(머리 위 표시까지) · fx(이펙트)."""
    h, w, _ = c.shape
    bg = bg_plane(c)
    d = np.sqrt(((c - bg) ** 2).sum(-1))
    lum = c.mean(-1)
    ink = lum < 95
    white = (c.min(-1) > 236) & (sat(c) < 0.06)
    # 바탕과 다른 픽셀: 색 거리가 크거나, 바탕보다 채도가 확실히 높음(옅은 분홍 하트).
    # 바탕보다 밝고 채도 낮은 픽셀(외곽선 밖 흰 번짐)은 바탕 쪽으로.
    sbg = sat(bg)
    lighter = (lum > bg.mean(-1) + 4) & (sat(c) < sbg)
    fg = ((d > 34) & ~(lighter & (d < 48))) | (sat(c) - sbg > 0.12) | ink
    # 칸 가장자리에서 바탕 flood fill: 가장자리와 이어진 「바탕과 같은」 픽셀만 지움 → 몸 속 흰색·볼은 남음
    lab, _ = nd.label(~fg)
    edge = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    bgm = np.isin(lab, edge[edge > 0])
    m = ~bgm
    # 1~2px 짜리 잡티 제거
    m = nd.binary_opening(m, np.ones((2, 2))) | (m & ink)

    lab8, n = nd.label(m, structure=np.ones((3, 3)))
    if n == 0:
        return None
    sizes = nd.sum(m, lab8, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    body = lab8 == main
    if mode in ("body", "emote"):
        # 발밑 분홍 그림자: 외곽선(검정)으로 닫힌 몸 밖 · 몸 맨 아래 띠 · 흰색/검정이 아닌 분홍
        core = nd.binary_fill_holes(nd.binary_closing(ink & body, np.ones((3, 3))))
        if core.any():
            bot = np.nonzero(core.any(1))[0].max()
            yy = np.arange(h)[:, None] * np.ones((1, w))
            red = (c[..., 1] < 105) & (c[..., 0] > 150)          # 포크(진한 빨강)는 남김
            shadow = m & ~nd.binary_dilation(core, iterations=1) & (yy >= bot - max(12, (bot - np.nonzero(core.any(1))[0].min()) * 0.12)) & ~white & ~ink & ~red
            m = m & ~shadow
            lab8, n = nd.label(m, structure=np.ones((3, 3)))
            sizes = nd.sum(m, lab8, range(1, n + 1))
            main = int(np.argmax(sizes)) + 1
            body = lab8 == main
    if mode == "body":
        keep = body
    else:
        keep = np.zeros_like(m)
        for i, sl in enumerate(nd.find_objects(lab8), start=1):
            comp = lab8 == i
            sz = sizes[i - 1]
            touches = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == h or sl[1].stop == w
            if i != main and is_bar(sl):
                continue
            if i == main or (sz >= 6 and not (touches and sz < 400)):
                keep |= comp
    # 가장자리 1px: 외곽선 밖으로 붙은 밝은 픽셀은 바탕과 섞인 색 → 반투명
    rim = keep & ~nd.binary_erosion(keep, np.ones((3, 3)))
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    soft = rim & ~ink & (lum > 150) & (d < 70)
    alpha[soft] = 110
    rgb = np.clip(c, 0, 255).astype(np.uint8)
    # 외곽선 바로 밖의 테두리 픽셀은 바탕 분홍이 섞인 색 → 외곽선 색으로 바꿔(반투명 그대로) 분홍 실선이 안 보이게
    near_ink = nd.binary_dilation(ink & keep, structure=nd.generate_binary_structure(2, 1))
    rgb[rim & ~ink & near_ink & keep] = INK
    rgba = np.dstack([rgb, alpha])
    ys, xs = np.nonzero(alpha)
    if not len(ys):
        return None
    return rgba[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def body_anchor(rgba):
    """발 기준점 [ax, ay] — 머리·몸통(흰·검정)의 가로 가운데 · 가장 큰 덩어리의 맨 아래 줄."""
    a = rgba[..., 3] > 0
    lab, n = nd.label(a, structure=np.ones((3, 3)))
    sizes = nd.sum(a, lab, range(1, n + 1))
    m = lab == (int(np.argmax(sizes)) + 1)
    ys, xs = np.nonzero(m)
    top, bot = ys.min(), ys.max()
    rgb = rgba[..., :3].astype(int)
    bw = m & ((rgb.min(-1) > 225) | (rgb.mean(-1) < 90))       # 포크(빨강)·하트는 빼고 흰 몸 + 외곽선
    band = bw & (np.arange(a.shape[0])[:, None] < top + (bot - top) * 0.6)
    cx = np.nonzero(band)[1].mean() if band.any() else xs.mean()
    return [round(float(cx) + 0.5, 1), int(bot) + 1], int(bot - top + 1)


def premul_resize(rgba, k):
    """알파를 곱한 채로 면적 평균 축소 — 투명 바탕의 검정이 테두리로 번지지 않게."""
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    f = rgba.astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    im = Image.fromarray((f * 255).astype(np.uint8), "RGBA")
    # PIL 의 BOX 가 면적 평균 (축소 비율이 정수가 아니어도 칸 넓이만큼 섞음)
    r = np.asarray(im.resize((nw, nh), Image.BOX)).astype(np.float32) / 255
    al = r[..., 3:4]
    rgb = np.where(al > 0.01, r[..., :3] / np.maximum(al, 1e-3), 0)
    return np.clip(rgb, 0, 1), al[..., 0]


def pixelize(rgba, k, palette, outline=True, reink=True):
    """도트 변환: 면적 평균 축소 → 알파 0/255 → 팔레트 고정 → 몸 외곽선 1칸 다시 긋기."""
    rgb, al = premul_resize(rgba, k)
    on = al > 0.45
    px = (rgb * 255)[on]
    dd = ((px[:, None, :] - palette[None, :, :]) ** 2).sum(-1)
    q = palette[dd.argmin(1)]
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[on, :3] = q
    out[on, 3] = 255
    if outline:
        # 외곽선 밖에 남은 바탕 분홍(축소하며 테두리 반투명 픽셀이 섞인 것)을 두 겹까지 벗김.
        # 포크·하트의 진한 분홍(G<150)은 바탕색이 아니라 남음.
        for _ in range(2):
            on = out[..., 3] > 0
            rim = on & ~nd.binary_erosion(on, np.ones((3, 3)), border_value=0)
            c = out[..., :3].astype(int)
            bgpink = (c[..., 0] > 200) & (c[..., 1] > 150) & (c[..., 1] < 228) & (c[..., 2] > 160) & \
                     (c[..., 0] - c[..., 1] > 18)
            out[rim & bgpink] = 0
        # 외곽선 바깥에 붙은 회색·탁한 분홍 번짐(바탕과 검정이 섞인 칸): 안쪽 이웃이 외곽선이면 지움
        on = out[..., 3] > 0
        rim = on & ~nd.binary_erosion(on, np.ones((3, 3)), border_value=0)
        c = out[..., :3].astype(int)
        lum = c.mean(-1)
        dark = on & (lum < 75)
        nb_dark = nd.binary_dilation(dark, structure=nd.generate_binary_structure(2, 1))
        vivid = (c[..., 0] > 180) & (c[..., 1] < 125)       # 포크·하트의 진한 빨강·분홍
        halo = rim & ~dark & nb_dark & ~vivid & (lum < 215)
        out[halo] = 0
        on = out[..., 3] > 0
        # 몸 덩어리 가장자리(투명과 맞닿은 칸) 가운데 흰색에 가까운 칸 → 외곽선 색. 축소로 외곽선이 끊긴 자리를 메움.
        # 분홍·빨강(하트·포크)은 원래 검정 외곽선이 아니라서 건드리지 않음.
        rim = on & ~nd.binary_erosion(on, np.ones((3, 3)), border_value=0)
        whiteish = out[..., :3].min(-1) > 200
        lowsat = (out[..., :3].max(-1).astype(int) - out[..., :3].min(-1)) < 30
        fix = rim & whiteish & lowsat
        if reink:       # 스킬 칸은 흰 빛 번짐이 테두리라 검게 칠하면 안 됨
            out[fix, :3] = INK
    return out


def make_palette(frames, k=22):
    """모든 프레임의 불투명 픽셀(축소 후)에서 대표색 k 개 — 외곽선·흰 몸은 고정 색으로 넣음."""
    import cv2
    pts = []
    for rgba, kk in frames:
        rgb, al = premul_resize(rgba, kk)
        pts.append((rgb * 255)[al > 0.45])
    P = np.concatenate(pts).astype(np.float32)
    rng = np.random.default_rng(0)
    if len(P) > 60000:
        P = P[rng.choice(len(P), 60000, replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    cv2.setRNGSeed(0)
    _, _, cent = cv2.kmeans(P, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    # 외곽선·흰 몸·옅은 그림자 + 작은 소품 색(잎 초록 · ? 파랑 · 눈물 하늘 · 빵 주황 · 반짝 노랑) — 수가 적어 k-means 가 놓침
    fixed = np.array([INK, [255, 253, 251], [236, 232, 233], [104, 178, 84], [58, 92, 196], [150, 200, 240],
                      [226, 150, 80], [250, 206, 96]], np.float32)
    # 고정 색과 아주 가까운 대표색은 버림(같은 색이 두 벌이면 테두리가 얼룩짐)
    keep = [c for c in cent if np.sqrt(((fixed - c) ** 2).sum(1)).min() > 26]
    return np.vstack([fixed, np.array(keep)]).astype(np.float32)


def cut_all(sheet):
    out = {}
    for act, (mode, boxes) in CELLS.items():
        L = []
        for (x0, y0, x1, y1) in boxes:
            r = segment(sheet[y0:y1, x0:x1], mode)
            if act in MIRROR and r is not None:
                r = np.ascontiguousarray(r[:, ::-1])
            L.append(r)
        out[act] = L
    # 이펙트 줄: 덩어리 찾기
    x0, y0, x1, y1 = FX_BAND
    c = sheet[y0:y1, x0:x1]
    fx = {}
    bg = bg_plane(c)
    d = np.sqrt(((c - bg) ** 2).sum(-1))
    fg = (d > 34) | (sat(c) - sat(bg) > 0.12) | (c.mean(-1) < 95)
    fg = nd.binary_opening(fg, np.ones((2, 2)))
    grp = nd.binary_dilation(fg, iterations=7)       # 한 이펙트의 작은 조각(반짝이 점)을 한 덩어리로
    lab, n = nd.label(grp)
    objs = sorted([(sl[1].start, sl) for sl in nd.find_objects(lab)
                   if (sl[1].stop - sl[1].start) * (sl[0].stop - sl[0].start) > 900 and not is_bar((slice(sl[0].start + 7, sl[0].stop - 7), slice(sl[1].start + 7, sl[1].stop - 7)))],
                  key=lambda t: t[0])
    for i, (_, sl) in enumerate(objs[: len(FX_NAMES)]):
        ys, xs = sl
        pad = 2
        cell = c[max(0, ys.start - pad): ys.stop + pad, max(0, xs.start - pad): xs.stop + pad]
        fx[FX_NAMES[i]] = segment(cell, "fx")
    for nm, (a0, b0, a1, b1) in FX_CELLS.items():
        fx[nm] = segment(sheet[b0:b1, a0:a1], "fx")
    out["fx"] = fx
    return out


def checker(w, h, s=8):
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.where(((yy // s) + (xx // s)) % 2, 205, 235).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v, np.full_like(v, 255)]), "RGBA")


def build(style):
    sheet = load_sheet()
    cut = cut_all(sheet)
    # 서 있는 몸 높이(대기 프레임 몸 덩어리 높이의 중앙값) → 게임 배율
    idle_h = int(np.median([body_anchor(f)[1] for f in cut["idle"]]))
    k_dot = DOT_H / idle_h
    pal = make_palette([(f, k_dot) for act, L in cut.items() if act != "fx" for f in L if f is not None]
                       + [(f, k_dot) for f in cut["fx"].values() if f is not None])
    frames = {}
    for act, L in cut.items():
        if act == "fx":
            continue
        frames[act] = []
        for f in L:
            if f is None:
                continue
            (ax, ay), _ = body_anchor(f)
            frames[act].append({"src": f, "anchor": (ax, ay)})
    fxs = {nm: f for nm, f in cut["fx"].items() if f is not None}
    res = {"idle_h": idle_h, "k_dot": k_dot, "palette": pal, "frames": frames, "fx": fxs, "style": style}
    # 도트 변환 결과도 함께
    for act, L in frames.items():
        for e in L:
            e["dot"] = pixelize(e["src"], k_dot, pal, outline=True, reink=act != "skill")
            ax, ay = e["anchor"]
            e["dot_anchor"] = (round(ax * k_dot, 1), round(ay * k_dot))
    res["fx_dot"] = {nm: pixelize(f, k_dot, pal, outline=False) for nm, f in fxs.items()}
    return res


def names(act, i):
    if act == "emo":
        return "emo_" + EMO_NAMES[i]
    if act == "portrait":
        return "portrait"
    return f"{act}_{i}"


def install(res, style):
    """두 게임 assets/chars/chiikawa/ 를 고해상도 프레임으로 바꾸고 frames.json 을 씀."""
    unit = TARGET_H / res["idle_h"]          # 원본 1px → 게임 단위
    man = {"style": style, "target_h": TARGET_H, "frames": {}, "fx": {},
           "source": "sheets/chiikawa_hd.webp (사람이 준 팬 도트 시트 9번)"}
    files = {}
    for act, L in res["frames"].items():
        man["frames"][act] = []
        for i, e in enumerate(L):
            nm = names(act, i)
            if act == "portrait":
                im = e["src"]           # 큰 자리(카드 창틀·초상)는 원본 해상도로 부드럽게 줄여 씀
                files[nm] = im
                man["portrait"] = {"f": nm, "w": int(im.shape[1]), "h": int(im.shape[0])}
                continue
            if style == "pixel":
                im, (ax, ay), k = e["dot"], e["dot_anchor"], TARGET_H / DOT_H
            else:
                im, (ax, ay), k = e["src"], e["anchor"], unit
            files[nm] = im
            man["frames"][act].append({"f": nm, "w": int(im.shape[1]), "h": int(im.shape[0]), "ax": ax, "ay": ay, "k": round(k, 5)})
    man["frames"].pop("portrait", None)
    for nm, f in res["fx"].items():
        im = res["fx_dot"][nm] if style == "pixel" else f
        k = TARGET_H / DOT_H if style == "pixel" else unit
        files["fx_" + nm] = im
        man["fx"][nm] = {"f": "fx_" + nm, "w": int(im.shape[1]), "h": int(im.shape[0]), "k": round(k, 5)}
    for g in GAMES:
        d = g / "assets" / "chars" / "chiikawa"
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
        for nm, im in files.items():
            Image.fromarray(im, "RGBA").save(d / f"{nm}.png", optimize=True)
        (d / "frames.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
        print("넣음:", d, len(files), "장")
    return man


def board(res, dst):
    """잘린 프레임 전체 판: 줄마다 한 동작. 위 = 체크무늬 위 원본 해상도, 아래 = 짙은 바탕 위 도트(×2) — 분홍 테두리·구멍 확인용."""
    rows = [(act, L) for act, L in res["frames"].items()]
    cw, chh = 160, 150
    n = max(len(L) for _, L in rows + [("fx", list(res["fx"].values()))])
    W, H = 150 + cw * n, (chh * 2 + 10) * (len(rows) + 1)
    im = Image.new("RGBA", (W, H), (250, 246, 240, 255))
    dr = ImageDraw.Draw(im)
    y = 0
    for act, L in rows + [("fx", [{"src": f, "anchor": (f.shape[1] / 2, f.shape[0]), "dot": res["fx_dot"][k], "dot_anchor": (res["fx_dot"][k].shape[1] / 2, res["fx_dot"][k].shape[0])} for k, f in res["fx"].items()])]:
        dr.text((6, y + 6), act, fill=(60, 40, 40, 255))
        for i, e in enumerate(L):
            x = 150 + i * cw
            src = e["src"]
            s = min(1.0, (cw - 6) / src.shape[1], (chh - 6) / src.shape[0])
            t = Image.fromarray(src, "RGBA")
            if s < 1:
                t = t.resize((round(src.shape[1] * s), round(src.shape[0] * s)), Image.LANCZOS)
            bgc = checker(cw - 4, chh - 4)
            im.paste(bgc, (x + 2, y + 2))
            im.alpha_composite(t, (x + (cw - t.width) // 2, y + chh - 4 - t.height))
            dot = Image.fromarray(e["dot"], "RGBA")
            z = 2 if dot.width * 2 <= cw - 4 and dot.height * 2 <= chh - 4 else 1     # 큰 스킬·이펙트 칸은 ×1
            dot = dot.resize((dot.width * z, dot.height * z), Image.NEAREST)
            dk = Image.new("RGBA", (cw - 4, chh - 4), (52, 60, 82, 255))
            im.paste(dk, (x + 2, y + chh + 2))
            if dot.width <= cw - 4 and dot.height <= chh - 4:
                im.alpha_composite(dot, (x + (cw - dot.width) // 2, y + chh * 2 - 4 - dot.height))
            ax, ay = e["anchor"]
            dr.line([(x + (cw - t.width) // 2 + ax * s, y + chh - 8), (x + (cw - t.width) // 2 + ax * s, y + chh - 2)], fill=(0, 140, 255, 255))
        y += chh * 2 + 10
    im.save(dst)
    print("판:", dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", metavar="PNG", help="자른 프레임 전체를 한 장으로")
    ap.add_argument("--install", action="store_true", help="두 게임 assets/chars/chiikawa/ 에 넣고 frames.json 쓰기")
    ap.add_argument("--style", choices=["pixel", "smooth"], default="pixel", help="게임에 넣을 몸 프레임: 도트 변환(기본) · 원본 해상도")
    ap.add_argument("--force", action="store_true", help="그래도 옛 분홍 시트로 --install")
    ap.add_argument("--dump", metavar="DIR", help="원본 해상도 · 도트 프레임 PNG 를 여기 풀어 둠(비교 판용)")
    a = ap.parse_args()
    if a.install and not a.force:
        raise SystemExit("slice_hd.py --install 은 이제 쓰지 않습니다 — 다섯 명은 slice_green.py --install 로 넣으세요 (옛 분홍 시트로 되돌리려면 --force)")
    res = build(a.style)
    print("대기 몸 높이", res["idle_h"], "px → 도트", DOT_H, "칸 (×%.3f)" % res["k_dot"], "· 팔레트", len(res["palette"]), "색")
    print("프레임:", {k: len(v) for k, v in res["frames"].items()}, "이펙트:", len(res["fx"]))
    if a.board:
        board(res, a.board)
    if a.dump:
        d = Path(a.dump)
        (d / "src").mkdir(parents=True, exist_ok=True)
        (d / "dot").mkdir(parents=True, exist_ok=True)
        meta = {}
        for act, L in res["frames"].items():
            for i, e in enumerate(L):
                nm = names(act, i)
                Image.fromarray(e["src"], "RGBA").save(d / "src" / f"{nm}.png")
                Image.fromarray(e["dot"], "RGBA").save(d / "dot" / f"{nm}.png")
                meta[nm] = {"anchor": e["anchor"], "dot_anchor": e["dot_anchor"]}
        (d / "meta.json").write_text(json.dumps({"idle_h": res["idle_h"], "k_dot": res["k_dot"], "frames": meta}))
    if a.install:
        install(res, a.style)


if __name__ == "__main__":
    main()
