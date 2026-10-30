"""앱 설치(PWA) · 인앱 브라우저 안내 확인 — UA 를 바꿔 가며 화면 · 크기 · 서비스워커 · 오프라인을 잼.

    python3 tools/pwa_check.py          # 판 PNG → 본 레포 output/chiikawa-defense-check/pwa/ (커밋 안 함)

환경: 인스타 iOS · 인스타 Android · 카톡 iOS · 카톡 Android · iOS Safari · iPad Safari · Android Chrome · 데스크톱 Chrome(설치 프롬프트 흉내).
화면: 시작(배너) · 안내 창 · 멈춤 · 설정 · 기록 옮기기 · 게임 중 토스트 · 결과 화면 — 390×650(카톡/인스타 안 높이) · 390×844.
잼: 가로 넘침 없음 · 안내 창이 한 화면(스크롤 없음) · 토스트가 친구 칸을 안 가림 · 콘솔 오류 0.
그리고 manifest 내용 · 아이콘 크기 · 서비스워커 등록 · 인터넷 끊고 새로고침해도 게임이 열리는지 · 기록 옮기기 코드 왕복.
실제 기기에서만 되는 것(설치 창 · intent 로 크롬 열기 · 인스타 ⋯ 메뉴)은 여기서 못 봄 — README 참고.
"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def main_repo():
    try:
        common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        return Path(common).parent
    except Exception:
        return ROOT.parent.parent


OUT = main_repo() / "output" / "chiikawa-defense-check" / "pwa"

IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
AND = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36"
ENVS = [
    # 이름, UA, 기대 kind, 기대 app, 버튼 글
    ("ig_ios", IOS + " Mobile/15E148 Instagram 385.0.0.31.89 (iPhone15,2; iOS 18_5; ko_KR; ko; scale=3.00; 1179x2556; 742183412)", "ios-inapp", "instagram", "설치 방법"),
    ("ig_android", AND + " Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 650437200)", "android-inapp", "instagram", "크롬에서 열기"),
    ("kakao_ios", IOS + " Mobile/15E148 KAKAOTALK 25.6.0", "ios-inapp", "kakao", "설치 방법"),
    ("kakao_android", AND + ";KAKAOTALK 2410600", "android-inapp", "kakao", "크롬에서 열기"),
    ("ios_safari", IOS + " Version/18.5 Mobile/15E148 Safari/604.1", "ios", "", "설치 방법"),
    ("android_chrome", "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36", "android", "", "설치 방법"),
]
IPAD = ("ipad_safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15", "ios", "", "설치 방법")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Page:
    def __init__(self, ctx, name):
        self.pg = ctx.new_page()
        self.name, self.errors, self.shots = name, [], []
        self.pg.on("console", lambda m: self.errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        self.pg.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        self.pg.on("requestfailed", lambda r: self.errors.append(f"requestfailed: {r.url}") if not r.url.startswith("intent:") else None)

    def shot(self, label):
        p = OUT / f"{self.name}_{len(self.shots):02d}_{label}.png"
        self.pg.screenshot(path=str(p))
        self.shots.append((label, p))
        return p

    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)

    def click(self, sel):
        self.pg.locator(sel).first.click(force=True)   # 소환 버튼은 늘 통통 튀어서 「안정」 을 기다리면 안 끝남
        self.pg.wait_for_timeout(250)


FIT = """() => {
  const vw = innerWidth, vh = innerHeight, de = document.scrollingElement;
  const p = document.querySelector('.ia-ov:not([hidden]) .ia-panel');
  const o = { vw, vh, scrollW: de.scrollWidth, hOver: de.scrollWidth > vw + 1 };
  if (p) { const b = p.getBoundingClientRect(); o.panel = { h: Math.round(b.height), sh: p.scrollHeight, ch: p.clientHeight, sw: p.scrollWidth, cw: p.clientWidth };
    o.panelScroll = p.scrollHeight > p.clientHeight + 2; o.panelHOver = p.scrollWidth > p.clientWidth + 2 || b.right > vw + 1 || b.left < -1; }
  return o; }"""


def env_pass(pw, base, env, vp, ipad=False):
    name, ua, want_kind, want_app, want_label = env
    b = pw.chromium.launch()
    ctx = b.new_context(viewport=vp, device_scale_factor=2, is_mobile=not ipad, has_touch=True, user_agent=ua)
    if ipad:
        ctx.add_init_script("Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 })")
    tag = f"{name}_{vp['height']}"
    P = Page(ctx, tag)
    pg = P.pg
    pg.goto(f"{base}?seed=9&speed=2&tut=0")
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(700)
    r = {"env": name, "vp": f"{vp['width']}x{vp['height']}"}
    r["detect"] = P.ev("CD.test.inapp()")
    r["kind_ok"] = r["detect"]["kind"] == want_kind and r["detect"]["app"] == want_app
    r["banner"] = P.ev("(() => { const b = document.querySelector('[data-ia-banner]'); return b && !b.hidden ? b.innerText.replace(/\\s+/g, ' ') : null; })()")
    r["label_ok"] = bool(r["banner"]) and want_label in r["banner"]
    r["title_fit"] = P.ev(FIT)
    P.shot("title")
    # 안내 창 — Android 인앱은 버튼이 intent:// 로 나가므로 창을 바로 엶 (+ intent 주소 모양 확인)
    if want_kind == "android-inapp":
        r["intent"] = P.ev("InApp.intentUrl()")
        r["intent_ok"] = r["intent"].startswith("intent://127.0.0.1:") and "#Intent;scheme=https;package=com.android.chrome;" in r["intent"] and r["intent"].endswith(";end")
        P.ev("InApp.guide()")
    else:
        P.click("[data-ia-banner] [data-ia='go']")
    pg.wait_for_timeout(300)
    r["guide_fit"] = P.ev(FIT)
    r["guide_text"] = P.ev("document.querySelector('.ia-ov .ia-panel').innerText.replace(/\\s+/g, ' ').slice(0, 260)")
    P.shot("guide")
    P.click(".ia-ov [data-ia='close']")
    # 게임 시작 → 기록 하나 남기고 → 멈춤 · 설정 · 기록 옮기기
    P.click("#startBtn")
    for _ in range(4):
        P.click("#summonBtn")
    # 웨이브 3 을 넘긴 순간(=웨이브 4 시작)에 토스트가 뜨는지 — game.js 의 실제 훅으로
    P.ev("CD.test.game().cap = 999; CD.test.jumpWave(4)")
    pg.wait_for_timeout(3800)
    r["nudge"] = P.ev("""() => { const t = document.querySelector('.ia-toast.on'); if (!t) return null;
      const b = t.getBoundingClientRect(), s0 = CD.test.slotPoint(0), tile = CD.test.tile(), bw = document.querySelector('#board').getBoundingClientRect();
      return { text: t.innerText, bottom: Math.round(b.bottom), firstSlotTop: Math.round(s0.y - tile / 2), clearOfSlots: b.bottom <= s0.y - tile / 2 + 1,
               insideBoard: b.left >= bw.left - 1 && b.right <= bw.right + 1 && b.top >= bw.top - 1 }; }""")
    if r["nudge"]:
        P.shot("play_toast")
    pg.wait_for_timeout(300)
    P.click("#pauseBtn")
    r["pause_btn"] = P.ev("!!document.querySelector('#sheet [data-ia=\"go\"]')")
    r["pause_fit"] = P.ev("(() => { const s = document.querySelector('#sheet'); return { sh: s.scrollHeight, ch: s.clientHeight, scroll: s.scrollHeight > s.clientHeight + 2, hOver: document.scrollingElement.scrollWidth > innerWidth + 1 }; })()")
    P.shot("pause")
    P.click("#setBtn2")
    r["settings_btns"] = P.ev("[...document.querySelectorAll('#sheet .set-more button')].map(b => b.innerText)")
    P.shot("settings")
    P.click("#sheet [data-ia='transfer']")
    r["transfer_fit"] = P.ev(FIT)
    P.shot("transfer")
    P.click(".ia-ov [data-ia='close']")
    P.click("#setDone")
    P.click("#resumeBtn")
    # 결과 화면 한 줄 — 괴물을 한꺼번에 몰아 지게 함
    P.ev("CD.test.game().cap = 5; CD.test.spawnTrait('fast', 12)")
    pg.wait_for_selector("#againBtn", timeout=20000)
    pg.wait_for_timeout(500)
    r["end_line"] = P.ev("(() => { const l = document.querySelector('#sheet .ia-line'); return l && !l.hidden ? l.innerText : null; })()")
    r["end_fit"] = P.ev("(() => { const s = document.querySelector('#sheet'); return { scroll: s.scrollHeight > s.clientHeight + 2, hOver: document.scrollingElement.scrollWidth > innerWidth + 1 }; })()")
    P.shot("end")
    r["errors"] = P.errors
    r["shots"] = [str(p) for _, p in P.shots]
    b.close()
    return r, P.shots


def desktop_pass(pw, base):
    """데스크톱 Chrome: 설치 프롬프트 흉내 → 배너 · 「설치」 버튼 → prompt() 불림. 그리고 manifest · SW · 오프라인."""
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    P = Page(ctx, "desk")
    pg = P.pg
    pg.goto(f"{base}?seed=9&speed=2&tut=0")
    pg.wait_for_selector("#startBtn")
    pg.wait_for_timeout(600)
    r = {"env": "desktop_chrome"}
    r["banner_before"] = P.ev("(() => { const b = document.querySelector('[data-ia-banner]'); return b && !b.hidden; })()")
    P.ev("""window.__prompted = 0; const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e);""")
    pg.wait_for_timeout(200)
    r["banner_after_prompt_event"] = P.ev("(() => { const b = document.querySelector('[data-ia-banner]'); return b && !b.hidden ? b.innerText.replace(/\\s+/g, ' ') : null; })()")
    P.shot("title_prompt")
    P.click("[data-ia-banner] [data-ia='go']")
    r["prompt_called"] = P.ev("window.__prompted")
    # manifest · 아이콘
    man = P.ev("""async () => { const href = document.querySelector('link[rel=manifest]').href; const res = await fetch(href);
      const j = await res.json(); const icons = [];
      for (const ic of j.icons) { const u = new URL(ic.src, href).href; const im = new Image(); im.src = u; await im.decode(); icons.push({ src: ic.src, sizes: ic.sizes, purpose: ic.purpose, real: im.naturalWidth + 'x' + im.naturalHeight }); }
      const at = document.querySelector('link[rel=apple-touch-icon]').href; const ai = new Image(); ai.src = at; await ai.decode();
      return { status: res.status, type: res.headers.get('content-type'), name: j.name, short_name: j.short_name, start_url: new URL(j.start_url, href).href, scope: new URL(j.scope, href).href,
               display: j.display, display_override: j.display_override, orientation: j.orientation, theme: j.theme_color, bg: j.background_color, icons, apple: ai.naturalWidth + 'x' + ai.naturalHeight,
               metas: ['apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'theme-color', 'mobile-web-app-capable'].map(n => [n, (document.querySelector('meta[name=\"' + n + '\"]') || {}).content]) }; }""")
    r["manifest"] = man
    r["manifest_ok"] = (man["status"] == 200 and man["name"] == "치이카와 랜덤 디펜스" and man["short_name"] == "랜덤 디펜스" and man["display"] == "standalone"
                        and man["start_url"].endswith("/?src=pwa") and all(i["sizes"] == i["real"] for i in man["icons"]) and man["apple"] == "180x180"
                        and any(i["purpose"] == "maskable" for i in man["icons"]))
    # 서비스워커 — 등록 · 페이지를 다스리는지 · warm 으로 그림까지 담는지
    r["sw"] = P.ev("""async () => { const reg = await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 300));
      return { scope: reg.scope, active: !!reg.active, script: reg.active && reg.active.scriptURL, controlled: !!navigator.serviceWorker.controller }; }""")
    r["warm_added"] = P.ev("InApp.warm()")
    # CDN 글꼴: 이 확인 기계엔 갈무리가 깔려 있어 local() 이 먼저 잡힘 → woff2 를 직접 한 번 받아 SW 캐시를 거치게 함
    FONT = "https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/Galmuri11.woff2"
    r["font_online"] = P.ev("(u) => fetch(u, { mode: 'cors' }).then(r => r.status + ' ' + r.type)", FONT)
    r["cache"] = P.ev("""async () => { const ks = await caches.keys(); let n = 0, img = 0, font = 0;
      for (const k of ks) { const c = await caches.open(k); const reqs = await c.keys(); n += reqs.length; img += reqs.filter(q => /\\.(png|webp)$/.test(q.url)).length; font += reqs.filter(q => /galmuri/.test(q.url)).length; }
      return { names: ks, entries: n, images: img, galmuri: font }; }""")
    # 오프라인 새로고침
    errs_before = list(P.errors)
    ctx.set_offline(True)
    P.errors.clear()
    pg.reload()
    try:
        pg.wait_for_selector("#startBtn", timeout=15000)
        pg.wait_for_function("document.querySelector('#loading').classList.contains('done')", timeout=15000)
        pg.wait_for_timeout(800)
        r["offline"] = P.ev("""() => ({ phase: CD.test.phase(), title: !!document.querySelector('#startBtn'), monReady: CD.test.monReady(),
          chars: CD.test.charInfo('chiikawa').real, online: navigator.onLine })""")
        # 끊긴 채로 CDN 글꼴을 진짜 글꼴로 불러 봄 (캐시에 cors 응답이 있어야 됨 — 불투명 응답이면 실패)
        r["offline"]["font"] = P.ev("(u) => new FontFace('IaCheck', 'url(' + u + ')').load().then(f => f.status).catch(e => 'fail ' + e)", FONT)
        P.click("#startBtn")
        P.click("#summonBtn")
        pg.wait_for_timeout(500)
        r["offline_play"] = P.ev("CD.test.state().units || CD.test.game().slots.filter(s => s.u).length")
        P.shot("offline_play")
    except Exception as e:
        r["offline"] = {"error": str(e)[:200]}
        P.shot("offline_fail")
    r["offline_errors"] = list(P.errors)
    ctx.set_offline(False)
    # ?nosw 면 등록 안 함 (확인 도구 · 문제 찾기용)
    P2 = Page(b.new_context(viewport={"width": 1200, "height": 800}), "nosw")
    P2.pg.goto(f"{base}?nosw&tut=0")
    P2.pg.wait_for_selector("#startBtn")
    P2.pg.wait_for_timeout(600)
    r["nosw_regs"] = P2.ev("navigator.serviceWorker.getRegistrations().then(rs => rs.length)")
    r["errors"] = errs_before + P2.errors
    b.close()
    return r, P.shots


def transfer_pass(pw, base):
    """기록 옮기기: 인스타 안(기록 있음)에서 코드 → 바깥 브라우저(빈 기록)로 ?ia_rec= 주소 · 붙여 넣기 둘 다."""
    b = pw.chromium.launch()
    r = {}
    src = b.new_context(viewport={"width": 390, "height": 650}, is_mobile=True, has_touch=True, user_agent=ENVS[0][1])
    P = Page(src, "xfer_src")
    P.pg.goto(f"{base}?tut=0")
    P.pg.wait_for_selector("#startBtn")
    P.ev("""localStorage.setItem('ck-defense-v1', JSON.stringify({ plays: 7, tut: 1, found: [1], set: { sfx: false, music: false, vib: true, calm: false, spd: 1 },
      d: { easy: { plays: 5, best: 20, clears: 2, bestTime: 900, endless: 26 }, normal: { plays: 2, best: 12 } } }))""")
    code = P.ev("InApp.exportCode()")
    carry = P.ev("InApp.carryUrl()")
    r["code_len"], r["carry_len"] = len(code), len(carry)
    r["code_has_settings"] = "spd" in P.ev("(c) => atob(c.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))", code)
    # 바깥 브라우저: 기록이 조금 있음 — 합쳐지는지 (가장 빠른 클리어는 작은 쪽, 최고는 큰 쪽)
    dst = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=ENVS[4][1])
    Q = Page(dst, "xfer_dst")
    Q.pg.goto(f"{base}?tut=0")
    Q.pg.wait_for_selector("#startBtn")
    Q.ev("localStorage.setItem('ck-defense-v1', JSON.stringify({ plays: 3, d: { easy: { plays: 3, best: 20, clears: 1, bestTime: 700 }, hard: { plays: 1, best: 9 } } }))")
    Q.pg.goto(carry.replace("?", "?tut=0&", 1))
    Q.pg.wait_for_selector("#startBtn")
    Q.pg.wait_for_timeout(800)
    got = json.loads(Q.ev("localStorage.getItem('ck-defense-v1')"))
    r["after_url_import"] = got
    r["url_stripped"] = "ia_rec" not in Q.ev("location.href")
    r["merge_ok"] = (got["plays"] == 7 and got["d"]["easy"] == {"plays": 5, "best": 20, "clears": 2, "endless": 26, "bestTime": 700}
                     and got["d"]["hard"]["best"] == 9 and got["d"]["normal"]["best"] == 12 and got["found"] == [1] and got.get("tut") == 1 and "set" not in got)
    r["title_notice"] = Q.ev("(() => { const b = document.querySelector('[data-ia-banner]'); return b ? b.innerText : null; })()")
    Q.shot("imported_title")
    # 붙여 넣기 길 + 잘린 코드
    r["bad_code"] = Q.ev("InApp.importCode('IA1.abc.zzzz')")
    r["cut_code"] = Q.ev("(c) => InApp.importCode(c.slice(0, -9) + c.slice(-5))", code)
    r["errors"] = P.errors + Q.errors
    b.close()
    return r, P.shots + Q.shots


def font(n):
    for f in ("/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"):
        try:
            return ImageFont.truetype(f, n)
        except OSError:
            pass
    return ImageFont.load_default()


def board(rows, path, w=260):
    """한 줄 = 한 환경, 칸 = 화면. 크기를 줄여 나란히."""
    cols = max(len(r[1]) for r in rows)
    th = []
    for name, shots in rows:
        ims = []
        for label, p in shots:
            im = Image.open(p).convert("RGB")
            ims.append((label, im.resize((w, int(im.height * w / im.width)))))
        th.append((name, ims))
    hs = [max(im.height for _, im in ims) + 40 for _, ims in th]
    W = 150 + cols * (w + 10)
    B = Image.new("RGB", (W, sum(hs) + 10), "#2b2b33")
    d = ImageDraw.Draw(B)
    y = 10
    for (name, ims), h in zip(th, hs):
        d.text((10, y + 4), name, fill="#fff", font=font(18))
        for i, (label, im) in enumerate(ims):
            x = 150 + i * (w + 10)
            d.text((x, y + 2), label, fill="#ffe08a", font=font(16))
            B.paste(im, (x, y + 28))
        y += h
    B.save(path)
    return path


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    base = f"http://127.0.0.1:{port}/index.html"
    report = {"envs": []}
    boards = {"650": [], "844": []}
    try:
        with sync_playwright() as pw:
            for env in ENVS:
                for h in (650, 844):
                    r, shots = env_pass(pw, base, env, {"width": 390, "height": h})
                    report["envs"].append(r)
                    boards[str(h)].append((env[0], shots))
                    print(env[0], h, "kind", r["detect"]["kind"], "| 배너", r["banner"], "| 토스트", bool(r["nudge"]), "| 오류", len(r["errors"]), flush=True)
            r, shots = env_pass(pw, base, IPAD, {"width": 820, "height": 1180}, ipad=True)
            report["envs"].append(r)
            boards["ipad"] = [(IPAD[0], shots)]
            print("ipad kind", r["detect"]["kind"], "| 오류", len(r["errors"]), flush=True)
            r, shots = desktop_pass(pw, base)
            report["desktop"] = r
            boards["desk"] = [("desktop", shots)]
            print("desktop", {k: r[k] for k in ("banner_before", "banner_after_prompt_event", "prompt_called", "manifest_ok", "sw", "warm_added", "cache", "offline", "nosw_regs")}, flush=True)
            r, shots = transfer_pass(pw, base)
            report["transfer"] = r
            boards["xfer"] = [("transfer", shots)]
            print("transfer", {k: r[k] for k in ("code_len", "carry_len", "code_has_settings", "url_stripped", "merge_ok", "title_notice", "bad_code", "cut_code")}, flush=True)
    finally:
        srv.terminate()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    paths = [board(boards["650"], OUT / "board_390x650.png"), board(boards["844"], OUT / "board_390x844.png"),
             board(boards["ipad"] + boards["desk"] + boards["xfer"], OUT / "board_other.png", w=320)]
    bad = []
    for r in report["envs"]:
        t = f"{r['env']} {r['vp']}"
        if not r["kind_ok"]:
            bad.append(f"{t}: 판별 {r['detect']}")
        if not r["label_ok"]:
            bad.append(f"{t}: 배너 {r['banner']}")
        if r.get("intent_ok") is False:
            bad.append(f"{t}: intent {r['intent']}")
        for k in ("title_fit", "guide_fit", "transfer_fit"):
            f = r[k]
            if f.get("hOver") or f.get("panelHOver"):
                bad.append(f"{t}: {k} 가로 넘침 {f}")
            if k != "title_fit" and f.get("panelScroll"):
                bad.append(f"{t}: {k} 한 화면에 안 들어감 {f.get('panel')}")
        if not r["nudge"]:
            bad.append(f"{t}: 게임 중 토스트 안 뜸")
        elif not (r["nudge"]["clearOfSlots"] and r["nudge"]["insideBoard"]):
            bad.append(f"{t}: 토스트가 친구 칸을 가림 {r['nudge']}")
        if not r["pause_btn"]:
            bad.append(f"{t}: 멈춤 화면에 설치 버튼 없음")
        if r["pause_fit"]["hOver"] or r["end_fit"]["hOver"]:
            bad.append(f"{t}: 멈춤/결과 가로 넘침")
        if not r["end_line"]:
            bad.append(f"{t}: 결과 화면 한 줄 없음")
        if r["errors"]:
            bad.append(f"{t}: 콘솔 {r['errors'][:3]}")
    d = report["desktop"]
    if d["banner_before"] or not d["banner_after_prompt_event"] or "설치" not in d["banner_after_prompt_event"] or d["prompt_called"] != 1:
        bad.append(f"desktop: 프롬프트 흐름 {d['banner_before']} {d['banner_after_prompt_event']} {d['prompt_called']}")
    if not d["manifest_ok"]:
        bad.append(f"manifest: {d['manifest']}")
    if not (d["sw"]["active"] and d["sw"]["controlled"]):
        bad.append(f"sw: {d['sw']}")
    off = d.get("offline") or {}
    if not (off.get("title") and off.get("monReady") and off.get("chars") and off.get("font") == "loaded") or not d.get("offline_play"):
        bad.append(f"오프라인: {off} play={d.get('offline_play')}")
    if d["offline_errors"]:
        bad.append(f"오프라인 콘솔: {d['offline_errors'][:4]}")
    if d["nosw_regs"]:
        bad.append("?nosw 인데 서비스워커가 등록됨")
    if d["errors"]:
        bad.append(f"desktop 콘솔: {d['errors'][:3]}")
    x = report["transfer"]
    if not (x["merge_ok"] and x["url_stripped"] and not x["code_has_settings"] and not x["bad_code"]["ok"] and not x["cut_code"]["ok"]):
        bad.append(f"기록 옮기기: {x}")
    if x["errors"]:
        bad.append(f"기록 옮기기 콘솔: {x['errors'][:3]}")
    print("\n판:", *paths, sep="\n  ")
    print("\n" + ("통과" if not bad else "문제 " + str(len(bad)) + "개:\n  " + "\n  ".join(bad)))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
