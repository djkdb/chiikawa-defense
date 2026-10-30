"""랜덤 디펜스를 실제 입력(마우스 · 터치)으로 끝까지 해 보고 화면을 남깁니다.

  python3 portfolio_src/chiikawa-defense/tools/play_check.py               # 데스크톱 + 폰
  python3 portfolio_src/chiikawa-defense/tools/play_check.py --only phone
  python3 portfolio_src/chiikawa-defense/tools/play_check.py --speed 6     # 배속 (기본 6)

한 기기에서 하는 일
  1) 시작 화면 → 「시작하기」
  2) 봇이 판을 CD.test.state() 로 **읽기만** 하고, 움직임은 전부 진짜 입력으로:
     소환 = 버튼 누르기 · 합성 = 칸에서 칸으로 끌기(데스크톱 마우스 / 폰 손가락) · 팔기 = 칸 누르기 → 「팔기」 · 강화 = 등급 버튼
  3) 클리어 1판 → 결과 화면 / 「다시 하기」 → 손 놓고 패배 1판 → 결과 화면
  4) 새로 고침 후 시작 화면에 최고 기록이 남는지(localStorage)
판(공식 레퍼런스 옆에 게임 화면 · 합성 순간 · 보스 · 결과)은 output/chiikawa-defense-check/board.png (커밋 안 함).
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT = REPO / "output" / "chiikawa-defense-check"
REF = Path("/root/.claude/uploads/1cdfdb2d-7a1e-5e8e-8067-c8aa8cb35f79/f9175142-image.jpg")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Dev:
    def __init__(self, pg, name, touch, cdp):
        self.pg, self.name, self.touch, self.cdp = pg, name, touch, cdp
        self.errors = []
        self.shots = {}
        self.log = {"summon": 0, "merge": 0, "merge_fail": 0, "sell": 0, "upgrade": 0}
        pg.on("console", lambda m: self.errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        pg.on("requestfailed", lambda r: self.errors.append(f"requestfailed: {r.url}"))

    def shot(self, label):
        path = OUT / f"{self.name}_{len(self.shots):02d}_{label}.png"
        self.pg.screenshot(path=str(path))
        self.shots[label] = path
        return path

    def ev(self, js):
        return self.pg.evaluate(js)

    def st(self):
        return self.ev("CD.test.state()")

    def phase(self):
        return self.ev("CD.test.phase()")

    # ── 입력 ──
    def press(self, sel):
        # 맥박 치는 버튼은 Playwright 가 「안정적이지 않음」 으로 기다리므로, 가운데 좌표에 진짜 마우스/손가락을 바로 댑니다
        loc = self.pg.locator(sel)
        loc.evaluate("e => e.scrollIntoView({block: 'nearest'})")
        box = loc.bounding_box()
        if not box:
            raise RuntimeError(f"{sel} 가 화면에 없음")
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        if self.touch:
            self.touch_ev("touchStart", x, y)
            self.pg.wait_for_timeout(30)
            self.touch_ev("touchEnd")
        else:
            self.pg.mouse.click(x, y)

    def touch_ev(self, kind, x=None, y=None):
        pts = [] if x is None else [{"x": x, "y": y}]
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

    def slot(self, i):
        return self.ev(f"CD.test.slotPoint({i})")

    def drag(self, a, b):
        p, q = self.slot(a), self.slot(b)
        n = 7
        if self.touch:
            self.touch_ev("touchStart", p["x"], p["y"])
            for k in range(1, n + 1):
                self.touch_ev("touchMove", p["x"] + (q["x"] - p["x"]) * k / n, p["y"] + (q["y"] - p["y"]) * k / n)
                self.pg.wait_for_timeout(16)
            self.touch_ev("touchEnd")
        else:
            m = self.pg.mouse
            m.move(p["x"], p["y"])
            m.down()
            m.move(q["x"], q["y"], steps=n)
            m.up()

    def tap_slot(self, i):
        p = self.slot(i)
        if self.touch:
            self.touch_ev("touchStart", p["x"], p["y"])
            self.pg.wait_for_timeout(40)
            self.touch_ev("touchEnd")
        else:
            self.pg.mouse.click(p["x"], p["y"])


GRADE_DMG = None


def bot_turn(D, s):
    """잘하는 사람처럼 한 수. 돌려주는 값: 한 일 이름(없으면 None)"""
    units = s["units"]
    # 1) 짝이 있으면 끌어서 합성
    mates = D.ev("CD.test.mates()")
    if mates:
        a, b = mates[0]
        g0 = units[b]["g"]
        D.drag(a, b)
        D.pg.wait_for_timeout(60)
        s2 = D.st()
        if s2["units"][a] is None and s2["units"][b] and s2["units"][b]["g"] == g0 + 1:
            D.log["merge"] += 1
            return "merge"
        D.log["merge_fail"] += 1
        return None
    empty = [i for i, u in enumerate(units) if u is None]
    # 2) 강화가 소환보다 이득이면 강화 (tools/sim.js 의 good 봇과 같은 셈)
    pow_ = [0, 0, 0, 0]
    for u in units:
        if u:
            pow_[u["g"]] += GRADE_DMG[u["g"]]
    best, best_v = None, 1.3 / s["cost"]
    for k in range(4):
        c = D.ev(f"CD.test.upCost({k})")
        if c and c < 1e9:
            v = 0.2 * pow_[k] / c
            if v > best_v:
                best, best_v = k, v
    if best is not None:
        if s["coins"] >= D.ev(f"CD.test.upCost({best})"):
            D.press(f"#up{best}")
            D.log["upgrade"] += 1
            return "upgrade"
        return None
    if empty and s["coins"] >= s["cost"]:
        D.press("#summonBtn")
        D.log["summon"] += 1
        return "summon"
    # 3) 꽉 찼고 짝도 없으면 일반 하나 팔기 (칸 누르기 → 팔기 버튼)
    if not empty and s["coins"] > 150:
        i = next((i for i, u in enumerate(units) if u and u["g"] == 0), None)
        if i is not None:
            return sell(D, i)
    return None


def sell(D, i):
    D.tap_slot(i)
    D.pg.wait_for_timeout(80)
    if D.ev("CD.test.sel()") != i:
        return None
    if "selected" not in D.shots:
        D.shot("selected")   # 판넬에 초상 · 스킬 설명 · 팔기 버튼
    before = D.st()["coins"]
    D.press("#sellBtn")
    D.pg.wait_for_timeout(60)
    s2 = D.st()
    if s2["units"][i] is None and s2["coins"] > before:
        D.log["sell"] += 1
        return "sell"
    return None


def wait_end(D, limit):
    t0 = time.time()
    while D.phase() != "end" and time.time() - t0 < limit:
        D.pg.wait_for_timeout(250)
    D.pg.wait_for_selector("#againBtn", timeout=5000)
    D.pg.wait_for_timeout(500)


def play_clear(D, limit):
    seen_boss = set()
    merge_shot = False
    t0 = time.time()
    while D.phase() == "play" and time.time() - t0 < limit:
        s = D.st()
        did = bot_turn(D, s)
        if did == "merge" and not merge_shot and D.log["merge"] >= 3 and D.ev("CD.test.bannerAgo()") > 2 and s["tWave"] > 2:
            D.pg.wait_for_timeout(260)   # 초상 카드가 다 떠오를 때
            D.shot("merge")
            merge_shot = True
        b = D.ev("CD.test.boss()")
        w = s["wave"]
        # 보스가 윗길(맨 윗줄)을 걷는 동안 — 효과에 덜 묻히고 위 여백이 잘리지 않는지도 봄
        if b and w not in seen_boss and (w == 5 or w == 20) and ((b["hp"] < b["max"] * 0.97 and b["y"] < 1 and b["x"] > 1.5) or b["hp"] < b["max"] * 0.5):
            seen_boss.add(w)
            D.shot(f"boss_w{w}")
        # 팔기도 한 번은 꼭 (꽉 차기 전이라도) — 6웨이브쯤 일반 하나
        if D.log["sell"] == 0 and w >= 6 and did is None:
            i = next((i for i, u in enumerate(s["units"]) if u and u["g"] == 0), None)
            if i is not None:
                sell(D, i)
        if did is None:
            D.pg.wait_for_timeout(120)
    wait_end(D, 30)
    return D.st()


def run_device(pw, base, name, viewport, mobile, speed, seed):
    global GRADE_DMG
    b = pw.chromium.launch()
    ctx = b.new_context(viewport=viewport, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg) if mobile else None
    D = Dev(pg, name, mobile, cdp)
    pg.goto(f"{base}?seed={seed}&speed={speed}")
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(900)
    GRADE_DMG = pg.evaluate("CD_TABLE.grades.map(g => g.dmg)")
    D.shot("title")
    D.press("#codexBtn")
    pg.wait_for_timeout(300)
    D.shot("codex")
    D.press("#backBtn")
    D.press("#startBtn")
    pg.wait_for_timeout(400)
    # 소리 끄기/켜기 — 버튼 상태와 기록(mute)이 같이 바뀌는지
    D.press("#sndBtn")
    snd_off = pg.evaluate("document.getElementById('sndBtn').getAttribute('aria-pressed') === 'false' && JSON.parse(localStorage.getItem('ck-defense-v1') || '{}').mute === true")
    D.press("#sndBtn")
    snd_on = pg.evaluate("document.getElementById('sndBtn').getAttribute('aria-pressed') === 'true'")
    stage = pg.evaluate("(()=>{const a=document.querySelector('.boardWrap').getBoundingClientRect(),b=document.querySelector('.panel').getBoundingClientRect();return [a.left-6,a.top-50,b.right+6,a.bottom+6].map(Math.round)})()")
    t = time.time()
    s = play_clear(D, 420)
    D.shot("result_clear")
    clear = {"over": s["over"], "wave": s["wave"], "kills": s["kills"], "game_sec": round(s["time"]), "real_sec": round(time.time() - t), **D.log}
    print(name, "클리어 판:", clear, flush=True)
    # 패배 판: 다시 하기 → 소환 두 번만 하고 손 놓기
    D.press("#againBtn")
    pg.wait_for_timeout(400)
    for _ in range(2):
        D.press("#summonBtn")
        pg.wait_for_timeout(100)
    t = time.time()
    wait_end(D, 240)
    s = D.st()
    D.shot("result_lose")
    lose = {"over": s["over"], "wave": s["wave"], "game_sec": round(s["time"]), "real_sec": round(time.time() - t)}
    print(name, "패배 판:", lose, flush=True)
    # 기록이 남는지
    pg.reload()
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(600)
    rec = pg.evaluate("JSON.parse(localStorage.getItem('ck-defense-v1') || '{}')")
    D.shot("title_after")
    b.close()
    return {"device": name, "sound_toggle": bool(snd_off and snd_on), "stage": stage, "clear": clear, "lose": lose, "record": rec, "errors": D.errors, "shots": {k: str(v) for k, v in D.shots.items()}}


def font(n):
    for p in ("/usr/local/share/fonts/zun/PretendardVariable.ttf", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"):
        if Path(p).exists():
            return ImageFont.truetype(p, n)
    return ImageFont.load_default()


def px_compare(pw, base):
    """캐릭터 PNG 확대 방식 셋을 같은 판(같은 씨앗)에서 폰 화면으로 찍어 나란히 — 어느 쪽이 나은지 눈으로 고르려고."""
    b = pw.chromium.launch()
    crops = []
    for mode in ("nearest", "smooth", "hybrid"):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.goto(f"{base}?seed=5&px={mode}")
        pg.wait_for_selector("#startBtn")
        pg.wait_for_timeout(500)
        pg.evaluate("document.getElementById('startBtn').click()")
        for _ in range(4):
            pg.evaluate("document.getElementById('summonBtn').click()")
        pg.wait_for_timeout(1300)
        i = pg.evaluate("CD.test.state().units.findIndex(u => u)")
        p = pg.evaluate(f"CD.test.slotPoint({i})")
        path = OUT / f"px_{mode}.png"
        # 친구 한 칸 둘레만 크게 (폰 기기 픽셀 그대로)
        pg.screenshot(path=str(path), clip={"x": p["x"] - 50, "y": p["y"] - 46, "width": 100, "height": 84})
        crops.append((mode, path))
        ctx.close()
    b.close()
    return crops


def board(report, crops):
    """공식 레퍼런스 옆에 기기별 화면(합성 순간 · 보스 · 결과)과 확대 방식 비교를 두 줄로."""
    H = 820
    names = {"result_clear": "클리어 결과", "merge": "합성 순간", "boss_w20": "마지막 보스", "boss_w5": "보스(5웨이브)", "result_lose": "패배 결과", "title_after": "시작(기록 남음)"}
    by = {d["device"]: d for d in report}
    desk_crop = tuple(by["desk"]["stage"]) if "desk" in by else None

    def tile(dev, key, crop=None):
        d = by.get(dev)
        if not d or key not in d["shots"]:
            return None
        im = Image.open(d["shots"][key]).convert("RGB")
        return (f"{'데스크톱' if dev == 'desk' else '폰'} · {names[key]}", im.crop(crop) if crop else im)

    row1 = []
    if REF.exists():
        row1.append(("공식 레퍼런스 (비교용 · 게임에 안 씀)", Image.open(REF).convert("RGB")))
    row1 += [tile("desk", "merge", desk_crop), tile("desk", "boss_w20", desk_crop) or tile("desk", "boss_w5", desk_crop), tile("desk", "result_clear")]
    row2 = [tile("phone", k) for k in ("merge", "boss_w5", "boss_w20", "result_clear", "result_lose")]
    row3 = [(f"확대 방식 {m}" + (" ← 고름" if m == "hybrid" else ""), Image.open(p).convert("RGB")) for m, p in crops]
    rows = [[t for t in r if t] for r in (row1, row2, row3)]
    hs = [H, H, 380]
    f = font(30)
    lay, W = [], 0
    for r, h in zip(rows, hs):
        sc = [(lab, im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)) for lab, im in r]
        lay.append((sc, h))
        W = max(W, sum(im.width for _, im in sc) + 20 * (len(sc) + 1))
    out = Image.new("RGB", (W, sum(h + 70 for _, h in lay) + 20), "#fff1d6")
    dr = ImageDraw.Draw(out)
    y = 10
    for sc, h in lay:
        x = 20
        for lab, im in sc:
            dr.text((x, y + 8), lab, fill="#4a3530", font=f)
            out.paste(im, (x, y + 56))
            x += im.width + 20
        y += h + 70
    path = OUT / "board.png"
    out.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["desk", "phone"])
    ap.add_argument("--speed", type=float, default=6)
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    base = f"http://127.0.0.1:{port}/index.html"
    report = []
    try:
        with sync_playwright() as pw:
            if a.only in (None, "desk"):
                report.append(run_device(pw, base, "desk", {"width": 1440, "height": 900}, False, a.speed, a.seed))
            if a.only in (None, "phone"):
                report.append(run_device(pw, base, "phone", {"width": 390, "height": 844}, True, a.speed, a.seed + 1))
            crops = px_compare(pw, base)
    finally:
        srv.terminate()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    path = board(report, crops)
    bad = []
    for d in report:
        c, l = d["clear"], d["lose"]
        if c["over"] != "win":
            bad.append(f"{d['device']}: 클리어 판이 {c['over']}")
        if l["over"] != "lose":
            bad.append(f"{d['device']}: 패배 판이 {l['over']}")
        if c["merge"] < 3 or c["sell"] < 1 or c["summon"] < 5:
            bad.append(f"{d['device']}: 입력이 모자람 {c}")
        if not d["sound_toggle"]:
            bad.append(f"{d['device']}: 소리 끄기 버튼이 안 먹음")
        if not d["record"].get("clears"):
            bad.append(f"{d['device']}: 최고 기록이 안 남음")
    errs = [e for d in report for e in d["errors"]]
    print("판:", path)
    print("기대와 다른 것:", bad or "없음")
    print("콘솔 오류:", errs or "0")
    sys.exit(1 if bad or errs else 0)


if __name__ == "__main__":
    main()
