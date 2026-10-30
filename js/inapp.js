/* inapp.js — 「앱으로 설치」 안내 · 인앱 브라우저(인스타 · 카톡 …) 판별 · 서비스워커 등록 · 기록 옮기기.
   게임과 무관한 독립 파일. 다른 정적 웹앱 폴더에 inapp.css · js/inapp.js · sw.js · manifest.webmanifest 를 복사하고
   InApp.init({...}) 한 번 + 보여 줄 자리에 InApp.bannerHtml() · buttonHtml() · lineHtml() · nudge() 를 부르면 됩니다 (README 「다른 게임에 붙이기」).

   왜 필요한가: 릴스를 보고 들어오는 사람은 거의 인스타그램 앱 안 브라우저로 엶. 거기서는 홈 화면 추가(PWA 설치)가 안 되므로
   「바깥 브라우저로 열기 → 설치」 로 이끌어야 함. 인앱 브라우저와 바깥 브라우저 · 설치 앱은 저장 공간이 따로라 기록도 안 넘어감
   → 바깥으로 보낼 때 주소에 기록을 담아(?ia_rec=) 보내고, 안 되면 「기록 옮기기 코드」.

   UA 는 이 파일에서만, 「어느 앱 · 브라우저 안인가」 를 가르는 데만 씀 (화면 배치는 각 게임이 화면 크기로). */
