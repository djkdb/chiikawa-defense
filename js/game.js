/* 화면 — 판 그리기 · 연출 · 입력 · 윗줄/판넬 · 덮개 화면.
   규칙은 core.js 가 정하고, 여기서는 g.ev 에 쌓인 사건을 꺼내 연출만 합니다.
   판은 「도트 좌표」(한 칸 = 32 도트)로 그리고 캔버스 변환으로 기기 픽셀에 맞춥니다. */
(function () {
  const CD = window.CD, T = window.CD_TABLE, Core = window.CD_CORE;
  const Q = new URLSearchParams(location.search);
  const A = CD.art.build(T);
  const S = CD.sfx;
  const MON = CD.mon, TIL = CD.tiles;
  // UI 키트 아이콘 (assets/ui/ · tools/ui_install.py)
  const CLOVER = '<img class="ic" src="assets/ui/icon_clover.png" alt="클로버">', LOCK = '<img class="ic" src="assets/ui/icon_lock.png" alt="잠김"> ';
  let floorHi = null, topHi = null;   // 타일 시트로 구운 바닥 · 위 여백 띠 (없으면 art.js 의 예전 바닥)
  const TILE = A.TILE, COLS = T.board.cols, ROWS = T.board.rows;
  // PAD: 판 위쪽 여백(도트). 윗길을 도는 보스(걷기 56 · 기술 쓸 때 ~68 도트)·괴물 머리가 캔버스 밖으로 잘리지 않게
  const PAD = 30;
  const BW = COLS * TILE, BH = ROWS * TILE + PAD;
  const $ = (id) => document.getElementById(id);
  const cvs = $('board'), ctx = cvs.getContext('2d');
  const STORE = 'ck-defense-v1';
  const GR = T.grades;
  const CH = {};
  T.chars.forEach((c) => (CH[c.id] = c));

  let g = null;
  let phase = 'title';          // title | play | pause | pick | end
  let diffSel = 1, nextSeed = 0; // 시작 화면에서 고른 난이도 · 그 판 씨앗(변수 칩을 미리 보여 주려고 먼저 정함)
  const TR = T.traits, BOSS = {};
  T.bosses.forEach((b) => (BOSS[b.key] = b));
  let sel = -1, drag = null, hover = -1;
  let s = 1, dpr = 1;           // 도트 → 기기 픽셀 배율
  let speeds = T.speeds.slice();
  const qSpeed = +Q.get('speed');
  if (qSpeed > 0) speeds = [qSpeed].concat(speeds.filter((v) => v !== qSpeed));   // 확인용: ?speed=6
  let spd = 0;
  // 캐릭터 PNG 를 키우는 방식 — hybrid(정수배 nearest 로 키운 뒤 부드럽게 맞춤) · nearest · smooth. 확인용 ?px=
  const PX = ['nearest', 'smooth', 'hybrid'].includes(Q.get('px')) ? Q.get('px') : 'hybrid';
  // 칸 한 변 최대 CSS px — 시트 프레임(약 28px)이 칸(32 도트)에 1:1 로 들어가므로 64 면 ×2. 더 키우면 뭉개집니다
  // 칸 한 변 최대 CSS px — 태블릿 · 노트북에서 판이 작아 보이지 않게 크게 (시트 그림은 부드럽게 키워 그림)
  const TILE_MAX = 104;
  const view = { an: new Map(), fx: [], texts: [], shake: 0, t: 0, flyGhosts: [], cards: [], bigHit: new Map(), warn: null,
    stop: 0, flash: null, combo: { n: 0, at: -9, tx: null } };
  // ── 손맛 ── 타격 멈칫(규칙 시간을 잠깐 세움) · 화면 번쩍 · 피해 숫자 크기 차등 · 콤보
  function hitStop(sec) { view.stop = Math.max(view.stop, sec); }
  function flashScreen(col, a, life) { if (!calm()) view.flash = { col, a, t: 0, life: life || 0.18 }; }
  // ── 설정 (이 브라우저에만): 효과음 · 음악 · 진동 · 움직임 줄이기 · 기본 빠르기 ──
  const SET0 = { sfx: true, music: true, vib: true, calm: false, spd: 0 };
  function settings() { return Object.assign({}, SET0, rec().set || {}); }
  function calm() { return settings().calm || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  // 진동: 합성 · 보스 등장 · 신화 같은 중요한 순간만 (iOS Safari 는 지원 안 함 → 소리 · 흔들림으로 대신)
  function vib(p) { try { if (settings().vib && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 막힌 브라우저 */ } }
  function applySettings() {
    const st = settings();
    S.on = st.sfx;
    if (S.music) S.music(st.music);
    document.body.classList.toggle('calm', !!calm());
  }
  // 피해가 클수록 숫자를 크게 (10 ≈ 기본, 1만 ≈ 1.5배) — 큰 한 방이 눈에 띄게
  const dmgSize = (d, base) => Math.min(base * 1.7, base * (0.78 + Math.log10(Math.max(1, d)) * 0.18));

  // ── 기록 (이 브라우저에만) ─────────────────────────────────
  function rec() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function saveRec(r) { try { localStorage.setItem(STORE, JSON.stringify(r)); } catch (e) { /* 사생활 보호 모드 등 — 기록만 못 남김 */ } }
  // 난이도별 기록 { plays, best, clears, bestTime, endless } · 신화 레시피 발견 목록 found[]
  function drec(r, i) { r.d = r.d || {}; return (r.d[T.diffs[i].key] = r.d[T.diffs[i].key] || {}); }
  // 쉬움·보통은 처음부터, 그 위는 바로 아래 난이도를 한 번이라도 깨면
  function unlocked(r, i) { return i <= 1 || !!(r.d && r.d[T.diffs[i - 1].key] && r.d[T.diffs[i - 1].key].clears); }
  function found(r) { return Array.isArray(r.found) ? r.found : []; }

  // ── 크기 맞추기 ───────────────────────────────────────────
  // 기기 배치 — UA 대신 화면 너비 · 방향으로: phone(<600) · tab(600~839, 또는 세로로 긴 1100 미만) · wide(가로 태블릿 · 노트북)
  function layoutOf(w, h) { return w < 600 ? 'phone' : w < 840 || (h > w * 1.15 && w < 1100) ? 'tab' : 'wide'; }
  function fit() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const L = layoutOf(innerWidth, innerHeight);
    if (document.body.dataset.lay !== L) document.body.dataset.lay = L;
    const app = $('app'), cs = getComputedStyle(app);
    const padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom), padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.rowGap) || 6;
    const hud = document.querySelector('.hud').offsetHeight;
    const foot = document.querySelector('.fan').offsetHeight;
    const frame = 8 + 6;   // 판 테두리 둘 + 그림자
    const stageH = innerHeight - padT - padB - hud - foot - gap * 2;
    let wAvail, hAvail;
    if (L === 'wide') {
      const panel = document.querySelector('.panel').offsetWidth || 340;
      wAvail = innerWidth - padL - padR - panel - 14 - frame;
      hAvail = stageH - frame;
    } else {
      const panel = document.querySelector('.panel').offsetHeight;
      wAvail = Math.min(innerWidth - padL - padR, L === 'tab' ? 760 : 9999) - frame;
      hAvail = stageH - panel - 6 - frame;
    }
    const tile = Math.min(TILE_MAX, Math.max(28, Math.floor(Math.min(wAvail / COLS, hAvail / (BH / TILE)))));
    cvs.style.width = tile * COLS + 'px';
    cvs.style.height = (tile * BH) / TILE + 'px';
    cvs.width = Math.round(tile * COLS * dpr);
    cvs.height = Math.round(((tile * BH) / TILE) * dpr);
    s = cvs.width / BW;
    // 넓은 배치: 윗줄을 판 + 옆 판넬 폭에 맞춤 (화면 끝까지 늘어나 보이지 않게)
    const hudEl = document.querySelector('.hud');
    hudEl.style.maxWidth = L === 'wide' ? tile * COLS + frame + 14 + (document.querySelector('.panel').offsetWidth || 340) + 'px' : '';
  }

  // ── 초상 (판넬 · 도감 · 시작 화면) — 시트의 portrait.png 를 정사각 캔버스 가운데에 ─────
  // emo(joy·cry …)를 주면 그 감정 프레임(도트)을 대신 담음(없으면 초상) — 결과 화면
  function portrait(id, cssPx, hop, emo) {
    const C = A.char[id], E = emo && C.emo && C.emo[emo], P = E || C.portrait;
    const c = document.createElement('canvas');
    // 고해상도 초상(치이카와)은 그림 해상도 그대로 담아 CSS 가 줄이게 — R = 그림 px / 도트
    const R = Math.max(1, Math.min(4, 1 / (P.k || 1)));
    const n = Math.max(P.w, P.h) + 4;
    c.width = Math.round(n * R); c.height = Math.round(n * R);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.scale(R, R);
    x.drawImage(P.img, (n - P.w) / 2, (n - P.h) / 2, P.w, P.h);
    if (!C.real) { x.font = '20px Galmuri11, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = A.INK; x.fillText(C.label, n / 2, n / 2 + 2); }
    c.style.imageRendering = E ? 'pixelated' : 'auto';   // 초상은 줄여서 보이므로 부드럽게 · 감정 도트는 키워서 보이므로 또렷하게
    if (cssPx) { c.style.width = cssPx + 'px'; c.style.height = cssPx + 'px'; }
    if (hop) c.style.animationDelay = (-Math.random()).toFixed(2) + 's';
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', CH[id].name);
    return c;
  }

  // ── 연출 재료 ─────────────────────────────────────────────
  function an(u) {
    let a = view.an.get(u.id);
    if (!a) { a = { pop: 0, atk: 0, flash: 0, delay: 0, aim: 1, seed: (u.id * 0.618) % 1, mode: 'idle', mt: 0, md: 0, buff: 0 }; view.an.set(u.id, a); }
    return a;
  }
  const slotXY = (i) => ({ x: g.slots[i].x * TILE, y: g.slots[i].y * TILE });
  function text(x, y, str, col, size, o) {
    if (view.texts.length > 46) { if (!(o && (o.coin || o.pop))) return; view.texts.shift(); }
    const tx = Object.assign({ x, y, str, col, size, t: 0, life: 0.8, vy: -16 }, o || {});
    view.texts.push(tx);
    return tx;
  }
  function parts(x, y, cols, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (sp || 30) * (0.5 + Math.random());
      view.fx.push({ type: 'part', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, col: cols[i % cols.length], t: 0, life: 0.45 + Math.random() * 0.25, sz: Math.random() < 0.3 ? 2 : 1 });
    }
  }
  function sparks(x, y, key, n, r) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      view.fx.push({ type: 'spark', key, x: x + Math.cos(a) * (r || 10) * Math.random(), y: y + Math.sin(a) * (r || 10) * Math.random(), vx: Math.cos(a) * 18, vy: Math.sin(a) * 18 - 10, t: -Math.random() * 0.15, life: 0.6 });
    }
  }
  const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.max(1, Math.round(n))));
  const HIT_SND = { chiikawa: 'hit', usagi: 'hit', rakko: 'thud', momonga: 'zap', pungdengi: 'psn', kurimanju: 'hit' };
  const SKILL_SND = { chiikawa: 'skill', hachiware: 'water', usagi: 'crit', shisa: 'fire', momonga: 'gust', rakko: 'thud', pungdengi: 'psn', kurimanju: 'cheers' };
  // 스킬 효과에 시트 프레임이 없는 친구는 이 색 고리 + 반짝이로
  const SKILL_COL = { chiikawa: '#ffd0dc', usagi: '#ffe27a', rakko: '#fff3b0', kurimanju: '#ffd36a' };
  // 초상 연출(소환 · 합성)
  function card(slot, ch, g, big, delay) {
    const p = slotXY(slot);
    if (big) view.cards = view.cards.filter((c) => !c.big);
    view.cards.push({ ch, g, big, x: p.x, y: p.y, t: -(delay || 0), life: big ? 1.15 : 0.8 });
  }
  const MON_COLS = ['#9d8cc6', '#7a68a6', '#ffd0dc', '#fff3b0', '#cfe7ff'];
  const TRAIT_COL = { fast: '#ffe08a', armor: '#b9bdc6', regen: '#9be07a', split: '#ffb3c8', revive: '#cfefff' };
  const traitNames = (ks) => (ks && ks.length ? ks.map((k) => TR[k].name).join(' · ') : '특성 없음');
  // 신화 무지개 (방석 · 카드 테두리)
  const RAINBOW = ['#ff7aa8', '#ffb45a', '#ffe36a', '#8fe08a', '#7cc4ff', '#b48cff'];
  function rainbow(x, X, Y, w, h, r, t) {
    const gr = x.createLinearGradient(X, Y, X + w, Y + h);
    RAINBOW.forEach((c, i) => gr.addColorStop(((i / RAINBOW.length) + t * 0.25) % 1, c));
    return gr;
  }

  const txtAt = new Map();   // 괴물 id → 마지막으로 숫자를 띄운 때
  // ── 사건 → 연출 · 소리 ────────────────────────────────────
  const seen = {};   // 확인용: 지금까지 일어난 사건 수 (tools/play_check_v2.py 가 읽기만 함)
  function onEvents() {
    for (const e of g.ev) {
      const sk = e.type + (e.bt && e.type !== 'kill' ? ':' + e.bt : '') + (e.type === 'kill' && e.trait ? ':' + e.trait : '');
      seen[sk] = (seen[sk] || 0) + 1;
      switch (e.type) {
        case 'summon': {
          const u = g.slots[e.slot].u, a = an(u), p = slotXY(e.slot);
          a.pop = 1; a.flash = 0.8;
          card(e.slot, e.ch, e.g, e.g >= 1);
          view.fx.push({ type: 'pillar', x: p.x, y: p.y, col: GR[e.g].color, t: 0, life: 0.55 });
          sparks(p.x, p.y, GR[e.g].key, 6 + e.g * 4, 12);
          S.play('summon');
          if (e.g >= 1) { S.play(e.g >= 2 ? 'legend' : 'rare'); text(p.x, p.y - 18, (e.luck ? '행운 ' : '') + GR[e.g].name + '!', GR[e.g].color, 9, { life: 1.1, vy: -10 }); }
          break;
        }
        case 'myth': {
          const u = g.slots[e.slot].u, a = an(u), p = slotXY(e.slot);
          a.delay = 0.3; a.pop = 1; a.flash = 1;
          for (const f of e.from) { const q = slotXY(f); view.flyGhosts.push({ ch: T.recipes[e.r].need[e.from.indexOf(f) + 1], g: 3, x0: q.x, y0: q.y, x1: p.x, y1: p.y, t: 0, life: 0.3 }); }
          RAINBOW.forEach((c, i) => view.fx.push({ type: 'ring', x: p.x, y: p.y, col: c, r0: 3, r1: 26 + i * 6, t: -0.25 - i * 0.05, life: 0.6, w: 2 }));
          view.fx.push({ type: 'rays', x: p.x, y: p.y, col: '#ffe3f0', t: -0.2, life: 1.8 });
          setTimeout(() => sparks(p.x, p.y, 'myth', 24, 18), 250);
          card(e.slot, e.ch, 4, true, 0.25);
          view.shake = 0.45; hitStop(0.25); flashScreen('#ffffff', 0.7, 0.4); vib(50);
          banner('신화 ' + CH[e.ch].name + ' 탄생!', '「' + T.recipes[e.r].myth.name + '」', 'myth');
          S.play('myth');
          const r = rec(); r.found = found(r); if (!r.found.includes(e.r)) { r.found.push(e.r); saveRec(r); }
          break;
        }
        case 'mythskill': {
          const p = slotXY(e.slot), M = T.recipes[e.r].myth;
          text(p.x, p.y - 24, M.name, '#ffd0e6', 8, { life: 1.1, vy: -12, pop: 1 });
          if (e.kind === 'nova') { view.fx.push({ type: 'nova', x: BW / 2, y: (ROWS * TILE) / 2, t: 0, life: 0.6 }); view.shake = Math.max(view.shake, 0.2); hitStop(0.08); S.play('nova'); }
          else if (e.kind === 'stun') { view.fx.push({ type: 'ring', x: p.x, y: p.y, col: '#ffe27a', r0: 6, r1: M.r * TILE, t: 0, life: 0.5, w: 4, fill: 'rgba(255,230,120,.18)' }); S.play('stun'); }
          else S.play('skill');
          break;
        }
        case 'meteor': {
          const X = e.x * TILE, Y = e.y * TILE;
          view.fx.push({ type: 'meteor', x: X, y: Y, t: 0, life: 0.45 });
          setTimeout(() => { parts(X, Y - 6, ['#fff3b0', '#ffd36a', '#ffffff'], 16, 40); S.play('thud'); }, 200);
          break;
        }
        case 'swap': {
          const u = g.slots[e.slot].u, p = slotXY(e.slot);
          if (u) { an(u).pop = 1; an(u).flash = 1; }
          sparks(p.x, p.y, 'legend', 10, 12);
          text(p.x, p.y - 20, CH[e.was].name + ' → ' + CH[e.ch].name, '#fff3b0', 7, { life: 1.2, vy: -10 });
          S.play('luckwin');
          break;
        }
        case 'gamble': S.play(e.win ? 'luckwin' : 'lucklose'); break;
        case 'odds': toast('소환 확률 Lv' + e.lv + ' — ' + oddsText()); S.play('up'); break;
        case 'interest': lastInterest = e.coins; break;
        case 'pick': pickAt = view.t; break;   // 보스 쓰러지는 연출을 잠깐 보여 준 뒤 frame() 이 보상 화면을 엶
        case 'chose': {
          const c = e.card;
          if (c.gamble) { toast(e.win ? c.name + ' — 성공!' : c.name + ' — 아쉽게 꽝'); S.play(e.win ? 'luckwin' : 'lucklose'); }
          else { toast(c.name + ' — ' + c.desc); S.play('coin'); }
          break;
        }
        case 'revive': {
          const X = e.x * TILE, Y = e.y * TILE;
          text(X, Y - 26, '부활!', '#cfefff', 8, { life: 1, vy: -10, pop: 1 });
          view.fx.push({ type: 'ring', x: X, y: Y - 8, col: '#cfefff', r0: 2, r1: 16, t: 0.0, life: 0.5, w: 2 });
          S.play('revive');
          break;
        }
        case 'split': {
          const X = e.x * TILE, Y = e.y * TILE;
          text(X, Y - 22, '분열!', '#ffb3c8', 7, { life: 0.8, vy: -10 });
          S.play('split');
          break;
        }
        case 'bwarn': {
          const B = BOSS[e.bt];
          view.warn = { id: e.id, bt: e.bt, targets: e.targets, t: 0, life: B.warn };
          text(e.x * TILE, e.y * TILE - 50, B.skill + ' 준비!', '#ffd0e6', 9, { life: B.warn, vy: -2, pop: 1 });
          S.play('warn');
          break;
        }
        case 'bcast': {
          const B = BOSS[e.bt], X = e.x * TILE, Y = e.y * TILE;
          view.warn = null;
          if (e.bt === 'silence') {
            for (const i of e.targets) { const p = slotXY(i); view.fx.push({ type: 'ring', x: p.x, y: p.y, col: '#b48cff', r0: 20, r1: 3, t: 0, life: 0.4, w: 3 }); sparks(p.x, p.y, 'epic', 6, 10); }
            banner('침묵!', '친구 ' + e.targets.length + '명이 ' + B.t + '초 동안 봉인', 'boss');
            S.play('silence');
          } else if (e.bt === 'summon') {
            parts(X, Y - 10, ['#ffffff', '#cfe7ff', '#ffd0dc'], 20, 40); S.play('bsummon');
            text(X, Y - 54, '졸개 ' + B.n + '마리!', '#ffffff', 8, { life: 1 });
          } else if (e.bt === 'heal') {
            text(X, Y - 54, '+' + fmt(e.heal), '#9be07a', 10, { life: 1.1, pop: 1 });
            view.fx.push({ type: 'ring', x: X, y: Y - 20, col: '#b8f07a', r0: 8, r1: 40, t: 0, life: 0.6, w: 3, fill: 'rgba(190,240,120,.18)' });
            S.play('bheal');
          } else if (e.bt === 'shuffle') {
            for (const [from, to] of e.moves) {
              const u = g.slots[to].u, q = slotXY(from), p = slotXY(to);
              if (!u || from === to) continue;
              an(u).delay = 0.5;
              view.flyGhosts.push({ ch: u.ch, g: u.g, x0: q.x, y0: q.y, x1: p.x, y1: p.y, t: 0, life: 0.5 });
            }
            sel = -1; drag = null; hover = -1;
            view.shake = 0.3;
            banner('셔플!', '친구 자리가 섞였어요', 'boss');
            S.play('shuffle');
          }
          break;
        }
        case 'endless': banner('무한 모드!', '어디까지 버틸까요', 'myth'); S.play('wave'); break;
        case 'merge': {
          const u = g.slots[e.slot].u, a = an(u), p = slotXY(e.slot), q = slotXY(e.from);
          a.delay = 0.22; a.pop = 1; a.flash = 1;
          view.flyGhosts.push({ ch: e.was, g: e.g - 1, x0: q.x, y0: q.y, x1: p.x, y1: p.y, t: 0, life: 0.22 });
          view.fx.push({ type: 'ring', x: p.x, y: p.y, col: GR[e.g].color, r0: 4, r1: 30, t: -0.2, life: 0.45, w: 3 });
          view.fx.push({ type: 'ring', x: p.x, y: p.y, col: '#ffffff', r0: 2, r1: 20, t: -0.18, life: 0.3, w: 2 });
          setTimeout(() => sparks(p.x, p.y, GR[e.g].key, 8 + e.g * 5, 14), 200);
          card(e.slot, e.ch, e.g, true, 0.18);
          S.play('merge'); vib(e.g >= 3 ? 40 : 15);
          hitStop(e.g >= 3 ? 0.14 : 0.05);
          flashScreen(GR[e.g].glow, e.g >= 3 ? 0.55 : 0.28, e.g >= 3 ? 0.35 : 0.16);
          view.shake = Math.max(view.shake, 0.06 + e.g * 0.04);
          if (e.g >= 3) { S.play('legend'); view.shake = 0.35; view.fx.push({ type: 'rays', x: p.x, y: p.y, col: GR[3].color, t: -0.2, life: 1.4 }); banner('전설 ' + CH[e.ch].name + '!', '합성 성공', 'legend'); }
          else if (e.g >= 2) S.play('rare');
          break;
        }
        case 'move': { const u = g.slots[e.slot].u; if (u) an(u).pop = 0.5; if (e.swap && g.slots[e.from].u) an(g.slots[e.from].u).pop = 0.5; S.play('pick'); break; }
        case 'sell': {
          const p = slotXY(e.slot);
          parts(p.x, p.y, ['#ffffff', '#ffe08a', CH[e.ch].color], 10, 26);
          text(p.x, p.y - 8, '+' + e.coins, '#ffd54a', 9, { coin: true });
          S.play('sell');
          break;
        }
        case 'upgrade': {
          g.slots.forEach((sl, i) => { if (sl.u && sl.u.g === e.g) { an(sl.u).flash = 0.9; const p = slotXY(i); sparks(p.x, p.y, GR[e.g].key, 3, 8); } });
          toast(GR[e.g].name + ' 강화 ' + e.lv + '단계 — 공격력 +' + Math.round(T.upgrade.dmg * e.lv * 100) + '%');
          S.play('levelup');
          flashScreen(GR[e.g].color, 0.22, 0.2);
          bump($('up' + e.g));
          g.slots.forEach((sl, i) => { if (sl.u && T.upGroup[sl.u.g] === e.g) { const p = slotXY(i); text(p.x, p.y - 20, 'UP!', GR[sl.u.g].color, 7, { life: 0.7, vy: -22, pop: 1 }); } });
          break;
        }
        case 'fire': {
          const u = g.slots[e.slot].u;
          if (!u) break;
          const a = an(u), C = A.char[u.ch];
          a.aim = u.aim;
          // 공격 프레임은 다음 공격 전에 끝나도록(우사기처럼 빠른 친구는 짧게)
          if (e.skill) { a.mode = 'skill'; a.mt = 0; a.md = 0.62; a.atk = 1; const p = slotXY(e.slot); text(p.x, p.y - 22, CH[u.ch].skill.name, '#fff3b0', 8, { life: 1, vy: -12 }); S.play(SKILL_SND[u.ch] || 'skill'); }
          else if (a.mode !== 'skill') { a.mode = 'attack'; a.mt = 0; a.md = Math.min(0.4, 0.85 / (g.unitRate(u) * speeds[spd])); a.atk = 0.6; if (C.attack.length < 2) a.atk = 1; }
          break;
        }
        case 'buff': {
          for (const j of e.to) { const v = g.slots[j].u; if (v) { an(v).buff = 3; const p = slotXY(j); sparks(p.x, p.y - 8, 'legend', 4, 8); } }
          break;
        }
        case 'skillfx': {
          const X = e.x * TILE, Y = e.y * TILE, C = A.char[e.ch];
          const img = C.fx || (e.ch === 'rakko' || e.ch === 'usagi' ? C.shot : null);
          // 효과 그림이 큰 것(치이카와 하트 폭발, 약 65 도트)은 다른 친구 효과(약 30 도트) 크기로 맞춤
          const nk = img ? Math.min(1, 34 / Math.max(img.w, img.h)) : 1;
          if (img) view.fx.push({ type: 'sprite', img, x: X, y: Y - 6, t: 0, life: 0.55, k0: 0.5 * nk, k1: (e.ch === 'shisa' || e.ch === 'momonga' ? 1.25 : 1.05) * nk });
          else { view.fx.push({ type: 'ring', x: X, y: Y - 4, col: SKILL_COL[e.ch] || '#ffffff', r0: 3, r1: 16, t: 0, life: 0.35, w: 3 }); sparks(X, Y - 6, 'white', 7, 10); }
          if (e.ch === 'chiikawa') { view.shake = Math.max(view.shake, 0.12); }
          break;
        }
        case 'hit': {
          const X = e.x * TILE, Y = e.y * TILE - 12;
          // 평범한 숫자는 괴물 하나당 0.3초에 하나만 — 여럿이 한 마리를 때릴 때 숫자 기둥이 생기지 않게 (치명·스킬은 늘 보임)
          if (!e.crit && !e.skill) { const l = txtAt.get(e.id); if (l != null && view.t - l < 0.3) { if (e.kind !== 'dot' && e.kind !== 'psn' && e.kind !== 'splash' && e.kind !== 'burn' && e.kind !== 'poison') S.play(HIT_SND[e.ch] || 'hit'); break; } txtAt.set(e.id, view.t); }
          if (e.kind === 'dot') { if (Math.random() < 0.6) text(X + 4, Y, fmt(e.dmg), '#ff9a4a', 6, { life: 0.5 }); break; }
          // 맞은 자리에 그 친구 색의 별 터짐(공격 이펙트 줄) — 지속 피해(독·화상)는 빼고 숫자를 띄울 때만
          const HC = A.char[e.ch] && A.char[e.ch].hit;
          if (HC && e.kind !== 'psn' && e.kind !== 'burn' && e.kind !== 'poison') { const hk = 14 / Math.max(HC.w, HC.h) * (e.crit || e.skill ? 1.4 : 1); view.fx.push({ type: 'hitspr', img: HC, x: X, y: Y + 6, t: 0, life: 0.24, k0: 0.6 * hk, k1: hk }); }
          if (e.skill || e.crit) view.bigHit.set(e.id, 0.22);
          if (e.armor && Math.random() < 0.25) { text(X - 6, Y - 6, '막음', '#d6dae2', 6, { life: 0.5 }); S.play('tink'); }
          if ((e.crit || e.skill) && g.enemies.some((m) => m.id === e.id && m.kind === 'boss')) { hitStop(0.035); view.shake = Math.max(view.shake, 0.08); }
          if (e.crit) { text(X, Y - 3, '치명 ' + fmt(e.dmg), '#ff5a5a', dmgSize(e.dmg, 8), { life: 0.8, vy: -20, pop: 1 }); S.play('crit'); }
          else if (e.kind === 'psn') { if (Math.random() < 0.6) text(X - 4, Y, fmt(e.dmg), '#9be07a', 6, { life: 0.5 }); break; }
          else if (e.skill) text(X, Y - 3, fmt(e.dmg), '#fff3b0', dmgSize(e.dmg, 9), { life: 0.8, vy: -20, pop: 1 });
          else if (e.kind !== 'splash' && e.kind !== 'burn' && e.kind !== 'poison') { text(X + (Math.random() - 0.5) * 6, Y, fmt(e.dmg), '#ffffff', dmgSize(e.dmg, 7)); S.play(HIT_SND[e.ch] || 'hit'); }
          else text(X + (Math.random() - 0.5) * 8, Y, fmt(e.dmg), e.kind === 'burn' ? '#ffb27a' : e.kind === 'poison' ? '#9be07a' : '#cfe7ff', 6, { life: 0.6 });
          if (e.ch === 'rakko') view.fx.push({ type: 'ring', x: X, y: Y + 10, col: '#ffffff', r0: 2, r1: 9, t: 0, life: 0.2, w: 2 });
          break;
        }
        case 'splash': {
          const X = e.x * TILE, Y = e.y * TILE;
          const SP = { shisa: ['#ff8a3d', 'rgba(255,170,90,.25)', ['#ffd36a', '#ff8a3d', '#e2522b'], 'fire'], pungdengi: ['#7cc46a', 'rgba(150,220,120,.28)', ['#bfe8a4', '#7cc46a', '#4f8f45'], 'psn'], momonga: ['#bfe2ff', 'rgba(200,235,255,.3)', ['#ffffff', '#bfe2ff'], 'gust'] }[e.ch] || ['#8fc2f2', 'rgba(160,210,255,.28)', ['#ffffff', '#bfe2ff', '#8fc2f2'], 'splash'];
          view.fx.push({ type: 'ring', x: X, y: Y, col: SP[0], r0: 3, r1: e.r * TILE, t: 0, life: e.skill ? 0.45 : 0.3, w: 3, fill: SP[1] });
          parts(X, Y, SP[2], e.skill ? 14 : 6, 34);
          if (!e.skill) S.play(SP[3]);
          break;
        }
        case 'kill': {
          txtAt.delete(e.id);
          const X = e.x * TILE, Y = e.y * TILE;
          const nc = e.kind === 'boss' ? 12 : e.coins >= 5 ? 2 : 1;
          for (let k = 0; k < nc; k++) {
            const a2 = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 40;
            view.fx.push({ type: 'coin', x: X, y: Y - 8, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v, t: -k * 0.03, life: 0.95 + Math.random() * 0.2 });
          }
          // 콤보: 1.5초 안에 이어 잡으면 숫자가 오름 (보이기만 — 규칙엔 영향 없음)
          const C = view.combo;
          C.n = view.t - C.at < 1.5 ? C.n + 1 : 1; C.at = view.t;
          if (C.n >= 5) {
            if (C.tx) C.tx.life = 0;
            C.tx = text(BW / 2, 14, C.n + ' 콤보!', C.n >= 30 ? '#ff7aa8' : C.n >= 15 ? '#ffb45a' : '#ffe36a', Math.min(13, 8 + C.n * 0.12), { life: 1.2, vy: -4, pop: 1, coin: false, keep: 1 });
            if (C.n % 10 === 0) { S.play('combo'); view.shake = Math.max(view.shake, 0.12); }
          }
          parts(X, Y - 4, e.trait ? [TRAIT_COL[e.trait], '#ffffff', '#fff3b0'] : MON_COLS, e.kind === 'boss' ? 40 : 9, e.kind === 'boss' ? 60 : 30);
          view.bigHit.delete(e.id);
          // 특성 괴물: 시트의 쓰러짐 프레임(분열은 갈라짐)이 잠깐 남았다 사라짐
          if (e.trait && MON.ready) {
            const act = e.trait === 'split' ? (e.small ? 'small' : 'split') : 'down';
            view.fx.push({ type: 'corpse', grp: 'mon', name: e.trait, act, x: X, y: Y, flip: e.dir === 2 || e.dir === 3, t: 0, life: e.trait === 'split' && !e.small ? 0.5 : 0.55 });
          }
          view.fx.push({ type: 'poof', x: X, y: Y - 4, t: 0, life: 0.3, r: e.kind === 'boss' ? 26 : 10 });
          text(X, Y - 14, '+' + e.coins, '#ffd54a', e.kind === 'boss' ? 11 : 7, { coin: true, life: 0.9, vy: -14 });
          S.play('pop'); S.play('coin');
          if (e.kind === 'boss') { view.shake = 0.5; view.warn = null; hitStop(0.22); flashScreen('#ffffff', 0.6, 0.3); banner(BOSS[e.bt].name + ' 토벌!', '+' + e.coins + ' 동전 · 클로버 +' + T.luck.boss, 'boss'); }
          break;
        }
        case 'wave': {
          const it = lastInterest ? ' · 이자 +' + lastInterest : '';
          lastInterest = 0;
          const B = e.bt ? BOSS[e.bt] : null;
          if (e.last) banner('마지막 웨이브!', B.name + ' (' + B.skill + ') — ' + T.finalTime + '초 안에', 'boss');
          else if (e.boss) banner('보스 웨이브 ' + e.n, B.name + ' — 기술 「' + B.skill + '」', 'boss');
          else if (e.traits.length && e.traits.some((k) => TR[k].from === e.n)) cutin('새 괴물: ' + traitNames(e.traits.filter((k) => TR[k].from === e.n)), TR[e.traits.find((k) => TR[k].from === e.n)].desc, 'wave');
          else banner('웨이브 ' + e.n, (e.traits.length ? traitNames(e.traits) : '') + it);
          S.play('wave');
          break;
        }
        case 'boss': {
          S.play('boss'); S.play('siren'); view.shake = 0.35; vib([30, 40, 30]);
          const B = BOSS[e.bt], f = MON.ready ? MON.frame('boss', e.bt, 'front', 0) : null;
          cutin('경고! 보스 등장', B.name + ' — 「' + B.skill + '」 ' + B.desc, 'boss', f && f.img.src);
          break;
        }
        case 'end': setTimeout(() => endScreen(e), e.win ? 600 : 900); S.play(e.win ? 'win' : 'lose'); phase = 'end'; view.warn = null; break;
      }
    }
    g.ev.length = 0;
  }

  // ── 그리기 ────────────────────────────────────────────────
  // 한 프레임 그리기. cx = 몸 가운데, by = 발. o: sx·sy(늘임) · rot · alpha · flash(0..1) · glow(색) · flip · k(크기 배수)
  function drawFrame(x, f, cx, by, o) {
    o = o || {};
    const k0 = o.k || 1, w = f.w * k0, h = f.h * k0;
    const ox = -f.ax * k0, oy = -f.ay * k0;
    x.save();
    x.translate(cx, by);
    if (o.rot) x.rotate(o.rot);
    x.scale((o.sx || 1) * (o.flip ? -1 : 1), o.sy || 1);
    if (o.alpha != null) x.globalAlpha = o.alpha;
    const dev = s * k0 * (f.k || 1);   // 이 그림 1 픽셀이 기기 픽셀 몇 개인지 (치이카와 고해상도 도트는 k=0.5 라 다른 친구의 절반)
    let img = f.img;
    if (PX === 'nearest') x.imageSmoothingEnabled = false;
    else {
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      // 1배 근처(치이카와 도트를 칸 64px·DPR 1 에서)도 2배로 키운 판을 줄여 그림 — 숨쉬기 늘임(±2%)에서 줄이 겹치지 않게
      if (PX === 'hybrid' && dev > 0.95) img = A.big(f.img, Math.min(6, Math.ceil(dev * 1.01)));
    }
    if (o.glow) {
      const sil = A.silhouette(f.img, o.glow);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(sil, ox + dx, oy + dy, w, h);
    }
    x.drawImage(img, ox, oy, w, h);
    if (o.flash > 0) {
      x.globalAlpha = (o.alpha == null ? 1 : o.alpha) * Math.min(1, o.flash) * 0.85;
      x.drawImage(A.silhouette(f.img, '#ffffff'), ox, oy, w, h);
    }
    x.restore();
  }
  // 칸 위 친구의 지금 프레임: 평소 idle 순환 · 쏠 때 attack · 스킬 때 skill
  function frameOf(u, a, t) {
    const C = A.char[u.ch];
    if (a.mode !== 'idle' && a.md > 0) {
      const L = a.mode === 'skill' ? C.skill : C.attack;
      return L[Math.min(L.length - 1, Math.floor((a.mt / a.md) * L.length))];
    }
    const L = C.idle;
    return L[Math.floor(t * 5 + a.seed * 17) % L.length];
  }
  function drawChar(x, id, cx, by, o) { drawFrame(x, A.char[id].idle[0], cx, by, o); }
  function star(x, cx, cy, col) {
    // 5 도트 별: 짙은 갈색 외곽 + 등급 색
    x.fillStyle = A.INK;
    x.fillRect(cx - 1, cy - 3, 3, 7); x.fillRect(cx - 3, cy - 1, 7, 3); x.fillRect(cx - 2, cy + 2, 1, 2); x.fillRect(cx + 2, cy + 2, 1, 2);
    x.fillStyle = col;
    x.fillRect(cx, cy - 2, 1, 5); x.fillRect(cx - 2, cy, 5, 1); x.fillRect(cx - 1, cy - 1, 3, 3);
    x.fillStyle = '#ffffff'; x.fillRect(cx, cy - 1, 1, 1);
  }
  function gem(x, cx, cy, col) {
    x.fillStyle = A.INK; x.fillRect(cx - 2, cy - 1, 5, 3); x.fillRect(cx - 1, cy - 2, 3, 5);
    x.fillStyle = col; x.fillRect(cx - 1, cy - 1, 3, 3); x.fillStyle = '#ffffff'; x.fillRect(cx - 1, cy - 1, 1, 1);
  }
  function drawSlot(x, i, t) {
    const sl = g.slots[i], u = sl.u;
    const X = Math.floor(sl.x - 0.5) * TILE, Y = Math.floor(sl.y - 0.5) * TILE;
    const dragging = drag && drag.moved;
    // 끌고 있을 때: 놓을 수 있는 자리 표시
    if (dragging && i !== drag.from) {
      const mate = g.canMerge(drag.from, i);
      if (mate || i === hover) {
        x.save();
        x.fillStyle = mate ? 'rgba(130,230,120,' + (0.35 + 0.2 * Math.sin(t * 10)) + ')' : 'rgba(255,255,255,.55)';
        A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
        if (i === hover) { x.lineWidth = 2; x.strokeStyle = mate ? '#3d9b3d' : '#ffffff'; x.stroke(); }
        x.restore();
      }
    }
    // 타일 칸: 고른 친구 = 노랑 풀밭 칸 · 봉인된 친구 = 보라 칸 (시트의 칸 그림)
    const tk = u && u.silT > 0 ? 'seal' : sel === i && u ? 'sel' : null;
    const tim = TIL.ready && tk ? TIL.slotTile(tk) : null;
    if (tim) { const p2 = TILE * TIL.pad; x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(tim, X + (TILE - p2) / 2, Y + (TILE - p2) / 2, p2, p2); x.restore(); }
    // 보스 침묵 예고: 노리는 칸이 보라 칸으로 깜빡임
    if (view.warn && view.warn.targets && view.warn.targets.includes(i) && TIL.ready) {
      const p2 = TILE * TIL.pad;
      x.save(); x.globalAlpha = 0.5 + 0.4 * Math.sin(t * 14); x.imageSmoothingEnabled = true;
      x.drawImage(TIL.slotTile('seal'), X + (TILE - p2) / 2, Y + (TILE - p2) / 2, p2, p2); x.restore();
    } else if (view.warn && view.warn.targets && view.warn.targets.includes(i)) {
      x.save(); x.globalAlpha = 0.45 + 0.35 * Math.sin(t * 14);
      x.fillStyle = '#b48cff'; A.roundRect(x, X + 1, Y + 2, TILE - 2, TILE - 3, 8); x.fill(); x.restore();
    }
    if (!u) return;
    const a = an(u), gr = GR[u.g];
    if (u.g >= 4) { // 신화: 무지개 방석 + 테두리
      x.save();
      x.fillStyle = gr.glow; A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
      x.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3); x.fillStyle = rainbow(x, X, Y, TILE, TILE, 7, t); A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
      x.globalAlpha = 1; x.lineWidth = 2.5; x.strokeStyle = rainbow(x, X, Y, TILE, TILE, 7, t + 0.5); A.roundRect(x, X + 3, Y + 4, TILE - 6, TILE - 7, 6); x.stroke();
      x.restore();
    } else {
    // 등급 방석: 바탕 빛 + 테두리 색 (전설은 금빛 두 줄)
    x.save();
    x.fillStyle = gr.glow; A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
    if (u.g >= 2) { // 영웅 이상: 은은히 숨 쉬는 빛
      x.globalAlpha = 0.22 + 0.18 * Math.sin(t * 3 + a.seed * 6);
      x.fillStyle = gr.color; A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
      x.globalAlpha = 1;
    }
    x.lineWidth = u.g >= 3 ? 2.5 : 2; x.strokeStyle = gr.color; A.roundRect(x, X + 3, Y + 4, TILE - 6, TILE - 7, 6); x.stroke();
    if (u.g >= 3) { x.lineWidth = 1; x.strokeStyle = '#fff3b0'; A.roundRect(x, X + 5, Y + 6, TILE - 10, TILE - 11, 4); x.stroke(); }
    x.restore();
    }
    if (u.g >= 3) { // 전설 · 신화: 도는 빛줄기
      x.save(); x.translate(X + 16, Y + 16); x.rotate(t * 0.8);
      x.globalAlpha = 0.3; x.fillStyle = '#fff3b0';
      for (let k = 0; k < 6; k++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(-2.5, -16); x.lineTo(2.5, -16); x.closePath(); x.fill(); }
      x.restore();
    }
    const C = A.char[u.ch];
    if (dragging && drag.from === i) { drawFrame(x, C.idle[0], X + 16, Y + 30, { alpha: 0.3 }); stars(x, X, Y, u.g); return; }
    if (a.delay > 0) return;
    // 몸짓: 숨쉬기 + 쏠 때 움찔 + 나타날 때 통통
    const bob = Math.sin(t * 3.2 + a.seed * 6.28);
    const atk = a.atk;
    let sx = 1 + bob * 0.02 + atk * 0.05, sy = 1 - bob * 0.02 - atk * 0.06;
    if (a.pop > 0) { const p = 1 - a.pop; const e = p < 0.6 ? p / 0.6 * 1.15 : 1.15 - (p - 0.6) / 0.4 * 0.15; sx *= e; sy *= e; }
    const glow = sel === i ? '#ffffff' : null;
    drawFrame(x, frameOf(u, a, t), X + 16, Y + 30, { sx, sy, flash: a.flash, glow, flip: a.aim < 0 });
    // 쿠리만쥬 곁 버프: 머리 위 작은 음표처럼 위로 뜨는 화살표
    if (u.haste > 0 || u.hasteT > 0) {
      const yy = Y + 3 + Math.round(Math.sin(t * 5 + a.seed * 9));
      x.fillStyle = A.INK; x.fillRect(X + 3, yy, 5, 3); x.fillRect(X + 4, yy - 1, 3, 1); x.fillRect(X + 4, yy + 3, 3, 3);
      x.fillStyle = u.hasteT > 0 ? '#ff8a3d' : '#ffd36a'; x.fillRect(X + 4, yy + 1, 3, 1); x.fillRect(X + 5, yy, 1, 1); x.fillRect(X + 5, yy + 2, 1, 3);
    }
    stars(x, X, Y, u.g);
    // 침묵: 회색 덮개 + 「쉿」 + 남은 시간 고리
    if (u.silT > 0) {
      x.save(); x.globalAlpha = 0.55; x.fillStyle = '#5b4b84'; A.roundRect(x, X + 2, Y + 3, TILE - 4, TILE - 5, 7); x.fill();
      x.globalAlpha = 1; x.strokeStyle = '#d9c8ff'; x.lineWidth = 2;
      x.beginPath(); x.arc(X + 16, Y + 15, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.silT / BOSS.silence.t)); x.stroke();
      x.font = '8px Galmuri11, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 3; x.strokeStyle = A.INK; x.strokeText('쉿', X + 16, Y + 15); x.fillStyle = '#ffffff'; x.fillText('쉿', X + 16, Y + 15);
      x.restore();
    }
    // 합성할 짝이 있으면 초록 화살표
    if (g.mateOf(i) >= 0 && !dragging) {
      const yy = Y + 4 + Math.round(Math.sin(t * 6) * 1.2);
      x.fillStyle = A.INK; x.fillRect(X + 24, yy, 5, 2); x.fillRect(X + 25, yy - 1, 3, 1); x.fillRect(X + 26, yy - 2, 1, 1); x.fillRect(X + 25, yy + 2, 3, 3);
      x.fillStyle = '#7ddc6a'; x.fillRect(X + 25, yy, 3, 1); x.fillRect(X + 26, yy - 1, 1, 1); x.fillRect(X + 26, yy + 1, 1, 3);
    }
  }
  function stars(x, X, Y, gi) {
    const n = GR[gi].stars, step = n >= 5 ? 5.5 : 7;
    for (let k = 0; k < n; k++) star(x, Math.round(X + 16 - (n - 1) * step / 2 + k * step), Y + 29, gi >= 4 ? RAINBOW[k % RAINBOW.length] : GR[gi].color);
  }
  // 시트 프레임(특성 괴물 · 보스) 고르기 — 없으면 null (예전 그린 괴물로)
  function sheetFrame(e, t) {
    if (!MON.ready) return null;
    if (e.bs) {
      const ph = e.bs.phase, k = Math.floor(t * (ph === 'walk' ? 5 : 4) + e.id);
      if (ph === 'warn') return { f: MON.frame('boss', e.bt, 'ready', k), face: true };
      if (ph === 'cast') return { f: MON.frame('boss', e.bt, 'cast', k), face: true };
      return { f: MON.frame('boss', e.bt, 'walk', k), flip: e.dir === 0 || e.dir === 1 };
    }
    if (!e.trait) return null;
    const flip = e.dir === 2 || e.dir === 3;   // 시트 괴물은 오른쪽을 봄
    if (e.downT > 0) {
      const k = 1 - e.downT / TR.revive.downT;
      return { f: MON.frame('mon', 'revive', k < 0.6 ? 'down' : 'rise', 0), flip, ghost: k < 0.6 };
    }
    if (e.small) return { f: MON.frame('mon', 'split', 'small', Math.floor(t * 4 + e.id)), flip };
    if (view.bigHit.get(e.id) > 0) return { f: MON.frame('mon', e.trait, 'hit', 0), flip };
    // 재생: 회복 중이면 가끔 반짝 프레임
    if (e.trait === 'regen' && e.hp < e.max && !(e.burnT > 0) && !(e.psnT > 0) && (t + e.id * 0.3) % 1.6 < 0.3) return { f: MON.frame('mon', 'regen', 'heal', 0), flip };
    return { f: MON.frame('mon', e.trait, 'walk', Math.floor(t * (e.trait === 'fast' ? 12 : 8) + e.id)), flip };
  }
  function drawSheet(x, sf, X, by, e) {
    const f = sf.f;
    x.save();
    x.translate(X, by);
    if (sf.flip) x.scale(-1, 1);
    if (sf.ghost) x.globalAlpha = 0.85;
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(f.img, -f.ax, -f.ay, f.w, f.h);
    if (e && e.hitT > 0.07) { x.globalAlpha = e.kind === 'boss' ? 0.3 : 0.5; x.drawImage(A.silhouette(f.img, '#ffffff'), -f.ax, -f.ay, f.w, f.h); }
    if (e && e.slowT > 0) { x.globalAlpha = 0.35; x.drawImage(A.silhouette(f.img, '#9fd3ff'), -f.ax, -f.ay, f.w, f.h); }
    if (e && e.stunT > 0) { x.globalAlpha = 0.35; x.drawImage(A.silhouette(f.img, '#ffe27a'), -f.ax, -f.ay, f.w, f.h); }
    x.restore();
  }
  function drawEnemy(x, e, t) {
    const fr = Math.floor(t * 4 + e.id * 0.37) % 2;
    const sf = sheetFrame(e, t);
    if (sf && sf.f) {
      const X = e.x * TILE, Y = e.y * TILE, by = Y + (e.bs ? 15 : e.small ? 7 : 10), f = sf.f;
      x.fillStyle = 'rgba(74,53,48,.18)';
      x.beginPath(); x.ellipse(X, by - 1, Math.min(f.w, e.bs ? 44 : 26) * 0.34, e.bs ? 3.5 : 2.5, 0, 0, Math.PI * 2); x.fill();
      drawSheet(x, sf, X, by, e);
      statusFx(x, e, t, X, by, e.bs ? 50 : f.h - 2, e.bs ? 36 : 16);
      return;
    }
    let spr = e.kind === 'boss' ? A.enemy.boss[0][fr] : A.enemy[e.kind === 'minion' ? 'blob' : e.kind][fr];
    const X = e.x * TILE, Y = e.y * TILE;
    const w = spr.width, h = spr.height;
    const by = Y + (e.kind === 'boss' ? 14 : 9);
    const sc = e.kind === 'minion' ? 0.7 : 1;
    x.fillStyle = 'rgba(74,53,48,.18)';
    x.beginPath(); x.ellipse(X, by, w * 0.32 * sc, 2.5, 0, 0, Math.PI * 2); x.fill();
    x.save();
    x.translate(Math.round(X), Math.round(by));
    if (e.dir === 2) x.scale(-1, 1);
    if (sc !== 1) x.scale(sc, sc);
    x.imageSmoothingEnabled = false;
    const hop = e.kind === 'minion' ? -Math.abs(Math.sin(t * 9 + e.id)) * 2 : 0;
    x.drawImage(spr, -Math.round(w / 2), -h + hop);
    if (e.hitT > 0.07) { x.globalAlpha = e.kind === 'boss' ? 0.35 : 0.6; x.drawImage(A.flashOf(spr), -Math.round(w / 2), -h + hop); x.globalAlpha = 1; }
    if (e.slowT > 0) { x.globalAlpha = 0.4; x.drawImage(A.silhouette(spr, '#9fd3ff'), -Math.round(w / 2), -h + hop); x.globalAlpha = 1; }
    if (e.stunT > 0) { x.globalAlpha = 0.4; x.drawImage(A.silhouette(spr, '#ffe27a'), -Math.round(w / 2), -h + hop); x.globalAlpha = 1; }
    x.restore();
    statusFx(x, e, t, X, by, h * sc, e.kind === 'boss' ? 36 : 16);
  }
  function statusFx(x, e, t, X, by, h, bw0) {
    const w = bw0;
    // 상태 표시
    if (e.slowT > 0) { x.fillStyle = '#ffffff'; x.fillRect(X - w / 2 + 2, by - h + 6, 1, 1); x.fillRect(X + w / 2 - 4, by - 6, 1, 1); }
    if (e.burnT > 0) {
      const f = Math.floor(t * 12) % 2;
      x.fillStyle = '#ff8a3d'; x.fillRect(X - 3, by - h - 1 - f, 2, 2); x.fillRect(X + 2, by - h + f, 2, 2);
      x.fillStyle = '#ffd36a'; x.fillRect(X - 3, by - h - f, 1, 1); x.fillRect(X + 2, by - h + 1 + f, 1, 1);
    }
    if (e.psnT > 0) { // 독: 겹 수만큼 초록 방울이 몸 위로 보글보글
      for (let k = 0; k < e.psn; k++) {
        const ph = (t * 1.6 + k * 0.37 + e.id * 0.13) % 1;
        const bx = Math.round(X - 6 + ((k * 5) % 13)), byb = Math.round(by - 4 - ph * (h - 2));
        x.globalAlpha = 1 - ph * 0.6; x.fillStyle = A.INK; x.fillRect(bx - 1, byb - 1, 3, 3); x.fillStyle = '#9be07a'; x.fillRect(bx, byb, 1, 1);
      }
      x.globalAlpha = 1;
    }
    // 체력 막대 — 특성 괴물은 테두리가 특성 색 (TRAIT_COL)
    const bw = bw0, bx = Math.round(X - bw / 2), byy = Math.round(by - h - 3);
    if (e.downT > 0) return;
    if (e.hp < e.max || e.kind === 'boss') {
      const k = Math.max(0, e.hp / e.max);
      x.fillStyle = e.trait && !e.small ? TRAIT_COL[e.trait] : A.INK; x.fillRect(bx - 1, byy - 1, bw + 2, 4);
      x.fillStyle = '#ffffff'; x.fillRect(bx, byy, bw, 2);
      x.fillStyle = k > 0.5 ? '#7ddc6a' : k > 0.25 ? '#ffc94a' : '#ff6a6a'; x.fillRect(bx, byy, Math.ceil(bw * k), 2);
    }
  }
  // 투사체: 시트의 공격 이펙트 줄 「돌진」(친구 색 혜성)을 날아가는 쪽으로 돌려 줄여 그림, 그림이 없으면 직접 그린 별
  const SHOT_SIZE = 13, SHOT_SPIN = { rakko: 1, pungdengi: 1, kurimanju: 1 }, SHOT_AIM = { hachiware: 1, usagi: 1, momonga: 1 };
  function drawProj(x, p, t) {
    const C = A.char[p.ch], f = C.shot;
    const X = p.x * TILE, Y = p.y * TILE - 6;
    const ang = p.pierce ? Math.atan2(p.vy, p.vx) : Math.atan2(p.ty - p.y, p.tx - p.x);
    x.save(); x.translate(X, Y);
    if (f && f.aim) x.rotate(ang);            // 시트의 돌진 이펙트(오른쪽으로 날아가는 그림) — 날아가는 쪽으로
    else if (SHOT_SPIN[p.ch]) x.rotate(t * 10);
    else if (SHOT_AIM[p.ch]) x.rotate(ang);
    const k = (p.skill ? 1.5 : 1) * (p.g >= 2 ? 1.15 : 1) * (p.pierce ? 1.45 : 1);
    if (f) {
      const sc = ((f.sz || SHOT_SIZE) * k) / Math.max(f.w, f.h);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(f.img, -f.w * sc / 2, -f.h * sc / 2, f.w * sc, f.h * sc);
    } else {
      const img = A.shot[p.ch] || A.shot.chiikawa;
      x.imageSmoothingEnabled = false;
      x.drawImage(img, (-img.width / 2) * k, (-img.height / 2) * k, img.width * k, img.height * k);
    }
    x.restore();
  }
  // 동전 칸(윗줄 동전 아이콘)의 판 도트 좌표 — 판 밖이어도 됨(그 방향으로 날아가다 사라짐)
  let coinTg = null, coinTgAt = -9;
  function coinTarget() {
    if (coinTg && view.t - coinTgAt < 0.5) return coinTg;
    const r = cvs.getBoundingClientRect(), c = $('coinIco').getBoundingClientRect();
    coinTg = { x: ((c.left + c.width / 2 - r.left) / r.width) * BW, y: ((c.top + c.height / 2 - r.top) / r.height) * BH - PAD };
    coinTgAt = view.t;
    return coinTg;
  }
  function drawFx(x, f) {
    const k = Math.max(0, f.t / f.life);
    if (f.t < 0) return;
    x.save();
    switch (f.type) {
      case 'part':
        x.globalAlpha = 1 - k; x.fillStyle = f.col; x.fillRect(Math.round(f.x), Math.round(f.y), f.sz + 1, f.sz + 1); break;
      case 'spark': {
        const img = A.spark[f.key] || A.spark.white;
        x.globalAlpha = 1 - k * k; x.imageSmoothingEnabled = false;
        const sc = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.6;
        x.drawImage(img, f.x - 3.5 * sc, f.y - 3.5 * sc, 7 * sc, 7 * sc); break;
      }
      case 'ring':
        x.globalAlpha = 1 - k; x.strokeStyle = f.col; x.lineWidth = f.w || 2;
        x.beginPath(); x.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * Math.sqrt(k), 0, Math.PI * 2);
        if (f.fill) { x.fillStyle = f.fill; x.fill(); }
        x.stroke(); break;
      case 'pillar': {
        x.globalAlpha = (1 - k) * 0.7; x.fillStyle = f.col;
        const w = 18 * (1 - k * 0.6);
        x.fillRect(f.x - w / 2, f.y - 40, w, 54);
        x.globalAlpha = (1 - k) * 0.9; x.fillStyle = '#ffffff'; x.fillRect(f.x - w / 6, f.y - 40, w / 3, 54);
        break;
      }
      case 'poof':
        x.globalAlpha = 1 - k; x.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.beginPath(); x.arc(f.x + Math.cos(a) * f.r * k, f.y + Math.sin(a) * f.r * k * 0.7, 3 * (1 - k) + 1, 0, Math.PI * 2); x.fill(); }
        break;
      case 'sprite': case 'hitspr': {   // hitspr = 맞은 자리 효과(괴물 위에 그림)
        const sc = f.k0 + (f.k1 - f.k0) * Math.sqrt(k);
        x.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        const im = f.img;
        x.drawImage(im.img, f.x - im.w * sc / 2, f.y - im.h * sc / 2, im.w * sc, im.h * sc);
        break;
      }
      case 'coin': {
        x.globalAlpha = 1; x.imageSmoothingEnabled = false;
        const sq = 0.6 + 0.4 * Math.abs(Math.cos(f.t * 14));   // 돌며 반짝
        x.drawImage(A.coin, f.x - 4 * sq, f.y - 4, 8 * sq, 8);
        break;
      }
      case 'corpse': {
        const fr = MON.frame(f.grp, f.name, f.act, f.act === 'split' ? Math.floor(k * 2) : 0);
        if (!fr) break;
        x.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        drawSheet(x, { f: fr, flip: f.flip }, f.x, f.y + 10, null);
        break;
      }
      case 'nova': {
        x.globalAlpha = 0.5 * (1 - k);
        x.fillStyle = rainbow(x, 0, 0, BW, ROWS * TILE, 0, f.t);
        x.fillRect(0, 0, BW, ROWS * TILE);
        x.globalAlpha = 1 - k; x.strokeStyle = '#ffffff'; x.lineWidth = 4;
        x.beginPath(); x.arc(f.x, f.y, 10 + k * BW, 0, Math.PI * 2); x.stroke();
        break;
      }
      case 'meteor': {
        const yy = f.y - 60 * (1 - Math.min(1, k * 2.2));
        x.globalAlpha = 1 - Math.max(0, k - 0.5) * 2;
        x.strokeStyle = '#fff3b0'; x.lineWidth = 3; x.beginPath(); x.moveTo(f.x + 18, yy - 30); x.lineTo(f.x, yy); x.stroke();
        star(x, Math.round(f.x), Math.round(yy), '#ffd36a');
        break;
      }
      case 'rays':
        x.translate(f.x, f.y); x.rotate(f.t * 2); x.globalAlpha = 0.6 * (1 - k); x.fillStyle = f.col;
        for (let i = 0; i < 10; i++) { x.rotate(Math.PI / 5); x.beginPath(); x.moveTo(0, 0); x.lineTo(-3, -48); x.lineTo(3, -48); x.closePath(); x.fill(); }
        break;
    }
    x.restore();
  }
  // 소환 · 합성 때 뜨는 초상 (시트 portrait.png). 작은 것 = 칸 위로 떠오름, 큰 것 = 판 가운데 카드
  function drawCard(x, c) {
    if (c.t < 0) return;
    const P = A.char[c.ch].portrait, gr = GR[c.g], k = c.t / c.life;
    const ease = k < 0.18 ? k / 0.18 : 1;
    const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    x.save();
    x.globalAlpha = fade;
    if (!c.big) {
      const sc = 0.42 * (0.7 + 0.3 * ease), cx = c.x, cy = c.y - 18 - k * 10;
      x.fillStyle = A.INK; x.beginPath(); x.arc(cx, cy, 15 * ease, 0, Math.PI * 2); x.fill();
      x.fillStyle = gr.glow; x.beginPath(); x.arc(cx, cy, 13.5 * ease, 0, Math.PI * 2); x.fill();
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(P.img, cx - P.w * sc / 2, cy - P.h * sc / 2, P.w * sc, P.h * sc);
      x.restore();
      return;
    }
    // 큰 카드: 판 가운데, 원본 크기(칸 64px 일 때 ×2)
    const cx = BW / 2, cy = (ROWS * TILE) / 2 - 10, W = 92, H = 104;
    const pop = k < 0.18 ? 0.6 + 0.5 * ease : k < 0.28 ? 1.1 - (k - 0.18) : 1;
    x.translate(cx, cy); x.scale(pop, pop);
    x.save(); x.rotate(view.t * 0.7); x.globalAlpha = fade * 0.5; x.fillStyle = gr.glow;
    for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); x.beginPath(); x.moveTo(0, 0); x.lineTo(-7, -86); x.lineTo(7, -86); x.closePath(); x.fill(); }
    x.restore();
    x.fillStyle = A.INK; A.roundRect(x, -W / 2 - 3, -H / 2 - 3, W + 6, H + 6, 12); x.fill();
    x.fillStyle = c.g >= 4 ? rainbow(x, -W / 2, -H / 2, W, H, 10, view.t) : gr.color; A.roundRect(x, -W / 2, -H / 2, W, H, 10); x.fill();
    x.fillStyle = '#ffffff'; A.roundRect(x, -W / 2 + 4, -H / 2 + 4, W - 8, H - 26, 8); x.fill();
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const img = PX === 'hybrid' && !(P.k < 1) ? A.big(P.img, Math.min(6, Math.ceil(s))) : P.img;   // 고해상도 초상은 그대로 줄임
    if (PX === 'nearest') x.imageSmoothingEnabled = false;
    x.drawImage(img, -P.w / 2, -H / 2 + 4 + (H - 26 - P.h) / 2, P.w, P.h);
    x.font = '9px Galmuri11, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.lineWidth = 3; x.strokeStyle = A.INK; x.lineJoin = 'round';
    const label = gr.name + ' ' + CH[c.ch].name;
    x.strokeText(label, 0, H / 2 - 11); x.fillText(label, 0, H / 2 - 11);
    for (let i = 0; i < gr.stars; i++) star(x, Math.round(-((gr.stars - 1) * 3.5) + i * 7), Math.round(-H / 2 + 10), c.g >= 4 ? RAINBOW[i] : '#fff3b0');
    x.restore();
  }
  function drawTexts(x) {
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const tx of view.texts) {
      if (tx.t < 0) continue;
      const k = tx.t / tx.life;
      const pop = tx.pop ? 1 + Math.max(0, 0.4 - tx.t * 2) : 1;
      x.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      x.font = Math.round(tx.size * pop * 10) / 10 + 'px Galmuri11, sans-serif';
      const X = tx.x + (tx.coin ? 4 : 0), Y = tx.y;
      x.lineWidth = tx.size * 0.42; x.strokeStyle = A.INK; x.strokeText(tx.str, X, Y);
      x.fillStyle = tx.col; x.fillText(tx.str, X, Y);
      if (tx.coin) { const wd = x.measureText(tx.str).width; x.imageSmoothingEnabled = false; x.drawImage(A.coin, X - wd / 2 - 11, Y - 6, 10, 10); }
    }
    x.restore();
  }
  function drawBossBar(x) {
    const b = g.enemies.find((e) => e.kind === 'boss');
    if (!b) return;
    const w = 110, X = (BW - w) / 2, Y = TILE + 3, B = BOSS[b.bt] || T.bosses[0];
    x.save();
    x.fillStyle = A.INK; A.roundRect(x, X - 3, Y - 2, w + 6, 13, 4); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(X, Y + 5, w, 4);
    x.fillStyle = '#ff6a8a'; x.fillRect(X, Y + 5, Math.ceil(w * Math.max(0, b.hp / b.max)), 4);
    x.font = '6px Galmuri11, sans-serif'; x.fillStyle = '#ffffff'; x.textBaseline = 'top';
    x.fillText(B.name + ' ' + fmt(Math.max(0, b.hp)), X, Y - 1);
    x.textAlign = 'right';
    if (g.wave >= T.waves && !g.endless) { x.fillStyle = '#ffd0dc'; x.fillText(Math.ceil(Math.max(0, g.tWave)) + '초', X + w, Y - 1); }
    else if (b.bs) {
      const ph = b.bs.phase;
      x.fillStyle = ph === 'walk' ? '#e9dcff' : '#ffd0e6';
      x.fillText(B.skill + (ph === 'warn' ? ' 준비!' : ph === 'cast' ? ' 쓰는 중' : ' ' + Math.ceil(Math.max(0, b.bs.t)) + '초'), X + w, Y - 1);
    }
    x.restore();
  }
  function render() {
    const t = view.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#c9e5a6'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    const sh = view.shake > 0 && !calm() ? view.shake * 6 * s : 0;
    ctx.setTransform(s, 0, 0, s, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh + PAD * s);
    ctx.imageSmoothingEnabled = false;
    if (floorHi) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(topHi, 0, -PAD, BW, PAD);
      ctx.drawImage(floorHi, 0, 0, BW, ROWS * TILE);
      // 밤 숲 난이도(어려움 · 지옥)는 판도 살짝 어둡고 푸르게 — 길 · 칸은 읽히는 만큼만
      if (g && g.diff >= 2) { ctx.fillStyle = 'rgba(30,40,95,.2)'; ctx.fillRect(0, -PAD, BW, BH); }
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.drawImage(A.top, 0, -PAD);
      ctx.drawImage(A.floor, 0, 0);
    }
    if (!g) return;
    // 고른 아군의 사거리
    if (sel >= 0 && g.slots[sel].u && !(drag && drag.moved)) {
      const p = slotXY(sel), r = g.unitRange(g.slots[sel].u) * TILE;
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = -t * 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    for (let i = 0; i < g.slots.length; i++) drawSlot(ctx, i, t);
    // 합성으로 날아가는 짝
    for (const f of view.flyGhosts) {
      const k = Math.min(1, f.t / f.life), e = k * k;
      drawChar(ctx, f.ch, f.x0 + (f.x1 - f.x0) * e, f.y0 + 14 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 10, { flash: k, alpha: 1 });
    }
    // 범위 고리 · 스킬 효과 그림은 괴물 밑에 — 다들 보스를 때릴 때 보스가 효과에 묻혀 안 보이지 않게
    const UNDER = { ring: 1, sprite: 1, pillar: 1, rays: 1 };
    for (const f of view.fx) if (UNDER[f.type]) drawFx(ctx, f);
    const es = g.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of es) drawEnemy(ctx, e, t);
    for (const p of g.proj) drawProj(ctx, p, t);
    for (const f of view.fx) if (!UNDER[f.type]) drawFx(ctx, f);
    if (drag && drag.moved) {
      const u = g.slots[drag.from].u;
      if (u) drawChar(ctx, u.ch, drag.ax, drag.ay + 14, { sx: 1.05, sy: 1.05, glow: GR[u.g].color });
    }
    drawBossBar(ctx);
    for (const c of view.cards) drawCard(ctx, c);
    drawTexts(ctx);
    if (view.flash) {
      const k = view.flash.t / view.flash.life;
      ctx.save(); ctx.globalAlpha = view.flash.a * (1 - k); ctx.fillStyle = view.flash.col; ctx.fillRect(0, -PAD, BW, BH); ctx.restore();
    }
  }

  // ── 시간 ──────────────────────────────────────────────────
  let lastT = 0, acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    view.t += dt;
    if (view.stop > 0) view.stop -= dt;
    else if (g && phase === 'play') {
      acc += dt * speeds[spd];
      let n = 0;
      while (acc >= STEP && n < 60) { g.step(STEP); acc -= STEP; n++; }
      if (n >= 60) acc = 0;
      onEvents();
    }
    // 보스를 잡아 보상 카드가 걸려 있으면(규칙은 멈춰 있음) 판으로 돌아왔을 때 꼭 보상 화면을 엶
    // — 행운 · 레시피 덮개가 열려 있던 사이에 보스가 죽어도 판이 멈춘 채 남지 않게
    if (g && phase === 'play' && g.pick && view.t - pickAt > 1.1) pickScreen();
    tickView(phase === 'play' || phase === 'end' ? dt : 0);
    render();
    hudTick();
    requestAnimationFrame(frame);
  }
  function tickView(dt) {
    if (!dt) return;
    if (view.shake > 0) view.shake = Math.max(0, view.shake - dt);
    for (const a of view.an.values()) {
      if (a.delay > 0) { a.delay -= dt; continue; }
      if (a.pop > 0) a.pop = Math.max(0, a.pop - dt / 0.35);
      if (a.atk > 0) a.atk = Math.max(0, a.atk - dt / 0.16);
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt / 0.35);
      if (a.mode !== 'idle') { a.mt += dt; if (a.mt >= a.md) { a.mode = 'idle'; a.mt = 0; } }
      if (a.buff > 0) a.buff -= dt;
    }
    for (const c of view.cards) c.t += dt;
    view.cards = view.cards.filter((c) => c.t < c.life);
    for (const f of view.fx) {
      f.t += dt;
      if (f.type === 'part' || f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 70 * dt; f.vx *= 0.96; }
      else if (f.type === 'coin' && f.t > 0) {
        if (f.t < 0.32) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 160 * dt; }
        else {   // 동전 칸(윗줄)을 향해 빨려 감
          const tg = coinTarget(), dx = tg.x - f.x, dy = tg.y - f.y, l = Math.hypot(dx, dy) || 1, sp = 260 + (f.t - 0.32) * 700;
          if (l < sp * dt + 4) { f.t = f.life; if (!f.done) { f.done = 1; bump($('coinIco').parentNode); S.play('coinfly'); } }
          else { f.x += (dx / l) * sp * dt; f.y += (dy / l) * sp * dt; }
        }
      }
    }
    view.fx = view.fx.filter((f) => f.t < f.life);
    for (const tx of view.texts) { if (tx.delay > 0) { tx.delay -= dt; tx.t = -1; continue; } tx.t = Math.max(0, tx.t) + dt; tx.y += tx.vy * dt; tx.vy *= 0.92; }
    view.texts = view.texts.filter((tx) => tx.t < tx.life);
    for (const f of view.flyGhosts) f.t += dt;
    if (view.flash) { view.flash.t += dt; if (view.flash.t >= view.flash.life) view.flash = null; }
    for (const [id, v] of view.bigHit) { if (v - dt <= 0) view.bigHit.delete(id); else view.bigHit.set(id, v - dt); }
    view.flyGhosts = view.flyGhosts.filter((f) => f.t < f.life);
  }

  // ── 윗줄 · 판넬 ──────────────────────────────────────────
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function hudTick() {
    if (!g) return;
    if (bannerQ.length && view.t - bannerAt >= 1.5) banner.apply(null, bannerQ.shift());
    coachTick();
    setText('waveTxt', g.wave ? (g.endless ? '무한 ' + g.wave : '웨이브 ' + g.wave + '/' + T.waves) : '준비');
    const last = g.wave >= T.waves && !g.endless;
    setText('waveT', g.over ? '' : last ? '남은 ' + Math.ceil(Math.max(0, g.tWave)) + '초' : '다음 ' + Math.ceil(Math.max(0, g.tWave)) + '초');
    // 다음 웨이브 미리 보기: 특성 · 보스
    const nw = g.wave + 1;
    const nx = last || g.over ? '' : g.isBossWave(nw) ? '보스 「' + g.bossType(nw).skill + '」' : g.nextTraits().map((k) => TR[k].name).join('·') || '보통';
    setText('nextTxt', nx ? '다음: ' + nx : '');
    const load = g.load(), k = Math.min(1, load / g.cap);
    const lb = $('loadBar'); const wpct = Math.round(k * 100) + '%';
    if (hudCache.lb !== wpct) { hudCache.lb = wpct; lb.style.width = wpct; }
    setText('loadTxt', '괴물 ' + load + '/' + g.cap);
    const cls = 'pill load' + (k >= 0.75 ? ' hot' : k >= 0.5 ? ' warn' : '');
    if (hudCache.lc !== cls) { hudCache.lc = cls; $('loadBox').className = cls; }
    setText('coinTxt', String(g.coins));
    setText('costTxt', String(g.cost()));
    const canSum = !g.over && g.coins >= g.cost() && g.empty().length > 0;
    const sb = $('summonBtn');
    if (hudCache.sb !== canSum) { hudCache.sb = canSum; sb.classList.toggle('pulse', canSum && g.empty().length > 0); sb.setAttribute('aria-disabled', String(!canSum)); sb.style.filter = canSum ? '' : 'grayscale(.6)'; sb.style.opacity = canSum ? '' : '.7'; }
    // 확률 · 행운 · 신화 버튼
    const oc = g.oddsCost();
    const okey = g.oddsLv + '|' + (g.coins >= oc) + '|' + !!g.over;
    if (hudCache.odds !== okey) {
      hudCache.odds = okey;
      $('oddsLv').textContent = 'Lv' + g.oddsLv;
      $('oddsCost').textContent = oc === Infinity ? '최대' : String(oc);
      $('oddsBtn').disabled = !!g.over || oc === Infinity || g.coins < oc;
      const bar = $('oddsBar'); bar.innerHTML = '';
      g.odds().forEach((p, i) => { if (p > 0) { const s2 = document.createElement('i'); s2.style.width = Math.max(2, p * 100) + '%'; s2.style.background = GR[i].color; bar.appendChild(s2); } });
      infoKey = '';
    }
    setText('cloverTxt', String(g.clovers));
    const ready = g.readyRecipes().length > 0;
    const mkey = ready + '|' + g.clovers;
    if (hudCache.myth !== mkey) { hudCache.myth = mkey; $('mythBtn').classList.toggle('pulse', ready); $('mythDot').hidden = !ready; $('luckBtn').classList.toggle('glow', g.clovers > 0); }
    GR.forEach((gr, i) => {
      if (i >= T.upgrade.base.length) return;
      const b = $('up' + i), c = g.upCost(i);
      const key = g.lv[i] + '|' + (c === Infinity ? 'max' : c) + '|' + (g.coins >= c);
      if (b.dataset.k !== key) {
        b.dataset.k = key;
        b.querySelector('b i').textContent = 'Lv' + g.lv[i];
        b.querySelector('span b').textContent = c === Infinity ? '최대' : String(c);
        b.disabled = g.over || g.coins < c;
      }
    });
    infoTick();
  }
  function buildUps() {
    const box = $('ups');
    box.innerHTML = '';
    GR.forEach((gr, i) => {
      if (i >= T.upgrade.base.length) return;   // 신화는 전설 강화를 같이 받음
      const b = document.createElement('button');
      b.className = 'up'; b.id = 'up' + i; b.style.setProperty('--c', gr.color);
      const nm = GR.filter((_, j) => T.upGroup[j] === i).map((x) => x.name).join('·');
      b.setAttribute('aria-label', nm + ' 등급 강화');
      b.innerHTML = '<b>' + nm + ' <i>Lv0</i></b><span></span>';
      const sp = b.querySelector('span');
      const ci = document.createElement('canvas'); ci.width = 12; ci.height = 12; ci.getContext('2d').drawImage(A.coin, 0, 0); sp.appendChild(ci);
      const bb = document.createElement('b'); bb.style.font = 'inherit'; bb.style.color = 'inherit'; sp.appendChild(bb);
      b.addEventListener('click', () => { S.unlock(); const r = g.upgrade(i); if (!r.ok) { toast(r.why); S.play('nope'); } });
      box.appendChild(b);
    });
  }
  let infoKey = '';
  function infoTick() {
    const u = sel >= 0 && g.slots[sel] ? g.slots[sel].u : null;
    if (sel >= 0 && !u) sel = -1;
    const mate = u ? g.mateOf(sel) : -1;
    const key = u ? [sel, u.id, mate >= 0, g.lv[T.upGroup[u.g]], g.over, !!(u.haste || u.hasteT > 0), g.syn[u.ch] || 0, u.silT > 0].join('|') : 'none|' + (g.wave > 0) + '|' + g.oddsLv;
    if (key === infoKey) return;
    infoKey = key;
    const box = $('info');
    box.innerHTML = '';
    if (!u) {
      const d = document.createElement('div'); d.className = 'hint';
      d.innerHTML = (g.wave > 0
        ? '친구를 <b>눌러</b> 정보 · 팔기 · <b>같은 친구 · 같은 등급</b>끼리 <b>끌어다 겹치면</b> 합성! 전설 셋은 <b>신화</b> 레시피로.'
        : '<b>소환</b>을 눌러 친구를 불러요. 괴물이 길을 돌면 자동으로 공격해요. 길 위 괴물이 ' + g.cap + '마리가 되면 져요.') +
        '<br><span class="odds">소환 확률 ' + oddsText() + '</span>';
      box.appendChild(d);
      return;
    }
    const c = CH[u.ch], gr = GR[u.g], M = u.myth != null ? T.recipes[u.myth].myth : null;
    const por = portrait(u.ch); por.className = 'por'; por.style.borderColor = gr.color; por.style.background = gr.glow;
    box.appendChild(por);
    const tx = document.createElement('div'); tx.className = 'txt';
    const dmg = g.unitDmg(u), rate = g.unitRate(u), rng = g.unitRange(u);
    tx.innerHTML = '<div class="nm">' + c.name + ' <span class="gr" style="background:' + gr.color + '">' + gr.name + '</span></div>' +
      '<div class="ds">' + (u.silT > 0 ? '<b style="color:#8a5fd0">침묵 중</b> · ' : '') + '공격 ' + fmt(dmg) + ' · 1초에 ' + rate.toFixed(1) + '번' + (u.haste || u.hasteT > 0 ? ' (버프)' : '') + ' · 사거리 ' + rng.toFixed(1) + '칸' +
      (g.syn[u.ch] ? ' · <b>같은 친구 +' + Math.round(g.syn[u.ch] * 100) + '%</b>' : '') + '<br>' +
      (M ? '<b>신화 「' + M.name + '」</b> ' + M.desc + ' · ' : '') + c.desc + ' · 스킬 「' + c.skill.name + '」 ' + c.skill.desc + '</div>';
    box.appendChild(tx);
    const acts = document.createElement('div'); acts.className = 'acts';
    if (u.g < T.mergeTop) {
      const mb = document.createElement('button'); mb.className = 'btn small'; mb.id = 'mergeBtn'; mb.textContent = '합성';
      mb.disabled = mate < 0 || !!g.over;
      mb.title = mate < 0 ? '같은 캐릭터 · 같은 등급이 하나 더 있어야 해요' : '';
      mb.addEventListener('click', () => { S.unlock(); const m = g.mateOf(sel); if (m >= 0) { g.merge(m, sel); } });
      acts.appendChild(mb);
    }
    const sb = document.createElement('button'); sb.className = 'btn small pink'; sb.id = 'sellBtn'; sb.textContent = '팔기 +' + T.sell[u.g];
    sb.disabled = !!g.over;
    sb.addEventListener('click', () => { S.unlock(); g.sell(sel); sel = -1; });
    acts.appendChild(sb);
    box.appendChild(acts);
  }

  let toastT = 0, lastInterest = 0, pickAt = -9;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1700);
  }
  let bannerAt = -9;
  // 큰 글씨 컷인 (보스 등장 = 경고 띠 · 새 특성 = 짧은 띠). 판 위 DOM 이라 글자가 또렷함
  function cutin(big, small, kind, img) {
    const el = $('cutin');
    el.className = ''; void el.offsetWidth;
    el.innerHTML = '';
    if (img) { const im = document.createElement('img'); im.src = img; im.alt = ''; el.appendChild(im); }
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = big; d.appendChild(b);
    if (small) { const sm = document.createElement('small'); sm.textContent = small; d.appendChild(sm); }
    el.appendChild(d);
    el.className = 'go ' + (kind || 'wave');
  }
  $('toast').addEventListener('click', () => $('toast').classList.remove('on'));
  function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  const bannerQ = [];
  function banner(big, small, cls) {
    // 앞 배너가 아직 보이면 줄 세움 (보스 토벌 · 신화 · 웨이브가 한꺼번에 겹치지 않게) — hudTick 이 꺼냄
    if (view.t - bannerAt < 1.5) { if (bannerQ.length < 3) bannerQ.push([big, small, cls]); return; }
    bannerAt = view.t;
    const el = $('banner');
    el.className = ''; void el.offsetWidth;
    el.innerHTML = '';
    el.appendChild(document.createTextNode(big));
    if (small) { const sm = document.createElement('small'); sm.textContent = small; el.appendChild(sm); }
    el.className = 'go' + (cls === 'boss' ? ' boss' : cls === 'myth' ? ' myth' : '');
  }

  // ── 입력: 누르기 = 고르기, 끌기 = 옮기기 · 합성 ─────────────
  function toArt(ev) {
    const r = cvs.getBoundingClientRect();
    return { ax: ((ev.clientX - r.left) / r.width) * BW, ay: ((ev.clientY - r.top) / r.height) * BH - PAD };
  }
  function slotAt(ax, ay) {
    const i = Math.floor(ax / TILE), j = Math.floor(ay / TILE);
    if (i < 1 || j < 1 || i > COLS - 2 || j > ROWS - 2) return -1;
    return (j - 1) * (COLS - 2) + (i - 1);
  }
  cvs.addEventListener('pointerdown', (ev) => {
    if (!g || phase !== 'play') return;
    S.unlock();
    const p = toArt(ev), i = slotAt(p.ax, p.ay);
    if (i >= 0 && g.slots[i].u) {
      drag = { from: i, x0: ev.clientX, y0: ev.clientY, ax: p.ax, ay: p.ay, moved: false, id: ev.pointerId };
      try { cvs.setPointerCapture(ev.pointerId); } catch (e) { /* 일부 브라우저는 합성 이벤트에 캡처 불가 */ }
    } else { sel = -1; }
    ev.preventDefault();
  });
  cvs.addEventListener('pointermove', (ev) => {
    const p = toArt(ev);
    if (!drag) { const i = slotAt(p.ax, p.ay); cvs.style.cursor = i >= 0 && g && g.slots[i].u ? 'grab' : 'default'; return; }
    if (ev.pointerId !== drag.id) return;
    drag.ax = p.ax; drag.ay = p.ay;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 8) { drag.moved = true; sel = -1; S.play('pick'); }
    hover = slotAt(p.ax, p.ay);
    cvs.style.cursor = 'grabbing';
  });
  function endDrag(ev, cancel) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    const d = drag; drag = null; hover = -1;
    if (cancel || !g.slots[d.from].u) return;
    if (!d.moved) { sel = sel === d.from ? -1 : d.from; S.play('pick'); return; }
    const to = slotAt(d.ax, d.ay);
    if (to < 0 || to === d.from) return;
    const was = g.slots[to].u;
    const r = g.drop(d.from, to);
    if (r.ok && r.moved && !was) sel = to;
  }
  cvs.addEventListener('pointerup', (ev) => endDrag(ev, false));
  cvs.addEventListener('pointercancel', (ev) => endDrag(ev, true));
  cvs.addEventListener('contextmenu', (ev) => ev.preventDefault());

  $('summonBtn').addEventListener('click', () => {
    if (!g || phase !== 'play') return;
    S.unlock();
    const r = g.summon();
    if (!r.ok) { toast(r.why); S.play('nope'); }
  });
  $('oddsBtn').addEventListener('click', () => { if (!g || phase !== 'play') return; S.unlock(); const r = g.oddsUp(); if (!r.ok) { toast(r.why); S.play('nope'); } });
  $('luckBtn').addEventListener('click', () => { if (!g || phase !== 'play') return; S.unlock(); luckScreen(); });
  $('mythBtn').addEventListener('click', () => { if (!g || phase !== 'play') return; S.unlock(); mythScreen(); });
  $('spdBtn').addEventListener('click', () => { spd = (spd + 1) % speeds.length; $('spdBtn').firstChild.textContent = '×' + speeds[spd]; });
  $('setBtn').addEventListener('click', () => { S.unlock(); settingsScreen(phase === 'play' ? 'pause' : null); });
  $('pauseBtn').addEventListener('click', () => { if (phase === 'play') pauseScreen(); });
  $('codexBtn2').addEventListener('click', () => { if (phase === 'play') { phase = 'pause'; } codexScreen(true); });
  document.addEventListener('keydown', (ev) => {
    if (phase !== 'play' || ev.repeat) return;
    const k = ev.key.toLowerCase();
    if (k === ' ' || k === 's') { ev.preventDefault(); $('summonBtn').click(); }
    else if (k === 'escape') { if (sel >= 0) sel = -1; else pauseScreen(); }
    else if (k === 'p') pauseScreen();
    else if (k === 'f') $('spdBtn').click();
    else if (k === 'q') $('oddsBtn').click();
    else if (k === 'w') $('luckBtn').click();
    else if (k === 'e') $('mythBtn').click();
    else if (k >= '1' && k <= '4') { const b = $('up' + (+k - 1)); if (b) b.click(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') pauseScreen(); });
  addEventListener('resize', () => { fit(); });

  // ── 덮개 화면 ─────────────────────────────────────────────
  const ov = $('ov'), sheet = $('sheet');
  function open(html) { sheet.innerHTML = html; ov.hidden = false; sheet.scrollTop = 0; }
  function close() { ov.hidden = true; }
  function parade(box, ids, emo) { ids.forEach((id) => box.appendChild(portrait(id, 0, true, emo))); }
  function btn(id, fn) { const b = sheet.querySelector('#' + id); if (b) b.addEventListener('click', () => { S.unlock(); fn(); }); }

  function mmss(t) { t = Math.round(t); return Math.floor(t / 60) + '분 ' + (t % 60) + '초'; }
  function oddsText() { return g.odds().map((p, i) => (p > 0 ? GR[i].name + ' ' + (Math.round(p * 1000) / 10) + '%' : '')).filter(Boolean).join(' · '); }
  function chipHtml(keys) {
    if (!keys.length) return '<span class="sub">변수 칩 없음</span>';
    return keys.map((k) => '<span class="vchip"><b>' + T.chips[k].name + '</b> ' + T.chips[k].desc + '</span>').join('');
  }
  function diffBox() {
    const r = rec();
    let h = '<div class="diffs" id="diffs">';
    T.diffs.forEach((D, i) => {
      const o = unlocked(r, i), d = (r.d && r.d[D.key]) || {};
      h += '<button class="diff' + (i === diffSel ? ' on' : '') + '" data-i="' + i + '" style="--c:' + D.color + '"' + (o ? '' : ' disabled') + ' aria-pressed="' + (i === diffSel) + '">' +
        '<b>' + (o ? '' : LOCK) + D.name + '</b><span>' + (o ? D.desc : T.diffs[i - 1].name + ' 클리어하면 열려요') + '</span>' +
        '<em>' + (d.plays ? '최고 ' + (d.clears ? '클리어' + (d.endless ? ' · 무한 ' + d.endless : '') : d.best + '웨이브') : '기록 없음') + '</em></button>';
    });
    h += '</div><div class="vchips" id="vchips"></div>';
    return h;
  }
  function pickDiff(i) {
    diffSel = i;
    setBg(i);
    sheet.querySelectorAll('.diff').forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const D = T.diffs[i], chips = Core.rollChips(i, nextSeed);
    $('vchips').innerHTML = '<div class="sub">' + D.name + ' · 괴물 체력 ×' + D.hp + ' · 길 위 한도 ' + D.cap + '</div>' + (D.chips[1] ? '<div class="sub">이번 판 변수 칩</div>' + chipHtml(chips) : '');
  }
  // 판 뒤 배경: 쉬움 · 보통 = 낮 들판, 어려움 · 지옥 = 밤 숲 (index.html 의 body.bg-day / bg-night)
  function setBg(d) { document.body.classList.toggle('bg-night', d >= 2); document.body.classList.toggle('bg-day', d < 2); }
  function titleScreen() {
    phase = 'title';
    const r = rec();
    nextSeed = +Q.get('seed') || ((Date.now() & 0xffffff) | 1);
    if (!unlocked(r, diffSel)) diffSel = 1;
    open(
      '<div class="cover" role="img" aria-label="표지 — 들판 너머 괴물 무리"></div>' +
      '<h1>치이카와 <em>랜덤</em> 디펜스</h1>' +
      '<div class="sub">들판 토벌대 · 비영리 팬 게임</div>' +
      '<div class="parade" id="parade"></div>' +
      '<div class="rules"><ol>' +
      '<li><b>소환</b>하면 무작위 친구가 무작위 등급으로 자리에 나와요.</li>' +
      '<li>길을 도는 괴물을 알아서 공격해요. 잡으면 <b>동전</b>.</li>' +
      '<li><b>같은 친구 · 같은 등급</b> 둘을 겹치면 한 등급 위로 <b>합성</b>!</li>' +
      '<li>괴물은 웨이브마다 <b>특성</b>(고속·장갑·재생·분열·부활)이 바뀌어요. 보스는 <b>기술</b>을 써요.</li>' +
      '<li><b>전설 셋</b>을 모으면 <b>신화</b> 레시피! 길 위 괴물이 한도에 닿으면 패배, <b>' + T.waves + '웨이브</b> 보스를 잡으면 클리어.</li>' +
      '</ol></div>' +
      diffBox() +
      '<div class="row-btns"><button class="btn" id="startBtn">시작하기</button><button class="btn sky" id="codexBtn">도감 · 규칙</button></div>' +
      '<div class="rec">' + (r.plays ? '모든 난이도 ' + r.plays + '판 · 신화 레시피 ' + found(r).length + '/' + T.recipes.length + ' 발견' : '첫 판이에요!') + '</div>' +
      '<p class="sub notice">캐릭터 · 특성 괴물 · 보스 그림은 사람이 준 <b>팬 도트 시트</b>를 잘라 쓴 것이에요(공식 그림 아님). 일반 괴물 · 길 · 효과 · 소리는 직접 만들었어요. 치이카와 © nagano · 공식과 관련 없는 비영리 팬 게임.</p>'
    );
    parade($('parade'), T.chars.map((c) => c.id));
    sheet.querySelectorAll('.diff').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) { S.unlock(); S.play('pick'); pickDiff(+b.dataset.i); } }));
    pickDiff(diffSel);
    btn('startBtn', start);
    btn('codexBtn', () => codexScreen(false));
  }
  function codexScreen(inGame) {
    const odds = g ? g.odds() : T.odds.table[0], top = T.odds.table[T.odds.table.length - 1];
    let rows = '';
    GR.forEach((gr, i) => {
      const how = i >= 4 ? '레시피만' : (odds[i] ? Math.round(odds[i] * 1000) / 10 + '%' : '합성') + (top[i] && top[i] !== odds[i] ? ' → ' + Math.round(top[i] * 1000) / 10 + '%' : '');
      rows += '<tr><td><span class="gname" style="background:' + gr.color + '">' + gr.name + '</span></td><td>×' + gr.dmg + '</td><td>' + how + '</td><td>' + T.sell[i] + '</td></tr>';
    });
    let traits = '';
    for (const k in TR) traits += '<li><b>' + TR[k].name + '</b> ' + TR[k].desc + ' <small>(' + TR[k].from + '웨이브부터)</small></li>';
    let bosses = '';
    T.bosses.forEach((b, i) => { bosses += '<li><b>' + b.name + '</b> ' + (i + 1) * T.bossEvery + '웨이브 · 「' + b.skill + '」 ' + b.desc + '</li>'; });
    open(
      '<h2>도감 · 규칙</h2>' +
      '<div class="codex" id="codex"></div>' +
      '<table class="grades"><tr><th>등급</th><th>공격력</th><th>소환 확률 (최대 Lv)</th><th>팔면</th></tr>' + rows + '</table>' +
      '<h2>괴물 특성</h2><ul class="rules mini">' + traits + '</ul>' +
      '<h2>보스 기술</h2><ul class="rules mini">' + bosses + '<li>기술 전엔 멈춰 서서 「준비」 — 침묵은 노리는 칸이 보라색으로 깜빡여요. 무한 모드에선 차례로 돌아요.</li></ul>' +
      '<p class="sub">강화는 등급마다 따로 — 한 단계에 그 등급 친구 모두 공격력 +' + Math.round(T.upgrade.dmg * 100) + '% (신화는 전설 강화를 같이 받아요).<br>' +
      '<b>확률</b>: 동전으로 소환 등급 확률을 올려요(Lv' + (T.odds.table.length - 1) + '까지). <b>행운</b>: 보스를 잡으면 클로버 ' + T.luck.boss + '개 — 희귀 ' + T.luck.p[0] * 100 + '% · 영웅 ' + T.luck.p[1] * 100 + '% · 전설 ' + T.luck.p[2] * 100 + '% 확정 도전, 실패마다 +' + T.luck.pity * 100 + '%.<br>' +
      '보스를 잡으면 카드 셋 중 하나(고정 2 + 도박 1). 웨이브가 넘어갈 때 동전 ' + T.interest.rate * 100 + '% 이자(최대 ' + T.interest.cap + '). 같은 친구 2명 +10% · 4명 +25%.<br>' +
      '보스는 길 위에서 괴물 ' + T.bossWeight + '마리로 세요.<br>' +
      '폰: 소환 버튼 · 끌어서 합성 · 눌러서 팔기. 데스크톱: 스페이스 = 소환 · P = 멈춤 · Esc = 고르기 취소</p>' +
      '<div class="row-btns"><button class="btn" id="backBtn">' + (inGame ? '계속하기' : '돌아가기') + '</button></div>'
    );
    const box = $('codex');
    T.chars.forEach((c) => {
      const d = document.createElement('div');
      d.appendChild(portrait(c.id));
      const t = document.createElement('div');
      t.innerHTML = '<b>' + c.name + '</b><span>' + c.desc + '<br>스킬 「' + c.skill.name + '」 ' + c.skill.desc + '<br>사거리 ' + c.range + '칸 · 1초에 ' + c.rate + '번</span>';
      d.appendChild(t); box.appendChild(d);
    });
    btn('backBtn', () => { if (inGame) { close(); phase = 'play'; } else titleScreen(); });
  }
  // 설정 덮개: back = 닫으면 돌아갈 곳('pause' = 멈춤 메뉴, 없으면 시작 화면)
  function settingsScreen(back) {
    if (phase === 'play') phase = 'pause';
    const st = settings();
    const row = (id, label, on, note) => '<label><span>' + label + (note ? ' <small class="sub">' + note + '</small>' : '') + '</span><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '></label>';
    open('<h2>설정</h2><div class="set">' +
      row('stSfx', '효과음', st.sfx) + row('stMusic', '음악', st.music) +
      row('stVib', '진동', st.vib, navigator.vibrate ? '합성 · 보스 등장' : '이 기기는 지원 안 함') +
      row('stCalm', '움직임 줄이기', st.calm, '흔들림 · 번쩍임 끔') +
      '<label><span>기본 빠르기</span><select id="stSpd">' + speeds.map((v, i) => '<option value="' + i + '"' + (i === st.spd ? ' selected' : '') + '>×' + v + '</option>').join('') + '</select></label>' +
      '</div><div class="row-btns"><button class="btn" id="setDone">' + (back === 'pause' ? '돌아가기' : '닫기') + '</button></div>');
    const save = () => {
      const r = rec();
      r.set = { sfx: $('stSfx').checked, music: $('stMusic').checked, vib: $('stVib').checked, calm: $('stCalm').checked, spd: +$('stSpd').value };
      saveRec(r); applySettings();
      spd = r.set.spd; $('spdBtn').firstChild.textContent = '×' + speeds[spd];
    };
    ['stSfx', 'stMusic', 'stVib', 'stCalm', 'stSpd'].forEach((id) => $(id).addEventListener('change', () => { save(); S.play('pick'); if (id === 'stVib' && $(id).checked) vib(20); }));
    btn('setDone', () => { if (back === 'pause' && g && !g.over) pauseScreen(); else if (phase === 'title' || !g || g.over) titleScreen(); else { close(); phase = 'play'; } });
  }
  function pauseScreen() {
    phase = 'pause';
    open('<h2>잠깐 쉬어요</h2><p class="sub">' + T.diffs[g.diff].name + ' · 웨이브 ' + g.wave + ' · 동전 ' + g.coins + ' · 클로버 ' + g.clovers + '</p>' + (g.chips.length ? '<div class="vchips">' + chipHtml(g.chips) + '</div>' : '') +
      '<div class="row-btns"><button class="btn" id="resumeBtn">계속하기</button><button class="btn sky" id="setBtn2">설정</button><button class="btn sky" id="codexBtn">도감</button><button class="btn pink" id="quitBtn">처음으로</button></div>' +
      '<p class="sub keys">단축키: 스페이스 소환 · 1~4 강화 · Q 확률 · W 행운 · E 신화 · F 빠르기 · P/Esc 멈춤</p>');
    btn('resumeBtn', () => { close(); phase = 'play'; });
    btn('setBtn2', () => settingsScreen('pause'));
    btn('codexBtn', () => codexScreen(true));
    btn('quitBtn', () => { if (coach) coachEnd(false); titleScreen(); });
  }
  function endScreen(e) {
    if (phase !== 'end') return;
    const r = rec(), D = T.diffs[g.diff], d = drec(r, g.diff);
    const wasLocked = g.diff + 1 < T.diffs.length && !unlocked(r, g.diff + 1);
    // 무한 모드에서 진 판은 클리어 기록에 이미 들어 있으므로 판 수를 다시 세지 않음
    if (!e.endless) { r.plays = (r.plays || 0) + 1; d.plays = (d.plays || 0) + 1; }
    d.best = Math.max(d.best || 0, e.wave);
    if (e.endless) d.endless = Math.max(d.endless || 0, e.wave);
    if (e.win) { d.clears = (d.clears || 0) + 1; d.bestTime = Math.min(d.bestTime || 1e9, Math.round(g.time)); }
    saveRec(r);
    const opened = e.win && wasLocked && unlocked(r, g.diff + 1) ? T.diffs[g.diff + 1].name : '';
    const isBest = e.win && d.bestTime === Math.round(g.time);
    open(
      (e.win ? '<h1>클리어!</h1><div class="sub">' + D.name + ' · 들판에 평화가 왔어요' + (opened ? ' · <b>「' + opened + '」 열림!</b>' : '') + '</div>'
        : e.endless ? '<h1>무한 모드 끝</h1><div class="sub">' + D.name + ' · ' + e.wave + '웨이브까지 버텼어요 · ' + e.why + '</div>'
        : '<h1>패배…</h1><div class="sub">' + D.name + ' · ' + e.why + '</div>') +
      '<div class="parade" id="parade"></div>' +
      '<div class="stats">' +
      '<div><b>' + e.wave + (e.endless ? '' : '/' + T.waves) + '</b><span>' + (e.endless ? '무한 웨이브' : '웨이브') + '</span></div>' +
      '<div><b>' + g.kills + '</b><span>토벌한 괴물</span></div>' +
      '<div><b>' + mmss(g.time) + '</b><span>' + (isBest ? '새 최고 기록!' : '버틴 시간') + '</span></div>' +
      '<div><b style="color:' + (g.bestGrade >= 0 ? GR[g.bestGrade].color : 'inherit') + '">' + (g.bestGrade >= 0 ? GR[g.bestGrade].name : '-') + '</b><span>최고 등급</span></div>' +
      '</div>' +
      '<div class="rec">' + D.name + ' 최고 웨이브 ' + d.best + ' · 클리어 ' + (d.clears || 0) + '번' + (d.bestTime ? ' · 가장 빠른 클리어 ' + mmss(d.bestTime) : '') + (d.endless ? ' · 무한 ' + d.endless + '웨이브' : '') + ' (이 브라우저에만 저장)</div>' +
      '<div class="row-btns">' + (e.win ? '<button class="btn pink" id="endlessBtn">무한 모드로 계속</button>' : '') + '<button class="btn" id="againBtn">다시 하기</button><button class="btn sky" id="homeBtn">처음으로</button></div>'
    );
    btn('endlessBtn', () => { if (g.goEndless()) { close(); phase = 'play'; onEvents(); } });
    // 판에 남은 친구들
    const ids = [];
    g.slots.forEach((sl) => { if (sl.u && ids.length < 8) ids.push(sl.u.ch); });
    parade($('parade'), ids.length ? ids : ['chiikawa', 'hachiware', 'usagi'], e.win ? 'joy' : 'cry');
    btn('againBtn', () => { nextSeed = +Q.get('seed') || ((Date.now() & 0xffffff) | 1); start(); });
    btn('homeBtn', titleScreen);
  }
  // ── 3택 보상 (보스를 잡은 뒤) ──
  function pickScreen() {
    if (!g.pick) return;
    phase = 'pick';
    let h = '<h2>보상 고르기</h2><p class="sub">셋 중 하나 — 왼쪽 둘은 확정, 오른쪽은 도박</p><div class="cards3">';
    g.pick.forEach((c, i) => {
      h += '<button class="rcard' + (c.gamble ? ' gam' : '') + '" id="card' + i + '"><em>' + (c.gamble ? '도박 ' + Math.round(c.p * 100) + '%' : '확정') + '</em><b>' + c.name + '</b><span>' + c.desc + '</span></button>';
    });
    open(h + '</div>');
    g.pick.forEach((_, i) => btn('card' + i, () => { g.choose(i); close(); phase = 'play'; onEvents(); }));
  }
  // ── 행운 소환 (클로버) ──
  function luckScreen(msg) {
    if (phase === 'play') phase = 'pause';
    let h = '<h2>행운 소환</h2><p class="sub">클로버 <b>' + g.clovers + '</b>개 · 하나로 그 등급 「확정」 에 도전 · 실패할 때마다 +' + Math.round(T.luck.pity * 100) + '% (성공하면 처음으로)</p><div class="luck">';
    T.luck.grades.forEach((gi, i) => {
      const p = g.luckP(i);
      h += '<div class="lrow" style="--c:' + GR[gi].color + '"><b class="gname" style="background:' + GR[gi].color + '">' + GR[gi].name + '</b><span class="lp">' + Math.round(p * 100) + '%' + (g.pity[i] ? ' <small>(+' + Math.round(g.pity[i] * 100) + ')</small>' : '') + '</span>' +
        '<button class="btn small" id="luck' + i + '"' + (g.clovers < 1 || g.over ? ' disabled' : '') + '>도전 ' + CLOVER + '1</button></div>';
    });
    h += '</div><p class="lmsg" id="lmsg">' + (msg || (g.empty().length ? '' : '빈칸이 있어야 해요')) + '</p><div class="row-btns"><button class="btn" id="resumeBtn">계속하기</button></div>';
    open(h);
    T.luck.grades.forEach((gi, i) => btn('luck' + i, () => {
      const r = g.gamble(i);
      if (!r.ok) { S.play('nope'); luckScreen(r.why); return; }
      luckScreen(r.win ? '<b style="color:' + GR[gi].color + '">성공! ' + GR[gi].name + ' ' + CH[g.slots[r.slot].u.ch].name + '</b>' : '꽝… 다음엔 ' + Math.round(g.luckP(i) * 100) + '%');
      onEventsSound();
    }));
    btn('resumeBtn', () => { close(); phase = 'play'; });
  }
  // ── 신화 레시피 도감 ──
  function mythScreen(msg) {
    if (phase === 'play') phase = 'pause';
    const r = rec(), F = found(r);
    let h = '<h2>신화 레시피</h2><p class="sub">서로 다른 <b>전설</b> 셋 → 신화 하나. 판에 있는 전설 재료는 이름이 보여요. 빠진 재료는 <b>남는 전설 + 클로버 ' + T.luck.swap + '개</b>로 바꿀 수 있어요.</p><div class="recipes">';
    T.recipes.forEach((R, i) => {
      const N = g.recipeNeed(i), known = F.includes(i), ready = !N.miss.length;
      const onBoard = (ch) => !N.miss.includes(ch);
      const ing = R.need.map((ch) => (known || onBoard(ch) ? '<span class="ing' + (onBoard(ch) ? ' have' : '') + '">' + (onBoard(ch) ? '✓ ' : '') + '전설 ' + CH[ch].name + '</span>' : '<span class="ing">???</span>')).join('<i>+</i>');
      h += '<div class="recipe' + (ready ? ' ready' : '') + '"><div class="rhead" id="rpor' + i + '"></div><div class="rbody"><b>' + (known ? '신화 ' + CH[R.need[0]].name + ' 「' + R.myth.name + '」' : '??? 신화') + '</b>' +
        '<span class="rdesc">' + (known ? R.myth.desc : '만들면 알 수 있어요') + '</span><div class="ings">' + ing + '</div>' +
        '<div class="ract">' + (ready ? '<button class="btn small pink" id="craft' + i + '"' + (g.over ? ' disabled' : '') + '>만들기!</button>'
          : '<button class="btn small" id="swap' + i + '"' + (N.spare.length && g.clovers >= T.luck.swap && !g.over ? '' : ' disabled') + '>빠진 재료 채우기 ' + CLOVER + '' + T.luck.swap + '</button><small>' + (N.spare.length ? '남는 전설 ' + N.spare.length : '남는 전설 없음') + ' · 빠짐 ' + N.miss.length + '</small>') +
        '</div></div></div>';
    });
    h += '</div><p class="lmsg">' + (msg || '') + '</p><div class="row-btns"><button class="btn" id="resumeBtn">계속하기</button></div>';
    open(h);
    T.recipes.forEach((R, i) => {
      const box = $('rpor' + i);
      if (F.includes(i)) { const p = portrait(R.need[0], 46); p.className = 'myth-por'; box.appendChild(p); } else box.textContent = '?';
      btn('craft' + i, () => { const o = g.craft(i); if (o.ok) { close(); phase = 'play'; onEvents(); } else mythScreen(o.why); });
      btn('swap' + i, () => { const o = g.swapFor(i); if (!o.ok) S.play('nope'); onEventsSound(); mythScreen(o.ok ? '바꿨어요!' : o.why); });
    });
    btn('resumeBtn', () => { close(); phase = 'play'; });
  }
  // 멈춘 동안 생긴 사건: 소리만 내고 판 연출은 다시 시작할 때 (덮개 뒤라 안 보이므로)
  function onEventsSound() {
    for (const e of g.ev) { if (e.type === 'gamble') S.play(e.win ? 'luckwin' : 'lucklose'); if (e.type === 'swap') S.play('luckwin'); }
  }

  function start() {
    const seed = nextSeed || +Q.get('seed') || undefined;
    nextSeed = 0;
    g = new Core.Game({ seed, diff: diffSel });
    setBg(g.diff);
    view.an.clear(); txtAt.clear(); view.fx = []; view.texts = []; view.flyGhosts = []; view.cards = [];
    sel = -1; drag = null; hudCache.sb = null; hudCache.odds = null; hudCache.myth = null; infoKey = ''; view.warn = null; view.bigHit.clear(); lastInterest = 0;
    T.upgrade.base.forEach((_, i) => { $('up' + i).dataset.k = ''; });
    close();
    phase = 'play';
    acc = 0;
    toast(T.diffs[g.diff].name + ' — 소환을 눌러 친구를 불러요!');
    fit();
    if (!coach) coachStart();
  }

  // ── 눌림 피드백: 누르는 순간 살짝 눌리고 딸깍 (손가락이 많이 움직이면 취소) ──
  let pressEl = null, pressXY = null;
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest && ev.target.closest('button');
    if (!b || b.disabled) return;
    pressEl = b; pressXY = [ev.clientX, ev.clientY]; b.classList.add('pressed');
  }, true);
  const unpress = () => { if (pressEl) pressEl.classList.remove('pressed'); pressEl = null; };
  document.addEventListener('pointermove', (ev) => { if (pressEl && Math.hypot(ev.clientX - pressXY[0], ev.clientY - pressXY[1]) > 14) unpress(); }, true);
  document.addEventListener('pointerup', unpress, true);
  document.addEventListener('pointercancel', unpress, true);

  // ── 처음 1회 안내 — 조건을 채우면 다음 단계, 버튼 하나만 빛남. 판 입력은 막지 않음 ──
  let coach = null;
  const touchy = () => matchMedia && matchMedia('(pointer: coarse)').matches;
  function coachSteps() {
    const tap = touchy() ? '눌러' : '클릭(스페이스)해';
    return [
      { el: '#summonBtn', txt: '<b>소환</b> 버튼을 ' + tap + ' 친구를 불러요 (3번)', done: () => g.summons >= 3 },
      { el: '#boardWrap', txt: '<b>같은 친구 · 같은 등급</b> 둘을 끌어다 겹치면 한 등급 위로 <b>합성</b>!', done: () => (seen.merge || 0) >= 1, wait: 30 },
      { el: '#ups', txt: '동전이 모이면 <b>강화</b> — 그 등급 친구 모두 공격력 UP', done: () => g.lv.some((v) => v > 0), wait: 25 },
      { el: '.tools3', txt: '보스를 잡으면 <b>클로버</b>로 행운 소환 · 전설 셋은 <b>신화 레시피</b>로!', done: () => false, wait: 8 },
    ];
  }
  function coachStart() {
    if (rec().tut || Q.get('tut') === '0') return;
    coach = { i: -1, at: 0 };
    coachNext();
  }
  function coachEnd(done) {
    document.querySelectorAll('.coach-on').forEach((e) => e.classList.remove('coach-on'));
    $('coach').hidden = true;
    if (done) { const r = rec(); r.tut = 1; saveRec(r); }
    coach = null;
  }
  function coachNext() {
    document.querySelectorAll('.coach-on').forEach((e) => e.classList.remove('coach-on'));
    coach.i++; coach.at = view.t;
    const st = coachSteps()[coach.i];
    if (!st) { coachEnd(true); return; }
    const box = $('coach');
    box.innerHTML = '<span style="flex:1">' + st.txt + '</span><button class="btn sky small" id="coachSkip">' + (coach.i === 3 ? '알겠어요' : '건너뛰기') + '</button>';
    box.hidden = false;
    $('coachSkip').addEventListener('click', () => coachEnd(true));
    const el = document.querySelector(st.el);
    if (el && st.el !== '#boardWrap') el.classList.add('coach-on');
  }
  function coachTick() {
    if (!coach || phase !== 'play') return;
    const st = coachSteps()[coach.i];
    if (st && (st.done() || (st.wait && view.t - coach.at > st.wait))) coachNext();
  }

  // 로딩 화면: 그림 묶음(친구 → 괴물 → 판 타일)을 받을 때마다 막대가 참
  const TIPS = ['같은 친구 · 같은 등급 둘을 겹치면 한 등급 위로!', '장갑 괴물은 화상 · 독 · 관통(모몽가)에 약해요', '재생 괴물은 화상 · 독이 붙으면 회복을 멈춰요',
    '보스는 기술 전에 멈춰 서서 「준비」 해요', '전설 셋을 모으면 신화 레시피!', '웨이브가 넘어갈 때 동전 5% 이자를 받아요'];
  $('loadTip').textContent = '팁: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  function loadStep(k) { $('loadFill').style.width = Math.round(k * 100) + '%'; }
  loadStep(0.1);

  // ── 시작 ──────────────────────────────────────────────────
  const coinIcons = [$('coinIco'), document.querySelector('#summonBtn .cost canvas'), document.querySelector('#oddsBtn .tc canvas')];
  coinIcons.forEach((c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(A.coin, 0, 0); });
  buildUps();
  if (rec().mute) { const r = rec(); r.set = Object.assign({}, r.set, { sfx: false }); delete r.mute; saveRec(r); }   // 예전 기록(소리 끔) 옮기기
  applySettings();
  { const sp = settings().spd; if (sp > 0 && sp < speeds.length) { spd = sp; $('spdBtn').firstChild.textContent = '×' + speeds[spd]; } }
  if (speeds[0] !== 1) $('spdBtn').firstChild.textContent = '×' + speeds[0];
  A.loadChars(T.chars, () => { loadStep(0.5); MON.load(() => { loadStep(0.8); TIL.load(() => {
    loadStep(1);
    if (TIL.ready) { floorHi = TIL.floor(COLS, ROWS, TILE, 11); topHi = TIL.top(BW, PAD); }
    setTimeout(() => $('loading').classList.add('done'), 150);
    g = new Core.Game({ seed: 1 });   // 시작 화면 뒤에 빈 판을 보여 주려고
    fit();
    titleScreen();
    hudTick();
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fit(); });
  }); }); });

  // 확인용 (play_check.py 가 읽기만 함)
  CD.test = {
    phase: () => phase,
    state: () => (g ? g.state() : null),
    sel: () => sel,
    // 칸 i 가운데의 화면 좌표 (CSS px)
    slotPoint(i) {
      const r = cvs.getBoundingClientRect(), sl = g.slots[i];
      return { x: r.left + (sl.x / COLS) * r.width, y: r.top + ((sl.y * TILE + PAD) / BH) * r.height };
    },
    mates() { const o = []; g.slots.forEach((_, i) => { const j = g.mateOf(i); if (j > i) o.push([i, j]); }); return o; },
    px: PX,
    bannerAgo: () => view.t - bannerAt,
    boss: () => { const b = g && g.enemies.find((e) => e.kind === 'boss'); return b ? { hp: b.hp, max: b.max, x: b.x, y: b.y } : null; },
    upCost: (i) => g.upCost(i),
    tile: () => cvs.getBoundingClientRect().width / COLS,
    // 확인용(tools/play_check.py): 칸 i 에 친구를 바로 놓기 · 그 친구의 지금 몸짓(idle·attack·skill)
    put(i, ch, gr) { g.slots[i].u = g.newUnit(ch, gr || 0); g.emit('summon', { slot: i, ch, g: gr || 0, cost: 0 }); return true; },
    mode(i) { const u = g.slots[i] && g.slots[i].u; return u ? an(u).mode : null; },
    // v2 확인용: 판을 원하는 상황으로 (난이도 판 깨기를 기다리지 않고 보스·특성·신화 장면을 보려고)
    game: () => g,
    jumpWave(w) { g.wave = w - 1; g.tWave = 0.01; g.planWave(w); return true; },
    spawnTrait(t, n) { for (let k = 0; k < (n || 1); k++) g.spawn({ k: 'blob', t }, 1 + k * 0.6); return true; },
    spawnBoss(bt, at) { const w = (T.bosses.findIndex((b) => b.key === bt) + 1) * T.bossEvery; const keep = g.wave; g.wave = w; const e = g.spawn({ k: 'boss', t: null }, at || 2); g.wave = keep; e.bs.t = 1.5; return true; },
    monReady: () => MON.ready,
    seen: () => Object.assign({}, seen),
    clear() { g.enemies = []; g.spawnQ = []; return true; },
    // 친구 그림을 다 받았는지 · 칸 위 키(도트) · 맞은 자리 효과 · 감정 수
    charInfo(id) { const C = A.char[id]; return { real: C.real, idle: C.idle.length, attack: C.attack.length, skill: C.skill.length, shot: !!C.shot, fx: !!C.fx, hit: !!C.hit, emo: Object.keys(C.emo || {}).length, h: C.idle[0].h, k: C.idle[0].k || 1, portraitW: C.portrait.w }; },
  };
})();
