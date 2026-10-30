"""앱 아이콘 만들기 — 홈 화면 · 설치 창에 보일 그림 (manifest.webmanifest · index.html 이 읽음).

    python3 tools/make_icons.py            # assets/icon/ 에 씀
    python3 tools/make_icons.py --board /tmp/icons.png   # 둥근/동그란 가림을 씌운 미리보기 한 장

- 하늘 바탕 + 풀 언덕 + 치이카와(assets/chars/chiikawa/portrait.png). 크림 · 베이지 안 씀.
- icon-192/512   : 「any」 — 모서리를 둥글게 깎은 그림(가림을 안 씌우는 데스크톱 · 설치 창용)
- maskable-512   : 꽉 찬 사각. 안드로이드가 동그라미 · 물방울로 잘라도 얼굴이 안 잘리게
                   캐릭터를 안전 영역(가운데 지름 80% 원) 안쪽 사각에 넣음
- apple-touch-180: 꽉 찬 사각(iOS 가 스스로 둥글게 깎음 · 투명이면 검게 나옴)
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "icon"
CHAR = ROOT / "assets" / "chars" / "chiikawa" / "portrait.png"

SKY_TOP, SKY_BOT = (207, 234, 255), (160, 210, 250)
DOT = (178, 218, 248)
GRASS, GRASS_D = (159, 207, 106), (124, 178, 82)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def scene(n, char_h, char_cy):
    """n×n 꽉 찬 그림. char_h = 캐릭터 높이(비율), char_cy = 캐릭터 가운데 y(비율)."""
    im = Image.new("RGB", (n, n))
    d = ImageDraw.Draw(im)
    for y in range(n):
        d.line([(0, y), (n, y)], fill=lerp(SKY_TOP, SKY_BOT, y / n))
    # 게임 페이지 바탕과 같은 물방울 점
    step = max(8, n // 14)
    r = max(1, n // 170)
    for y in range(step // 2, n, step):
        for x in range(step // 2 + (y // step % 2) * step // 2, n, step):
            d.ellipse([x - r, y - r, x + r, y + r], fill=DOT)
    # 풀 언덕
    hill_top = char_cy + char_h * 0.36
    d.ellipse([-n * 0.25, n * hill_top, n * 1.25, n * (hill_top + 0.9)], fill=GRASS_D)
    d.ellipse([-n * 0.25, n * (hill_top + 0.025), n * 1.25, n * (hill_top + 0.92)], fill=GRASS)
    # 캐릭터: 도트 그림이라 정수배 nearest 로 키운 뒤 부드럽게 맞춤 (게임의 hybrid 와 같은 방식)
    ch = Image.open(CHAR).convert("RGBA")
    ch = ch.crop(ch.getbbox())
    th = round(n * char_h)
    k = max(1, th // ch.height)
    big = ch.resize((ch.width * k, ch.height * k), Image.NEAREST)
    tw = round(ch.width * th / ch.height)
    big = big.resize((tw, th), Image.LANCZOS)
    im = im.convert("RGBA")
    im.alpha_composite(big, ((n - tw) // 2, round(n * char_cy - th / 2)))
    return im


def rounded(im, radius):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=radius, fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", help="가림 미리보기 판 PNG 경로")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    any512 = rounded(scene(512, 0.70, 0.47), 112)
    any512.save(OUT / "icon-512.png", optimize=True)
    any512.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
    # 안전 영역: 가운데 지름 80% 원 → 그 안에 든 사각은 한 변 약 56%. 캐릭터 높이 54%
    mask = scene(512, 0.54, 0.49).convert("RGB")
    mask.save(OUT / "maskable-512.png", optimize=True)
    scene(180, 0.70, 0.47).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("아이콘 →", OUT)
    if a.board:
        tiles = [any512.resize((256, 256), Image.LANCZOS)]
        for kind in ("circle", "squircle"):
            m = Image.new("L", (512, 512), 0)
            dr = ImageDraw.Draw(m)
            if kind == "circle":
                dr.ellipse([0, 0, 511, 511], fill=255)
            else:
                dr.rounded_rectangle([0, 0, 511, 511], radius=150, fill=255)
            t = mask.copy().convert("RGBA")
            t.putalpha(m)
            # 안전 영역 원(80%)을 점선 대신 얇은 선으로
            ImageDraw.Draw(t).ellipse([51, 51, 460, 460], outline=(232, 86, 107, 255), width=2)
            tiles.append(t.resize((256, 256), Image.LANCZOS))
        tiles.append(Image.open(OUT / "apple-touch-icon.png").convert("RGBA").resize((256, 256), Image.LANCZOS))
        board = Image.new("RGBA", (256 * len(tiles) + 20 * (len(tiles) + 1), 296), (60, 60, 70, 255))
        for i, t in enumerate(tiles):
            board.alpha_composite(t, (20 + i * 276, 20))
        board.save(a.board)
        print("미리보기 →", a.board)


if __name__ == "__main__":
    main()
