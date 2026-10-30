"""캐릭터 프레임 목록(assets/chars/chars.js)을 만듭니다.

  python3 portfolio_src/chiikawa-defense/tools/chars_manifest.py          # chars.js 다시 쓰기
  python3 portfolio_src/chiikawa-defense/tools/chars_manifest.py --board /tmp/frames.png  # 고른 프레임 판도

여덟 명 모두 사람이 새로 만든 초록 바탕 시트에서 portfolio_src/_chiikawa_tools/slice_green.py 가 잘라 넣은 56칸 도트입니다
(assets/chars/<이름>/ 의 PNG · frames.json). 여기서는 frames.json 에서 디펜스가 쓸 것을 골라 옮겨 적기만 합니다(PNG 를 고치지 않음).
  k = 그림 1px 이 판의 몇 도트인지(몸 0.5 · 초상 64/폭) — 게임은 w·h·ax·ay 에 k 를 곱해 같은 키로 그림.
  친구마다 「공격 이펙트」 줄(fx_0..7, 캐릭터 색)이 있어 투사체(shot) · 맞은 자리(hit) · 스킬 터짐(fx)을 거기서 고르고,
  감정 8개(emo)는 결과 화면에 씀.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CH = ROOT / "assets" / "chars"

# 시트에서 고른 것 (여덟 장 칸 배치가 같아 번호가 같은 뜻)
#   공격 줄: 0~2 무기를 뒤로 들기 · 3 아래로 휘두름(궤적) · 4 들어 올림 · 5 오른쪽 베기(궤적) · 6 찌르기 · 7 거두기
#     → 칸 위에선 짧게(0.4초 안) 휘두름 → 들기 → 베기 → 찌르기만
#   스킬 줄: 2 회오리 무기 · 3 바람 · 6 빛 고리 · 7 금빛 기운 (0 반짝 · 1 음표 · 4 큰 하트 · 5 응원은 공격 느낌이 아니라 뺌)
#   공격 이펙트 줄: 0 별 터짐 · 1 초승달 베기 · 2 폭발 · 3 소용돌이 · 4 반짝이 · 5 돌진 · 6 원 · 7 솟구침
GREEN = ["chiikawa", "hachiware", "usagi", "shisa", "momonga", "rakko", "pungdengi", "kurimanju"]
G_ATTACK = [3, 4, 5, 6]
G_SKILL = [2, 3, 6, 7]
G_SHOT = 5            # 돌진(오른쪽으로 날아가는 혜성) — 게임이 날아가는 방향으로 돌림(aim)
G_HIT = 0             # 별 터짐 — 보통 공격이 맞은 자리
# 스킬이 터질 때: 친구 성격에 맞춰 — 콩(폭발) · 물결(소용돌이) · 치명 베기(초승달) · 불(솟구침) · 바람(소용돌이) ·
#   랏코 보스 일격(폭발) · 풍뎅이 독 잎(소용돌이 잎) · 쿠리만쥬 응원(원 — 맥주잔)
G_FX = {"chiikawa": 2, "hachiware": 3, "usagi": 1, "shisa": 7, "momonga": 3, "rakko": 2, "pungdengi": 3, "kurimanju": 6}
SHOT_DOTS = 18        # 투사체 긴 변(도트) — 돌진 그림은 가로로 길어 다른 친구 투사체(13)보다 조금 크게
PORTRAIT_DOTS = 64     # 판넬·도감·소환 카드의 초상 폭(도트) — 옛 시트 초상(61~73칸) 때와 같은 크기


def green(nm):
    man = json.loads((CH / nm / "frames.json").read_text())
    F = {act: {e["i"]: e for e in L} for act, L in man["frames"].items()}
    FX = {e["i"]: e for e in man["fx"]}
    ent = lambda e: {"f": nm + "/" + e["f"] + ".png", "w": e["w"], "h": e["h"], "ax": e["ax"], "ay": e["ay"], "k": e["k"]}
    mid = lambda e, **kw: dict({"f": nm + "/" + e["f"] + ".png", "w": e["w"], "h": e["h"], "ax": e["w"] / 2, "ay": e["h"] / 2, "k": e["k"]}, **kw)
    d = {
        "idle": [ent(e) for e in man["frames"]["idle"]],
        "attack": [ent(F["attack"][i]) for i in G_ATTACK],
        "skill": [ent(F["skill"][i]) for i in G_SKILL],
        "shot": mid(FX[G_SHOT], aim=1, sz=SHOT_DOTS),
        "hit": mid(FX[G_HIT]),
        "fx": mid(FX[G_FX[nm]]),
        "emo": {e["f"][4:]: ent(e) for e in man["frames"]["emo"]},
    }
    p = man["portrait"]
    d["portrait"] = {"f": nm + "/" + p["f"] + ".png", "w": p["w"], "h": p["h"], "ax": p["w"] / 2, "ay": p["h"] / 2,
                     "k": round(PORTRAIT_DOTS / p["w"], 5)}
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", metavar="PNG", help="고른 프레임을 한 장으로 펴서 여기 저장")
    a = ap.parse_args()
    out = {nm: green(nm) for nm in GREEN}
    js = (
        "/* 캐릭터 프레임 목록 — tools/chars_manifest.py 가 씁니다(손으로 고치지 말고 그 파일의 G_* 를 고친 뒤 다시 실행).\n"
        "   그림: 사람이 만든 초록 바탕 팬 도트 시트를 자른 PNG(공식 그림 아님) — _chiikawa_tools/slice_green.py.\n"
        "   f = 파일, w·h = 크기, ax·ay = 발 기준점(몸 프레임) 또는 가운데(효과 프레임), k = 그림 1px 의 도트 수.\n"
        "   hit = 맞은 자리 효과 · emo = 감정 8 · shot 의 aim = 날아가는 방향으로 돌림 · sz = 긴 변 도트. */\n"
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
                k = (2 if e is v["portrait"] else S) * e.get("k", 1)
                b = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST if k >= 1 else Image.LANCZOS)
                img.paste(b, (c * cw + int(cw / 2 - e["ax"] * k), r * cw + cw - 4 - int(e["ay"] * k)), b)
        dst = Path(a.board)
        img.save(dst)
        print("판:", dst)


if __name__ == "__main__":
    main()