(function () {
  'use strict';
  const ua = navigator.userAgent || '';
  const Q = new URLSearchParams(location.search);
  const C = {
    id: 'app',                 // localStorage 열쇠 앞머리 (닫은 배너 · 토스트 시각)
    name: '이 게임',
    short: '',                 // 홈 화면 아이콘 밑 이름 (manifest 의 short_name 과 같게)
    icon: '',                  // 안내 창에 보일 아이콘 (홈 화면 미리보기)
    sw: 'sw.js',               // 서비스워커 경로 ('' 면 등록 안 함)
    stores: [],                // 기록 옮기기: [{ key, pack(obj)→obj, merge(mine, theirs)→obj }]
    cls: { sheet: 'ia-sheet', btn: 'ia-btn', btn2: 'ia-btn ia-btn2' },   // 각 게임 UI 키트 클래스로 바꿔 끼움
    toastIn: null,             // 게임 중 토스트를 붙일 요소(선택자) — 없으면 화면 위쪽 가운데
    canNudge: null,            // () => bool : 지금 게임 중 토스트를 띄워도 되나 (보상 창 · 배너와 안 겹치게)
    onOpen: null,              // 게임 중 토스트를 눌러 안내 창을 열기 직전 (게임 멈춤)
    onImport: null,            // 기록을 가져온 뒤 (시작 화면 다시 그리기 등)
    hideDays: 3,               // 배너 X · 토스트를 본 뒤 다시 안 보일 날 수
  };
  let deferred = null, installed = false, imported = false;

  // 설치 프롬프트는 일찍 옴 — init 전이라도 잡아 둠 (Android Chrome · 데스크톱 Chrome/Edge)
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; refresh(); });
  addEventListener('appinstalled', () => { installed = true; deferred = null; refresh(); say('설치됐어요! 홈 화면의 아이콘으로 열어요'); });
  // 첫 방문에 받은 그림 수백 장을 SW 에 넘기려면 자원 목록이 기본 250 개에서 잘리지 않아야 함
  try { performance.setResourceTimingBufferSize(4000); } catch (e) { /* 옛 브라우저 */ }

  // ── 어디서 열렸나 ───────────────────────────────────────
  function detect() {
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;   // iPad 는 Mac UA 로 나옴
    const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS;
    const android = /Android/i.test(ua);
    let app = '';
    if (/Instagram/i.test(ua)) app = 'instagram';
    else if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) app = 'facebook';
    else if (/KAKAOTALK/i.test(ua)) app = 'kakao';
    else if (/\bLine\//.test(ua)) app = 'line';
    else if (/NAVER/.test(ua)) app = 'naver';
    else if (/DaumApps/i.test(ua)) app = 'daum';
    else if (/Threads|Barcelona/.test(ua)) app = 'threads';
    else if (android && /; wv\)/.test(ua)) app = 'webview';
    else if (ios && !/Safari\//.test(ua) && !navigator.standalone) app = 'webview';   // WKWebView 는 UA 에 Safari/ 가 없음
    let browser = 'other';
    if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : 'safari';
    else if (android) browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : /EdgA/.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Chrome\//.test(ua) ? 'chrome' : 'other';
    else browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
    const mm = (q) => !!(window.matchMedia && matchMedia(q).matches);
    const standalone = navigator.standalone === true || mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || mm('(display-mode: minimal-ui)');
    const os = ios ? 'ios' : android ? 'android' : 'desktop';
    // kind = 무엇을 안내할지
    const kind = standalone ? 'app' : app ? (os === 'desktop' ? 'desktop' : os + '-inapp') : os;
    return { os, app, browser, standalone, kind };
  }
  const E = detect();
  const APPNAME = { instagram: '인스타그램', facebook: '페이스북', kakao: '카카오톡', line: '라인', naver: '네이버 앱', daum: '다음 앱', threads: '스레드', webview: '앱' };

  // ── 작은 도구 ───────────────────────────────────────────
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(C.id + '-ia-' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(C.id + '-ia-' + k, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 — 다음에도 보일 뿐 */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(msg) {
    let el = document.querySelector('.ia-say');
    if (!el) { el = document.createElement('div'); el.className = 'ia-say'; el.setAttribute('role', 'status'); document.body.appendChild(el); el.addEventListener('click', () => el.classList.remove('on')); }
    el.textContent = msg; el.classList.add('on');
    clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove('on'), 2600);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 인앱 브라우저는 막혀 있을 때가 많음 → 옛 방식 */ }
    try {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch (e) { return false; }
  }

  // ── 기록 옮기기 코드 ─────────────────────────────────────
  // IA1.<base64url(JSON)>.<검사 4자> — 저장소마다 pack 으로 줄인 값만(설정 같은 기기별 값은 빼게)
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).slice(-4).padStart(4, '0'); }
  const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function readStore(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function exportCode() {
    const o = {};
    let any = false;
    C.stores.forEach((s) => {
      const v = readStore(s.key);
      if (v == null) return;
      const p = s.pack ? s.pack(v) : v;
      if (p != null) { o[s.key] = p; any = true; }
    });
    if (!any) return '';
    const body = b64e(JSON.stringify(o));
    return 'IA1.' + body + '.' + hash(body);
  }
  function importCode(code) {
    const m = /IA1\.([A-Za-z0-9_-]+)\.([0-9a-z]{4})/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m) return { ok: false, why: '코드 모양이 아니에요 (IA1. 로 시작해요)' };
    if (hash(m[1]) !== m[2]) return { ok: false, why: '코드가 일부 잘렸어요 — 처음부터 끝까지 다시 복사해 주세요' };
    let o;
    try { o = JSON.parse(b64d(m[1])); } catch (e) { return { ok: false, why: '코드를 읽지 못했어요' }; }
    let n = 0;
    C.stores.forEach((s) => {
      if (!(s.key in o)) return;
      const mine = readStore(s.key);
      const next = s.merge ? s.merge(mine || {}, o[s.key]) : Object.assign({}, mine || {}, o[s.key]);
      try { localStorage.setItem(s.key, JSON.stringify(next)); n++; } catch (e) { /* 저장 막힘 */ }
    });
    if (!n) return { ok: false, why: '이 게임 기록이 아니에요' };
    imported = true;
    if (C.onImport) try { C.onImport(); } catch (e) { console.warn(e); }
    return { ok: true };
  }
  // 바깥 브라우저로 보낼 주소 — 기록이 있으면 ?ia_rec= 에 담음 (주소의 #은 안드로이드 intent 에서 못 씀)
  function carryUrl() {
    const u = new URL(location.href);
    u.searchParams.delete('ia_rec');
    const code = C.stores.length ? exportCode() : '';
    if (code) u.searchParams.set('ia_rec', code);
    return u.href;
  }
  function takeCarried() {
    if (!Q.has('ia_rec')) return;
    const r = importCode(Q.get('ia_rec'));
    const u = new URL(location.href);
    u.searchParams.delete('ia_rec');
    try { history.replaceState(history.state, '', u.href); } catch (e) { /* 무시 */ }
    if (r.ok) setTimeout(() => say('기록을 가져왔어요 ✓'), 400);
  }

  // ── 무엇을 보여 줄지 ─────────────────────────────────────
  // offer(): 배너 · 토스트 · 결과 한 줄을 띄울지. 데스크톱은 진짜 설치 버튼이 있을 때만
  function offer() { return !installed && E.kind !== 'app' && (E.kind !== 'desktop' || !!deferred); }
  function label() {
    if (deferred) return '설치';
    if (E.kind === 'android-inapp') return E.app === 'line' ? '브라우저로 열기' : '크롬에서 열기';
    if (E.kind === 'ios-inapp' && E.app === 'line') return 'Safari로 열기';
    return '설치 방법';
  }
  function dismissed(k) { const t = LS.get(k); return t && Date.now() - t < C.hideDays * 864e5; }

  // 버튼 하나가 하는 일 — 환경마다
  async function act() {
    if (deferred) {
      const p = deferred; deferred = null;
      closeSheet();
      try { p.prompt(); const c = await p.userChoice; if (c && c.outcome === 'accepted') { installed = true; } } catch (e) { guide(); }
      refresh();
      return;
    }
    if (E.app === 'line') {
      // 라인은 openExternalBrowser=1 이 붙은 주소를 기본 브라우저로 엶 (LINE 문서의 방법)
      const u = new URL(carryUrl()); u.searchParams.set('openExternalBrowser', '1');
      location.href = u.href;
      setTimeout(() => { if (!document.hidden) guide(); }, 1500);
      return;
    }
    if (E.kind === 'android-inapp') {
      openChrome();
      return;
    }
    guide();
  }
  function intentUrl() {
    const u = new URL(carryUrl());
    return 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(u.href) + ';end';
  }
  function openChrome() {
    location.href = intentUrl();
    // 넘어가지 못하고 그대로 남아 있으면 손으로 하는 길을 보여 줌
    setTimeout(() => { if (!document.hidden) guide(true); }, 1500);
  }

  // ── 그림 안내 조각 ──────────────────────────────────────
  // ⋯ · ⋮ 는 도트 글꼴(갈무리)에 없어 「–」 로 보임 → 그림으로
  const SVG = {
    dots: '<svg class="ia-ico ia-dots" viewBox="0 0 24 24" aria-label="⋯"><circle cx="5" cy="12" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="19" cy="12" r="2.4"/></svg>',
    kebab: '<svg class="ia-ico ia-dots" viewBox="0 0 24 24" aria-label="⋮"><circle cx="12" cy="5" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="19" r="2.4"/></svg>',
    share: '<svg class="ia-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    add: '<svg class="ia-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    compass: '<svg class="ia-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#e3f2ff" stroke="#2f7ad8" stroke-width="2"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" fill="#e8566b"/></svg>',
    chrome: '<svg class="ia-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#e8566b"/><path d="M12 12 3.8 16.7A9.5 9.5 0 0 0 12 21.5z" fill="#ffd34d"/><path d="M12 12h9.4a9.5 9.5 0 0 1-9.4 9.5z" fill="#7ccf6a"/><circle cx="12" cy="12" r="4" fill="#5aa7ee" stroke="#fff" stroke-width="1.6"/></svg>',
  };
  const step = (n, pic, cap) => '<li class="ia-step"><div class="ia-shot">' + pic + '</div><p><b>' + n + '</b> ' + cap + '</p></li>';
  const page = '<div class="ia-page"><i></i><i></i><i style="width:60%"></i></div>';
  const topBar = (left, right) => '<div class="ia-bar">' + left + '<span class="ia-url">' + esc(location.host || '주소') + '</span>' + right + '</div>';
  const menu = (rows) => '<div class="ia-menu">' + rows.map((r) => '<i' + (r[1] ? ' class="ia-hl"' : '') + '>' + r[0] + '</i>').join('') + '</div>';
  const iconPrev = () => '<div class="ia-home">' + (C.icon ? '<img src="' + esc(C.icon) + '" alt="">' : '') + '<small>' + esc(C.short || C.name) + '</small></div>';

  function iosShareSteps() {
    const other = E.browser !== 'safari';
    return '<ol class="ia-steps">' +
      step(1, other ? topBar('<span>‹</span>', '<span class="ia-hl">' + SVG.share + '</span>') + page
        : page + '<div class="ia-bar"><span>‹</span><span>›</span><span class="ia-hl">' + SVG.share + '</span><span>' + SVG.dots + '</span></div>',
      other ? '주소창 옆 <b>공유</b> ' + SVG.share : '<b>공유</b> ' + SVG.share + '<br><small>없으면 ' + SVG.dots + ' 먼저</small>') +
      step(2, menu([['링크 복사'], [SVG.add + ' 홈 화면에 추가', 1]]), '「<b>홈 화면에 추가</b>」<br><small>목록을 내려 찾기</small>') +
      step(3, '<div class="ia-bar"><span>취소</span><span class="ia-hl">추가</span></div>' + iconPrev(), '「<b>추가</b>」 하면 끝<br><small>웹 앱으로 열기는 켠 채로</small>') +
      '</ol>';
  }
  function androidMenuSteps(inapp) {
    const which = inapp ? APPNAME[E.app] || '앱' : '';
    return '<ol class="ia-steps">' +
      step(1, topBar('<span>✕</span>', '<span class="ia-hl">' + SVG.kebab + '</span>') + page, '오른쪽 위 ' + SVG.kebab + (inapp ? '<br><small>또는 ' + SVG.dots + '</small>' : '')) +
      (inapp
        ? step(2, menu([['링크 복사'], ['다른 브라우저로 열기', 1]]), '「<b>다른 브라우저로 열기</b>」<br><small>또는 「Chrome으로 열기」</small>') +
          step(3, '<div class="ia-big">' + SVG.chrome + '</div>', 'Chrome에서<br>「<b>설치</b>」')
        : step(2, menu([['새 탭'], [SVG.add + ' 앱 설치', 1]]), '「<b>앱 설치</b>」 또는<br>「<b>홈 화면에 추가</b>」') +
          step(3, '<div class="ia-bar"><span></span><b>앱 설치</b><span class="ia-hl">설치</span></div>' + iconPrev(), '「<b>설치</b>」 하면 끝')) +
      '</ol>' + (which ? '' : E.browser === 'samsung' ? '<p class="ia-sub">삼성 인터넷: 아래 <b>≡</b> → 「현재 페이지 추가」 → 「홈 화면」</p>' : '');
  }
  function iosInappSteps() {
    const lbl = { instagram: '외부 브라우저에서 열기', facebook: '외부 브라우저에서 열기', kakao: '다른 브라우저로 열기', naver: '다른 브라우저로 열기', line: 'Safari로 열기' }[E.app] || 'Safari로 열기';
    const where = E.app === 'instagram' || E.app === 'facebook' ? '오른쪽 위 ' + SVG.dots : SVG.dots + ' 메뉴<br><small>위 또는 아래</small>';
    return '<ol class="ia-steps">' +
      step(1, topBar('<span>✕</span>', '<span class="ia-hl">' + SVG.dots + '</span>') + page, where) +
      step(2, menu([['링크 복사'], [lbl, 1]]), '「<b>' + lbl + '</b>」') +
      step(3, '<div class="ia-big">' + SVG.compass + '</div>', 'Safari에서<br>「<b>설치</b>」') +
      '</ol>';
  }

  // ── 안내 창 ─────────────────────────────────────────────
  let ovEl = null;
  function sheet(html, onBuild) {
    if (!ovEl) {
      ovEl = document.createElement('div');
      ovEl.className = 'ia-ov';
      ovEl.addEventListener('click', (e) => { if (e.target === ovEl) closeSheet(); });
      document.body.appendChild(ovEl);
    }
    ovEl.innerHTML = '<div class="ia-panel ' + esc(C.cls.sheet) + '" role="dialog" aria-modal="true">' + html + '</div>';
    ovEl.hidden = false;
    if (onBuild) onBuild(ovEl);
    const f = ovEl.querySelector('[data-ia-focus]') || ovEl.querySelector('button');
    if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function closeSheet() { if (ovEl) ovEl.hidden = true; }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && ovEl && !ovEl.hidden) { e.stopPropagation(); closeSheet(); } }, true);

  function hasRecords() { return C.stores.length > 0 && !!exportCode(); }
  function guide(chromeFailed) {
    const B = C.cls.btn, B2 = C.cls.btn2;
    const why = '<p class="ia-lead">홈 화면 아이콘으로 바로 · 주소창 없이 <b>전체 화면</b> · 다시 열 때 <b>더 빠르게</b> (인터넷 없어도 열려요)</p>';
    let body = '', acts = '';
    const rec = hasRecords();
    const nm = APPNAME[E.app] || '앱';
    if (E.kind === 'app' || installed) {
      body = '<p class="ia-lead">이미 앱으로 쓰고 있어요 ✓</p>';
    } else if (deferred) {
      body = '<p class="ia-sub">아래 「설치」 를 누르면 브라우저가 설치 창을 띄워요.</p>';
      acts = '<button class="' + esc(B) + '" data-ia="go" data-ia-focus>📲 설치</button>';
    } else if (E.kind === 'ios-inapp') {
      body = '<p class="ia-sub"><b>' + nm + '</b> 안에서는 설치가 안 돼요 — <b>Safari로 옮겨서</b> 설치해요.</p>' + iosInappSteps() +
        '<p class="ia-sub">메뉴가 안 보이면 「주소 복사」 → Safari 주소창에 붙여 넣기</p>';
      acts = '<button class="' + esc(B) + '" data-ia="copy" data-ia-focus>🔗 주소 복사</button>';
    } else if (E.kind === 'android-inapp') {
      body = '<p class="ia-sub"><b>' + nm + '</b> 안에서는 설치가 안 돼요 — <b>Chrome으로 옮겨서</b> 설치해요.</p>' +
        (chromeFailed ? '<p class="ia-warn">Chrome으로 바로 넘어가지 못했어요 — 아래처럼 손으로 옮겨 주세요</p>' : '') +
        androidMenuSteps(true);
      acts = '<button class="' + esc(B) + '" data-ia="chrome" data-ia-focus>' + SVG.chrome + ' 크롬에서 열기</button><button class="' + esc(B2) + '" data-ia="copy">🔗 주소 복사</button>';
    } else if (E.kind === 'ios') {
      body = iosShareSteps() + (E.browser !== 'safari' ? '<p class="ia-sub">공유에 「홈 화면에 추가」 가 없으면 <b>Safari</b>에서 열어 주세요</p>' : '');
    } else if (E.kind === 'android') {
      body = androidMenuSteps(false);
    } else {
      body = '<ul class="ia-list"><li><b>Chrome · Edge</b>: 주소창 오른쪽 <b>설치 아이콘</b>(⊕ 또는 모니터 모양) → 「설치」</li>' +
        '<li><b>Safari (Mac)</b>: 메뉴 「파일」 → 「<b>Dock에 추가</b>」</li><li><b>Firefox</b> 는 앱 설치를 지원하지 않아요 — Chrome · Edge로 열어 주세요</li></ul>';
    }
    // 저장 공간이 따로라는 것 — 솔직하게 한 줄
    let note = '';
    if (E.kind.endsWith('-inapp')) note = '여기서 쌓은 기록은 저절로 옮겨지지 않아요.' + (rec ? ' 옮겨 갈 때 주소에 기록을 담아 보내요 — 안 넘어가면 설정 → 「기록 옮기기」.' : '');
    else if (E.kind === 'ios' && rec) note = '홈 화면 앱은 Safari와 기록을 따로 써요 — 설정 → 「기록 옮기기」 코드로 가져가요.';
    if (E.kind.endsWith('-inapp') && rec) {
      // ⋯ → 「외부 브라우저에서 열기」 는 지금 주소를 그대로 넘기므로 주소에 기록을 미리 담아 둠
      try { history.replaceState(history.state, '', carryUrl()); } catch (e) { /* 무시 */ }
    }
    sheet('<h2 class="ia-h">📲 앱으로 설치하기</h2>' + (E.kind === 'app' ? '' : why) + body +
      (note ? '<p class="ia-note">⚠ ' + note + '</p>' : '') +
      '<div class="ia-acts">' + acts + (C.stores.length ? '<button class="' + esc(B2) + '" data-ia="transfer">기록 옮기기</button>' : '') +
      '<button class="' + esc(B2) + '" data-ia="close">닫기</button></div>');
  }

  function transfer() {
    const B = C.cls.btn, B2 = C.cls.btn2;
    const code = exportCode();
    sheet('<h2 class="ia-h">기록 옮기기</h2>' +
      '<p class="ia-sub">인스타 · 카톡 안 브라우저, Safari · Chrome, 홈 화면 앱은 저장 공간이 따로예요. 여기서 <b>코드를 복사</b> → 옮길 곳의 설정 → 「기록 옮기기」 에 <b>붙여 넣기</b>. 기록은 합쳐져요(더 좋은 쪽이 남음).</p>' +
      '<label class="ia-lbl">내 기록 코드</label>' +
      (code ? '<textarea class="ia-code" id="iaMine" readonly rows="2">' + esc(code) + '</textarea>' : '<p class="ia-sub">아직 옮길 기록이 없어요</p>') +
      '<div class="ia-acts">' + (code ? '<button class="' + esc(B) + '" data-ia="copycode">코드 복사</button>' : '') + '</div>' +
      '<label class="ia-lbl" for="iaIn">받은 코드 붙여 넣기</label><textarea class="ia-code" id="iaIn" rows="2" placeholder="IA1.…" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>' +
      '<p class="ia-msg" id="iaMsg" role="status"></p>' +
      '<div class="ia-acts"><button class="' + esc(B) + '" data-ia="import">가져오기</button><button class="' + esc(B2) + '" data-ia="close">닫기</button></div>');
  }

  // ── 시작 화면 배너 · 멈춤/설정 버튼 · 결과 한 줄 · 게임 중 토스트 ──
  function bannerHtml() {
    if (imported) return '<div class="ia-banner ia-ok" data-ia-banner>✓ 다른 브라우저의 기록을 가져왔어요</div>';
    const show = offer() && !dismissed('x');
    // 데스크톱은 설치 프롬프트가 늦게 올 수 있어 자리만 숨겨 둠 (refresh 가 엶)
    return '<div class="ia-banner" data-ia-banner' + (show ? '' : ' hidden') + '><span class="ia-bt">📲 앱으로 설치하면 <b>전체 화면 · 더 빠르게</b></span>' +
      '<button class="' + esc(C.cls.btn) + ' ia-small" data-ia="go"><span data-ia-label>' + label() + '</span></button>' +
      '<button class="ia-x" data-ia="x" aria-label="안내 닫기">✕</button></div>';
  }
  function buttonHtml(cls) {
    if (E.kind === 'app' || installed) return '';
    return '<button class="' + esc(cls || C.cls.btn2) + '" data-ia="go" data-ia-btn>📲 앱으로 설치</button>';
  }
  function lineHtml() {
    if (!offer()) return '';
    return '<p class="ia-line">📲 다음 판은 앱으로 — 전체 화면 · 더 빠르게 <button class="ia-link" data-ia="go"><span data-ia-label>' + label() + '</span> ›</button></p>';
  }
  let nudgeEl = null;
  function nudge(tries) {
    tries = tries || 0;
    if (!offer() || dismissed('nudge') || dismissed('x')) return false;
    if (C.canNudge && !C.canNudge()) { if (tries < 15) setTimeout(() => nudge(tries + 1), 2000); return false; }
    LS.set('nudge', Date.now());
    const host = (C.toastIn && document.querySelector(C.toastIn)) || document.body;
    if (!nudgeEl) {
      nudgeEl = document.createElement('button');
      nudgeEl.className = 'ia-toast';
      nudgeEl.dataset.ia = 'nudge';
    }
    nudgeEl.classList.toggle('ia-fixed', host === document.body);
    nudgeEl.innerHTML = '📲 앱으로 하면 전체 화면 · <b><span data-ia-label>' + label() + '</span> ›</b>';
    host.appendChild(nudgeEl);
    void nudgeEl.offsetWidth;
    nudgeEl.classList.add('on');
    clearTimeout(nudge.t);
    nudge.t = setTimeout(hideNudge, 6000);
    return true;
  }
  function hideNudge() { if (nudgeEl) nudgeEl.classList.remove('on'); }

  function refresh() {
    document.querySelectorAll('[data-ia-label]').forEach((el) => { el.textContent = label(); });
    document.querySelectorAll('[data-ia-banner]:not(.ia-ok)').forEach((el) => { el.hidden = !(offer() && !dismissed('x')); });
    if (E.kind === 'app' || installed) document.querySelectorAll('[data-ia-btn]').forEach((el) => el.remove());
    if (!offer()) { hideNudge(); document.querySelectorAll('.ia-line').forEach((el) => { el.hidden = true; }); }
  }

  // 버튼은 위임으로 — 각 게임이 innerHTML 로 그린 화면 어디에 있어도 동작
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-ia]');
    if (!b) return;
    const k = b.dataset.ia;
    if (k === 'go') act();
    else if (k === 'nudge') { hideNudge(); if (C.onOpen) try { C.onOpen(); } catch (er) { console.warn(er); } act(); }
    else if (k === 'x') { LS.set('x', Date.now()); const bn = b.closest('[data-ia-banner]'); if (bn) bn.hidden = true; }
    else if (k === 'close') closeSheet();
    else if (k === 'chrome') openChrome();
    else if (k === 'transfer') transfer();
    else if (k === 'copy') {
      const url = carryUrl();
      if (await copy(url)) say('주소를 복사했어요 — Safari · Chrome 주소창에 붙여 넣어요');
      else sheet('<h2 class="ia-h">주소 복사</h2><p class="ia-sub">아래 주소를 길게 눌러 복사해 주세요</p><textarea class="ia-code" readonly rows="3">' + esc(url) + '</textarea><div class="ia-acts"><button class="' + esc(C.cls.btn2) + '" data-ia="close">닫기</button></div>');
    } else if (k === 'copycode') {
      const t = document.getElementById('iaMine');
      if (!t) return;
      if (await copy(t.value)) say('코드를 복사했어요');
      else { t.focus(); t.select(); say('코드를 길게 눌러 복사해 주세요'); }
    } else if (k === 'import') {
      const r = importCode(document.getElementById('iaIn').value);
      const m = document.getElementById('iaMsg');
      m.className = 'ia-msg ' + (r.ok ? 'ia-good' : 'ia-bad');
      m.textContent = r.ok ? '가져왔어요 ✓ 기록이 합쳐졌어요' : r.why;
    }
  });

  // ── 서비스워커 ───────────────────────────────────────────
  // https · localhost 에서만 (file:// · http 에선 브라우저가 막음). ?nosw 면 등록 안 하고 있던 것도 지움(확인 · 문제 찾기용)
  let swReg = null;
  function registerSW() {
    if (!C.sw || !('serviceWorker' in navigator) || !window.isSecureContext) return;
    if (Q.has('nosw')) { navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {}); return; }
    navigator.serviceWorker.register(C.sw, { scope: './' }).then((r) => { swReg = r; }).catch((e) => console.warn('서비스워커 등록 실패 — 오프라인 열기만 안 됨', e));
  }
  // 그림을 다 받은 뒤 부름: 지금까지 받은 파일 목록을 SW 에 넘겨 캐시에 담게 → 다음엔 인터넷 없이도 열림
  function warm() {
    if (!C.sw || !('serviceWorker' in navigator) || !window.isSecureContext || Q.has('nosw')) return Promise.resolve(0);
    const urls = (performance.getEntriesByType ? performance.getEntriesByType('resource') : []).map((x) => x.name);
    urls.push(location.href.split('#')[0]);
    return navigator.serviceWorker.ready.then((reg) => new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => res((ev.data && ev.data.added) || 0);
      (reg.active || navigator.serviceWorker.controller).postMessage({ type: 'warm', urls }, [ch.port2]);
      setTimeout(() => res(-1), 30000);
    })).catch(() => 0);
  }

  function init(cfg) {
    Object.assign(C, cfg || {});
    C.cls = Object.assign({ sheet: 'ia-sheet', btn: 'ia-btn', btn2: 'ia-btn ia-btn2' }, (cfg && cfg.cls) || {});
    takeCarried();
    registerSW();
    return api;
  }

  const api = {
    init, configure: (cfg) => Object.assign(C, cfg || {}),
    env: () => Object.assign({}, E, { canPrompt: !!deferred, installed }),
    offer, label, act, guide, transfer, nudge, bannerHtml, buttonHtml, lineHtml, warm, refresh,
    exportCode, importCode, carryUrl, intentUrl,
    get imported() { return imported; },
  };
  window.InApp = api;
})();
