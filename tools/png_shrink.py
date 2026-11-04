"""게임 그림 PNG 를 256색 팔레트 PNG 로 줄입니다 (같은 이름에 덮어씀 · 코드 변경 없음).

  python3 tools/png_shrink.py          # assets/chars · monsters · tiles · ui
  python3 tools/png_shrink.py --check  # 줄일 게 남았는지만 (0 이면 이미 다 줄인 상태)

왜: 인스타 인앱으로 처음 들어오면 첫 화면 전에 그림 400여 장(약 5MB)을 받아서, 느린 폰 데이터에선 10초 넘게 걸렸음(2026-11-04).
그림이 평평한 색의 만화 도트라 256색으로 줄여도 눈으로 차이가 없음(반투명 유령 · 빛도 팔레트 알파로 남음) — 약 5.2MB → 1.8MB.
자르기 도구(chars · monsters_slice · row_char_slice · tiles_slice · ui_install)를 다시 돌리면 원본 크기로 돌아오니 그 뒤에 다시 실행할 것.
줄인 쪽이 더 크면(아주 작은 그림) 원본을 그대로 둠.
"""
import argparse
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIRS = ["assets/chars", "assets/monsters", "assets/tiles", "assets/ui"]


def shrink(path):
    im = Image.open(path)
    if im.mode == "P":
        return 0
    p = im.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    buf = io.BytesIO()
    p.save(buf, "PNG", optimize=True)
    old = path.stat().st_size
    if buf.tell() >= old:
        return 0
    return old - buf.tell(), buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    n = saved = 0
    for d in DIRS:
        for f in sorted((ROOT / d).rglob("*.png")):
            r = shrink(f)
            if not r:
                continue
            n += 1
            saved += r[0]
            if not a.check:
                f.write_bytes(r[1])
    print(("줄일 수 있음" if a.check else "줄임"), n, "장 ·", saved // 1024, "KB")


if __name__ == "__main__":
    main()
