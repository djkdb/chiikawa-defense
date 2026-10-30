"""v2 개편(난이도 · 특성 · 보스 기술 · 확률 업 · 행운 · 신화 · 3택 보상 · 무한 모드)을 실제 입력으로 확인하고 판을 남깁니다.

  python3 portfolio_src/chiikawa-defense/tools/play_check_v2.py                # 데스크톱 + 폰
  python3 portfolio_src/chiikawa-defense/tools/play_check_v2.py --only phone
  python3 portfolio_src/chiikawa-defense/tools/play_check_v2.py --speed 8

한 기기에서 하는 일 (봇은 CD.test 로 판을 **읽기만** 하고, 움직임은 전부 진짜 마우스 · 손가락 입력)
  1) 시작 화면에서 「쉬움」 칸을 눌러 고르고 시작 → 끝까지 클리어
     소환 버튼 · 칸 끌어 합성 · 등급 강화 · 「확률」 버튼 · 「행운 소환」 → 도전 · 보스 뒤 3택 카드 누르기 · 팔기
     그동안 괴물 특성 5종이 나왔는지(처치 사건), 보스 기술 넷(침묵 · 소환 · 회복 · 셔플)이 쓰였는지 셉니다
  2) 클리어 화면 → 「무한 모드로 계속」 → 21웨이브가 시작되는지
  3) 신화 레시피 1회 — 판 준비만 CD.test.put(전설 셋)로 하고, 「신화 레시피」 → 「만들기!」 는 진짜 누름. 신화 스킬이 터지는지
  4) 지옥 패배 1판 — 기록(localStorage)으로 지옥을 연 뒤 시작 화면에서 「지옥」 을 눌러 고르고 손 놓기
  콘솔 오류 · 경고 · 404 는 0 이어야 합니다.
판(기기별 화면 모음)은 output/chiikawa-defense-check/v2/board.png (커밋 안 함).
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


def main_repo():
    """worktree 에서 돌려도 결과는 본 레포의 output/ 에 (사람이 한 곳에서 보게)."""
    try:
        common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        return Path(common).parent if common else REPO
    except OSError:
        return REPO


OUT = main_repo() / "output" / "chiikawa-defense-check" / "v2"
STORE = "ck-defense-v1"
CARD = {"power": 6, "legend": 5, "epic": 4.5, "coins": 3, "clover": 2.6, "room": 2.2, "cheap": 1.8, "lift": 1.2, "double": 1}
ODDS_AT = [2, 6, 10]


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Dev:
    def __init__(self, pg, name, touch, cdp):
        self.pg, self.name, self.touch, self.cdp = pg, name, touch, cdp
        self.errors, self.shots = [], {}
        self.log = {k: 0 for k in ("summon", "merge", "sell", "upgrade", "odds", "luck", "pick", "craft")}
        pg.on("console", lambda m: self.errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        pg.on("requestfailed", lambda r: self.errors.append(f"requestfailed: {r.url}"))

    def shot(self, label, clip=None):
        path = OUT / f"{self.name}_{len(self.shots):02d}_{label}.png"
        self.pg.screenshot(path=str(path), clip=clip)
        self.shots[label] = path
        return path

    def ev(self, js):
        return self.pg.evaluate(js)

    def st(self):
        return self.ev("CD.test.state()")

    def phase(self):
        return self.ev("CD.test.phase()")

    def press(self, sel):
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
        self.pg.wait_for_timeout(40)

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


def bot_turn(D, s, T):
    """잘하는 사람처럼 한 수 (tools/sim.js 의 smart 와 같은 셈). 돌려주는 값: 한 일 이름"""
    ph = D.phase()
    if ph == "pick":
        if "pick" not in D.shots:
            D.shot("pick")
        cards = s["pick"] or []
        k = max(range(len(cards)), key=lambda i: CARD.get(cards[i], 0)) if cards else 0
        D.press(f"#card{k}")
        D.log["pick"] += 1
        return "pick"
    if ph != "play":
        return None
    units = s["units"]
    mates = D.ev("CD.test.mates()")
    if mates:
        a, b = mates[0]
        D.drag(a, b)
        D.pg.wait_for_timeout(50)
        if D.st()["units"][a] is None:
            D.log["merge"] += 1
            return "merge"
        return None
    empty = [i for i, u in enumerate(units) if u is None]
    legends = sum(1 for u in units if u and u["g"] == 3)
    if s["clovers"] > (2 if legends >= 2 else 0) and empty:
        D.press("#luckBtn")
        D.pg.wait_for_timeout(120)
        if not D.pg.locator("#luck1").count():   # 그사이 보스가 죽어 보상 화면이 먼저 열렸으면 다음 차례에
            return None
        if "luck_sheet" not in D.shots:
            D.shot("luck_sheet")
        before = D.st()["clovers"]
        D.press("#luck2" if s["wave"] >= 12 else "#luck1")
        D.pg.wait_for_timeout(120)
        if "luck_result" not in D.shots:
            D.shot("luck_result")
        D.press("#resumeBtn")
        if D.st()["clovers"] < before:
            D.log["luck"] += 1
            return "luck"
        return None
    lv = s["oddsLv"]
    if lv < len(ODDS_AT) and s["wave"] >= ODDS_AT[lv] and s["coins"] >= s["oddsCost"] + 20:
        D.press("#oddsBtn")
        if D.st()["oddsLv"] > lv:
            D.log["odds"] += 1
            return "odds"
    pw = [0, 0, 0, 0]
    for u in units:
        if u:
            pw[T["upGroup"][u["g"]]] += T["gdmg"][u["g"]]
    best, best_v = None, 1.3 / s["cost"]
    for k in range(4):
        c = D.ev(f"CD.test.upCost({k})")
        if c and c < 1e9:
            v = 0.2 * pw[k] / c
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
    if not empty and s["coins"] > 150:
        i = next((i for i, u in enumerate(units) if u and u["g"] == 0), None)
        if i is not None:
            D.tap_slot(i)
            D.pg.wait_for_timeout(80)
            if D.ev("CD.test.sel()") == i:
                D.press("#sellBtn")
                D.log["sell"] += 1
                return "sell"
    return None


def play_until_end(D, T, limit, shots=True):
    t0 = time.time()
    shot_w = set()
    while D.phase() not in ("end",) and time.time() - t0 < limit:
        s = D.st()
        did = bot_turn(D, s, T)
        if shots:
            b = s["boss"]
            seen = D.ev("CD.test.seen()")
            # 보스 기술 예고(준비) · 쓰는 중 장면
            if b and b["phase"] in ("warn", "cast") and f"boss_{b['bt']}_{b['phase']}" not in shot_w and D.phase() == "play":
                shot_w.add(f"boss_{b['bt']}_{b['phase']}")
                D.shot(f"boss_{b['bt']}_{b['phase']}")
            if s["wave"] >= 12 and "traits" not in shot_w and len(s["traitsOn"]) >= 2 and D.phase() == "play":
                shot_w.add("traits")
                D.shot("traits")
        if did is None:
            D.pg.wait_for_timeout(100)
    D.pg.wait_for_timeout(1200)


def run_device(pw, base, name, viewport, mobile, speed, seed):
    b = pw.chromium.launch()
    ctx = b.new_context(viewport=viewport, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg) if mobile else None
    D = Dev(pg, name, mobile, cdp)
    out = {"device": name}
    pg.goto(f"{base}?seed={seed}&speed={speed}")
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(900)
    T = pg.evaluate("({upGroup: CD_TABLE.upGroup, gdmg: CD_TABLE.grades.map(g => g.dmg)})")
    # 1) 쉬움 고르기 → 클리어
    D.press(".diff[data-i='0']")
    out["diff_pick"] = pg.evaluate("document.querySelector(\".diff[data-i='0']\").classList.contains('on')")
    D.shot("title_easy")
    D.press("#startBtn")
    pg.wait_for_timeout(300)
    out["diff_started"] = D.st()["diff"]
    t = time.time()
    play_until_end(D, T, 520)
    s = D.st()
    D.shot("result_easy")
    out["easy"] = {"over": s["over"], "wave": s["wave"], "game_sec": round(s["time"]), "real_sec": round(time.time() - t), **D.log}
    seen = D.ev("CD.test.seen()")
    out["seen"] = seen
    print(name, "쉬움 판:", out["easy"], flush=True)
    # 2) 무한 모드
    if s["over"] == "win":
        D.press("#endlessBtn")
        t0 = time.time()
        while D.st()["wave"] < 21 and time.time() - t0 < 60:
            bot_turn(D, D.st(), T)
            pg.wait_for_timeout(150)
        pg.wait_for_timeout(1500)
        s2 = D.st()
        out["endless"] = {"endless": s2["endless"], "wave": s2["wave"], "phase": D.phase()}
        D.shot("endless")
        D.press("#pauseBtn")
        D.press("#quitBtn")
        pg.wait_for_timeout(300)
    # 3) 신화 레시피 (판 준비만 test, 누르기는 진짜)
    D.press(".diff[data-i='1']")
    D.press("#startBtn")
    pg.wait_for_timeout(300)
    pg.evaluate("CD.test.put(5,'chiikawa',3); CD.test.put(6,'hachiware',3); CD.test.put(9,'usagi',3); CD.test.put(10,'shisa',0); CD.test.put(13,'momonga',1)")
    pg.wait_for_timeout(500)
    D.press("#mythBtn")
    pg.wait_for_timeout(200)
    D.shot("recipe_before")
    D.press("#craft0")
    pg.wait_for_timeout(700)
    D.shot("myth_born")
    u = D.st()["units"][5]
    out["myth"] = {"made": D.st()["made"], "slot5": u}
    D.log["craft"] += 1
    # 신화 스킬이 터지는 걸 보려고 괴물을 조금 부름
    pg.evaluate("CD.test.jumpWave(6)")
    t0 = time.time()
    while (D.ev("CD.test.seen()").get("mythskill", 0) < 1) and time.time() - t0 < 40:
        pg.wait_for_timeout(200)
    out["myth"]["skill"] = D.ev("CD.test.seen()").get("mythskill", 0)
    D.shot("myth_skill")
    pg.evaluate("document.getElementById('pauseBtn').click()")
    D.press("#quitBtn")
    # 4) 지옥: 기록으로 열고 다시 불러 시작 화면에서 고르기 → 손 놓고 패배
    pg.evaluate(f"(()=>{{const r=JSON.parse(localStorage.getItem('{STORE}')||'{{}}');r.d=r.d||{{}};for(const k of ['easy','normal','hard'])r.d[k]=Object.assign({{plays:1,best:20}},r.d[k]||{{}},{{clears:1}});localStorage.setItem('{STORE}',JSON.stringify(r));}})()")
    pg.reload()
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(700)
    D.press(".diff[data-i='3']")
    D.shot("title_hell")
    out["hell_chips"] = pg.evaluate("document.getElementById('vchips').innerText")
    D.press("#startBtn")
    pg.wait_for_timeout(300)
    for _ in range(3):
        D.press("#summonBtn")
    t = time.time()
    while D.phase() != "end" and time.time() - t < 200:
        if D.phase() == "pick":
            D.press("#card0")
        pg.wait_for_timeout(250)
    pg.wait_for_selector("#againBtn", timeout=8000)
    pg.wait_for_timeout(400)
    s = D.st()
    D.shot("result_hell")
    out["hell"] = {"over": s["over"], "wave": s["wave"], "diff": s["diff"], "chips": s["chips"]}
    print(name, "지옥 판:", out["hell"], flush=True)
    out["record"] = pg.evaluate(f"JSON.parse(localStorage.getItem('{STORE}') || '{{}}')")
    out["errors"] = D.errors
    out["shots"] = {k: str(v) for k, v in D.shots.items()}
    out["log"] = D.log
    b.close()
    return out


def font(n):
    for p in ("/usr/local/share/fonts/zun/PretendardVariable.ttf", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"):
        if Path(p).exists():
            return ImageFont.truetype(p, n)
    return ImageFont.load_default()


def board(report):
    keys = ["title_easy", "boss_silence_warn", "boss_silence_cast", "boss_summon_cast", "boss_heal_cast", "boss_shuffle_cast", "traits",
            "luck_result", "pick", "result_easy", "endless", "recipe_before", "myth_born", "myth_skill", "title_hell", "result_hell"]
    rows = []
    for d in report:
        row = [(f"{d['device']} · {k}", Image.open(d["shots"][k]).convert("RGB")) for k in keys if k in d["shots"]]
        rows.append(row)
    H = 640
    f = font(26)
    lay, W = [], 0
    for r in rows:
        sc = [(lab, im.resize((max(1, int(im.width * H / im.height)), H), Image.LANCZOS)) for lab, im in r]
        # 한 줄에 8장씩
        for i in range(0, len(sc), 8):
            part = sc[i:i + 8]
            lay.append(part)
            W = max(W, sum(im.width for _, im in part) + 16 * (len(part) + 1))
    out = Image.new("RGB", (W, len(lay) * (H + 56) + 16), "#fff1d6")
    dr = ImageDraw.Draw(out)
    y = 8
    for part in lay:
        x = 16
        for lab, im in part:
            dr.text((x, y + 6), lab, fill="#4a3530", font=f)
            out.paste(im, (x, y + 44))
            x += im.width + 16
        y += H + 56
    path = OUT / "board.png"
    out.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["desk", "phone"])
    ap.add_argument("--speed", type=float, default=8)
    ap.add_argument("--seed", type=int, default=21)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()
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
    finally:
        srv.terminate()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    path = board(report)
    bad = []
    for d in report:
        n = d["device"]
        e, sn = d["easy"], d["seen"]
        if not d["diff_pick"] or d["diff_started"] != 0:
            bad.append(f"{n}: 난이도 「쉬움」 고르기가 안 먹음")
        if e["over"] != "win":
            bad.append(f"{n}: 쉬움 판이 {e['over']} ({e['wave']}웨이브)")
        for k in ("odds", "luck", "pick", "merge", "summon", "upgrade"):
            if e[k] < 1:
                bad.append(f"{n}: 「{k}」 입력이 한 번도 없음")
        for t in ("fast", "armor", "regen", "split", "revive"):
            if not sn.get(f"kill:{t}"):
                bad.append(f"{n}: 특성 {t} 괴물을 못 봄")
        for bt in ("silence", "summon", "heal", "shuffle"):
            if not sn.get(f"bcast:{bt}"):
                bad.append(f"{n}: 보스 기술 {bt} 을 못 봄")
        if not d.get("endless") or not d["endless"]["endless"] or d["endless"]["wave"] < 21:
            bad.append(f"{n}: 무한 모드 진입 실패 {d.get('endless')}")
        m = d["myth"]
        if 0 not in m["made"] or not m["slot5"] or m["slot5"]["g"] != 4 or m["skill"] < 1:
            bad.append(f"{n}: 신화 레시피 실패 {m}")
        if d["hell"]["over"] != "lose" or d["hell"]["diff"] != 3:
            bad.append(f"{n}: 지옥 패배 판 이상 {d['hell']}")
    errs = [f"{d['device']}: {e}" for d in report for e in d["errors"]]
    print("판:", path)
    print("기대와 다른 것:", bad or "없음")
    print("콘솔 오류:", errs or "0")
    sys.exit(1 if bad or errs else 0)


if __name__ == "__main__":
    main()
