/* 화면 — 판 그리기 · 연출 · 입력 · 윗줄/판넬 · 덮개 화면.
   규칙은 core.js 가 정하고, 여기서는 g.ev 에 쌓인 사건을 꺼내 연출만 합니다.
   판은 「도트 좌표」(한 칸 = 32 도트)로 그리고 캔버스 변환으로 기기 픽셀에 맞춥니다. */
(function () {
  const CD = window.CD, T = window.CD_TABLE, Core = window.CD_CORE;
  const Q = new URLSearchParams(location.search);
  const A = CD.art.build(T);
  const S = CD.sfx;
  const TILE = A.TILE, COLS = T.board.cols, ROWS = T.board.rows;
  const BW = COLS * TILE, BH = ROWS * TILE;
  const $ = (id) => document.getElementById(id);
  const cvs = $('board'), ctx = cvs.getContext('2d');
  const STORE = 'ck-defense-v1';
  const GR = T.grades;
  const CH = {};
  T.chars.forEach((c) => (CH[c.id] = c));

  let g = null;
  let phase = 'title';          // title | play | pause | end
  let sel = -1, drag = null, hover = -1;
  let s = 1, dpr = 1;           // 도트 → 기기 픽셀 배율
  let speeds = T.speeds.slice();
  const qSpeed = +Q.get('speed');
  if (qSpeed > 0) speeds = [qSpeed].concat(speeds.filter((v) => v !== qSpeed));   // 확인용: ?speed=6
  let spd = 0;
  const view = { an: new Map(), fx: [], texts: [], shake: 0, t: 0, flyGhosts: [] };

  // ── 기록 (이 브라우저에만) ─────────────────────────────────
  function rec() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function saveRec(r) { try { localStorage.setItem(STORE, JSON.stringify(r)); } catch (e) { /* 사생활 보호 모드 등 — 기록만 못 남김 */ } }

  // ── 크기 맞추기 ───────────────────────────────────────────
  function fit() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const phone = innerWidth <= 760;
    const hud = document.querySelector('.hud').offsetHeight;
    const foot = document.querySelector('.fan').offsetHeight;
    let wAvail, hAvail;
    if (phone) {
      const panel = document.querySelector('.panel').offsetHeight;
      wAvail = innerWidth - 12 - 6;
      hAvail = innerHeight - hud - panel - foot - 6 - 5 * 3 - 6 - 6;
    } else {
      wAvail = Math.min(980, innerWidth - 16) - 300 - 10 - 8;
      hAvail = innerHeight - hud - foot - 8 - 4 - 6 * 2 - 8;
    }
    const tile = Math.max(30, Math.floor(Math.min(wAvail / COLS, hAvail / ROWS)));
    cvs.style.width = tile * COLS + 'px';
    cvs.style.height = tile * ROWS + 'px';
    cvs.width = Math.round(tile * COLS * dpr);
    cvs.height = Math.round(tile * ROWS * dpr);
    s = cvs.width / BW;
  }

  // ── 초상 (판넬 · 도감 · 시작 화면) ─────────────────────────
  function portrait(id, px, hop) {
    const c = document.createElement('canvas');
    const C = A.char[id];
    const k = Math.max(1, Math.floor((px * 2) / Math.max(C.w, C.h)));
    c.width = C.w * k + 4; c.height = C.h * k + 4;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(C.img, 2, 2, C.w * k, C.h * k);
    if (!C.real) label(x, C, (c.width) / 2, c.height / 2 + 1, k);
    if (hop) c.style.animationDelay = (-Math.random()).toFixed(2) + 's';
    return c;
  }
  function label(x, C, cx, cy, k) {
    x.save();
    x.font = Math.round(9 * k) + 'px Galmuri11, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = A.INK; x.fillText(C.label, cx, cy + 4 * k);
    x.restore();
  }

  // ── 연출 재료 ─────────────────────────────────────────────
  function an(u) {
    let a = view.an.get(u.id);
    if (!a) { a = { pop: 0, atk: 0, flash: 0, delay: 0, aim: 1, seed: (u.id * 0.618) % 1 }; view.an.set(u.id, a); }
    return a;
  }
  const slotXY = (i) => ({ x: g.slots[i].x * TILE, y: g.slots[i].y * TILE });
  function text(x, y, str, col, size, o) {
    if (view.texts.length > 70) view.texts.shift();
    view.texts.push(Object.assign({ x, y, str, col, size, t: 0, life: 0.8, vy: -16 }, o || {}));
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
  const HIT_SND = { chiikawa: 'hit', usagi: 'hit', rakko: 'thud', momonga: 'zap', furuhonya: 'book', kurimanju: 'hit' };
  const MON_COLS = ['#9d8cc6', '#7a68a6', '#ffd0dc', '#fff3b0', '#cfe7ff'];

  // ── 사건 → 연출 · 소리 ────────────────────────────────────
  function onEvents() {
    for (const e of g.ev) {
      switch (e.type) {
        case 'summon': {
          const u = g.slots[e.slot].u, a = an(u), p = slotXY(e.slot);
          a.pop = 1; a.flash = 0.8;
          view.fx.push({ type: 'pillar', x: p.x, y: p.y, col: GR[e.g].color, t: 0, life: 0.55 });
          sparks(p.x, p.y, GR[e.g].key, 6 + e.g * 4, 12);
          S.play('summon');
          if (e.g >= 1) { S.play(e.g >= 2 ? 'legend' : 'rare'); text(p.x, p.y - 18, GR[e.g].name + '!', GR[e.g].color, 9, { life: 1.1, vy: -10 }); }
          break;
        }
        case 'merge': {
          const u = g.slots[e.slot].u, a = an(u), p = slotXY(e.slot), q = slotXY(e.from);
          a.delay = 0.22; a.pop = 1; a.flash = 1;
          view.flyGhosts.push({ ch: e.was, g: e.g - 1, x0: q.x, y0: q.y, x1: p.x, y1: p.y, t: 0, life: 0.22 });
          view.fx.push({ type: 'ring', x: p.x, y: p.y, col: GR[e.g].color, r0: 4, r1: 30, t: -0.2, life: 0.45, w: 3 });
          view.fx.push({ type: 'ring', x: p.x, y: p.y, col: '#ffffff', r0: 2, r1: 20, t: -0.18, life: 0.3, w: 2 });
          setTimeout(() => sparks(p.x, p.y, GR[e.g].key, 8 + e.g * 5, 14), 200);
          text(p.x, p.y - 20, GR[e.g].name + ' ' + CH[e.ch].name + '!', GR[e.g].color, e.g >= 3 ? 10 : 8, { life: 1.3, vy: -9, delay: 0.22 });
          S.play('merge');
          if (e.g >= 3) { S.play('legend'); view.shake = 0.35; view.fx.push({ type: 'rays', x: p.x, y: p.y, col: GR[3].color, t: -0.2, life: 1.4 }); banner('전설 ' + CH[e.ch].name + '!', '합성 성공', 'legend'); }
          else if (e.g >= 2) S.play('rare');
          break;
        }
        case 'move': { const u = g.slots[e.slot].u; if (u) an(u).pop = 0.5; if (e.swap && g.slots[e.from].u) an(g.slots[e.from].u).pop = 0.5; S.play('pick'); break; }
        case 'sell': {
          const p = slotXY(e.slot);
          parts(p.x, p.y, ['#fff6e3', '#ffe08a', CH[e.ch].color], 10, 26);
          text(p.x, p.y - 8, '+' + e.coins, '#ffd54a', 9, { coin: true });
          S.play('sell');
          break;
        }
        case 'upgrade': {
          g.slots.forEach((sl, i) => { if (sl.u && sl.u.g === e.g) { an(sl.u).flash = 0.9; const p = slotXY(i); sparks(p.x, p.y, GR[e.g].key, 3, 8); } });
          toast(GR[e.g].name + ' 강화 ' + e.lv + '단계 — 공격력 +' + Math.round(T.upgrade.dmg * e.lv * 100) + '%');
          S.play('up');
          break;
        }
        case 'fire': { const u = g.slots[e.slot].u; if (u) { const a = an(u); a.atk = 1; a.aim = u.aim; } break; }
        case 'hit': {
          const X = e.x * TILE, Y = e.y * TILE - 12;
          if (e.kind === 'dot') { if (Math.random() < 0.3) text(X + 4, Y, fmt(e.dmg), '#ff9a4a', 6, { life: 0.5 }); break; }
          if (e.crit) { text(X, Y - 3, '치명! ' + fmt(e.dmg), '#ff5a5a', 10, { life: 0.9, vy: -22, pop: 1 }); S.play('crit'); }
          else if (e.kind !== 'splash' && e.kind !== 'burn') { text(X + (Math.random() - 0.5) * 6, Y, fmt(e.dmg), '#ffffff', 7); S.play(HIT_SND[e.ch] || 'hit'); }
          else text(X + (Math.random() - 0.5) * 8, Y, fmt(e.dmg), e.kind === 'burn' ? '#ffb27a' : '#cfe7ff', 6, { life: 0.6 });
          if (e.ch === 'rakko') view.fx.push({ type: 'ring', x: X, y: Y + 10, col: '#ffffff', r0: 2, r1: 9, t: 0, life: 0.2, w: 2 });
          break;
        }
        case 'splash': {
          const X = e.x * TILE, Y = e.y * TILE;
          const col = e.ch === 'shisa' ? '#ff8a3d' : '#8fc2f2';
          view.fx.push({ type: 'ring', x: X, y: Y, col, r0: 3, r1: e.r * TILE, t: 0, life: 0.3, w: 3, fill: e.ch === 'shisa' ? 'rgba(255,170,90,.25)' : 'rgba(160,210,255,.28)' });
          parts(X, Y, e.ch === 'shisa' ? ['#ffd36a', '#ff8a3d', '#e2522b'] : ['#ffffff', '#bfe2ff', '#8fc2f2'], 6, 34);
          S.play(e.ch === 'shisa' ? 'fire' : 'splash');
          break;
        }
        case 'kill': {
          const X = e.x * TILE, Y = e.y * TILE;
          parts(X, Y - 4, MON_COLS, e.kind === 'boss' ? 40 : 9, e.kind === 'boss' ? 60 : 30);
          view.fx.push({ type: 'poof', x: X, y: Y - 4, t: 0, life: 0.3, r: e.kind === 'boss' ? 26 : 10 });
          text(X, Y - 14, '+' + e.coins, '#ffd54a', e.kind === 'boss' ? 11 : 7, { coin: true, life: 0.9, vy: -14 });
          S.play('pop'); S.play('coin');
          if (e.kind === 'boss') { view.shake = 0.4; banner('키메라 토벌!', '+' + e.coins + ' 동전', 'boss'); }
          break;
        }
        case 'wave':
          if (e.last) banner('마지막 웨이브!', '보스를 ' + T.finalTime + '초 안에', 'boss');
          else if (e.boss) banner('보스 웨이브 ' + e.n, '키메라가 와요!', 'boss');
          else banner('웨이브 ' + e.n);
          S.play('wave');
          break;
        case 'boss': S.play('boss'); view.shake = 0.3; break;
        case 'end': setTimeout(() => endScreen(e), e.win ? 600 : 900); S.play(e.win ? 'win' : 'lose'); phase = 'end'; break;
      }
    }
    g.ev.length = 0;
  }

  // ── 그리기 ────────────────────────────────────────────────
  function drawChar(x, id, cx, by, o) {
    // cx = 가운데, by = 발 위치. o: sx, sy(늘임) · rot · alpha · flash(0..1) · glow(색) · h(키)
    const C = A.char[id];
    const H = o.h || 26;
    const sc = Math.min(H / C.h, (H + 2) / C.w);
    const k = Math.min(8, Math.max(1, Math.ceil(sc * s)));
    const img = A.big(C.img, k);
    const w = C.w * sc, h = C.h * sc;
    x.save();
    x.translate(cx, by);
    if (o.rot) x.rotate(o.rot);
    x.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null) x.globalAlpha = o.alpha;
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (o.glow) {
      const sil = A.big(A.silhouette(C.img, o.glow), k);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(sil, -w / 2 + dx, -h + dy, w, h);
    }
    x.drawImage(img, -w / 2, -h, w, h);
    if (!C.real) { x.save(); x.font = '9px Galmuri11, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = A.INK; x.fillText(C.label, 0, -h / 2 + 3); x.restore(); }
    if (o.flash > 0) {
      x.globalAlpha = (o.alpha == null ? 1 : o.alpha) * Math.min(1, o.flash);
      x.drawImage(A.big(A.silhouette(C.img, '#ffffff'), k), -w / 2, -h, w, h);
    }
    x.restore();
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
    if (!u) return;
    const a = an(u), gr = GR[u.g];
    // 등급 방석
    x.save();
    x.fillStyle = gr.glow; A.roundRect(x, X + 3, Y + 4, TILE - 6, TILE - 8, 6); x.fill();
    x.lineWidth = 2; x.strokeStyle = gr.color; A.roundRect(x, X + 4, Y + 5, TILE - 8, TILE - 10, 5); x.stroke();
    if (u.g >= 2) { // 영웅 이상: 은은히 숨 쉬는 빛
      x.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3 + a.seed * 6);
      x.fillStyle = gr.color; A.roundRect(x, X + 3, Y + 4, TILE - 6, TILE - 8, 6); x.fill();
    }
    x.restore();
    if (u.g >= 3) { // 전설: 도는 빛줄기
      x.save(); x.translate(X + 16, Y + 15); x.rotate(t * 0.8);
      x.globalAlpha = 0.35; x.fillStyle = '#fff3b0';
      for (let k = 0; k < 6; k++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(-2.5, -15); x.lineTo(2.5, -15); x.closePath(); x.fill(); }
      x.restore();
    }
    if (dragging && drag.from === i) { drawChar(x, u.ch, X + 16, Y + 28, { alpha: 0.3, h: 25 }); return; }
    if (a.delay > 0) return;
    // 몸짓: 숨쉬기 + 쏠 때 움찔 + 나타날 때 통통
    const bob = Math.sin(t * 3.2 + a.seed * 6.28);
    const atk = a.atk;
    let sx = 1 + bob * 0.025 + atk * 0.1, sy = 1 - bob * 0.025 - atk * 0.12;
    if (a.pop > 0) { const p = 1 - a.pop; const e = p < 0.6 ? p / 0.6 * 1.18 : 1.18 - (p - 0.6) / 0.4 * 0.18; sx *= e; sy *= e; }
    const lean = atk * 0.12 * (a.aim || 1);
    const glow = sel === i ? '#ffffff' : u.g >= 1 ? gr.color : null;
    drawChar(x, u.ch, X + 16 + atk * 1.5 * (a.aim || 1), Y + 28, { sx, sy, rot: lean, flash: a.flash, glow, h: 25 });
    // 등급 보석
    const n = u.g + 1;
    for (let k = 0; k < n; k++) gem(x, X + 16 - (n - 1) * 3 + k * 6, Y + 29, gr.color);
    // 합성할 짝이 있으면 초록 화살표
    if (g.mateOf(i) >= 0 && !dragging) {
      const yy = Y + 4 + Math.round(Math.sin(t * 6) * 1.2);
      x.fillStyle = A.INK; x.fillRect(X + 24, yy, 5, 2); x.fillRect(X + 25, yy - 1, 3, 1); x.fillRect(X + 26, yy - 2, 1, 1); x.fillRect(X + 25, yy + 2, 3, 3);
      x.fillStyle = '#7ddc6a'; x.fillRect(X + 25, yy, 3, 1); x.fillRect(X + 26, yy - 1, 1, 1); x.fillRect(X + 26, yy + 1, 1, 3);
    }
  }
  function drawEnemy(x, e, t) {
    const fr = Math.floor(t * 4 + e.id * 0.37) % 2;
    let spr = e.kind === 'boss' ? A.enemy.boss[Math.max(0, Math.floor(e.wave / T.bossEvery) - 1) % 4][fr] : A.enemy[e.kind][fr];
    const X = e.x * TILE, Y = e.y * TILE;
    const w = spr.width, h = spr.height;
    const by = Y + (e.kind === 'boss' ? 14 : 9);
    // 그림자
    x.fillStyle = 'rgba(74,53,48,.18)';
    x.beginPath(); x.ellipse(X, by, w * 0.32, 2.5, 0, 0, Math.PI * 2); x.fill();
    x.save();
    x.translate(Math.round(X), Math.round(by));
    if (e.dir === 2) x.scale(-1, 1);
    x.imageSmoothingEnabled = false;
    const hop = e.kind === 'fast' ? -Math.abs(Math.sin(t * 9 + e.id)) * 2 : 0;
    x.drawImage(spr, -Math.round(w / 2), -h + hop);
    if (e.hitT > 0.04) x.drawImage(A.flashOf(spr), -Math.round(w / 2), -h + hop);
    if (e.slowT > 0) { x.globalAlpha = 0.4; x.drawImage(A.silhouette(spr, '#9fd3ff'), -Math.round(w / 2), -h + hop); x.globalAlpha = 1; }
    x.restore();
    // 상태 표시
    if (e.slowT > 0) { x.fillStyle = '#ffffff'; x.fillRect(X - w / 2 + 2, by - h + 6, 1, 1); x.fillRect(X + w / 2 - 4, by - 6, 1, 1); }
    if (e.burnT > 0) {
      const f = Math.floor(t * 12) % 2;
      x.fillStyle = '#ff8a3d'; x.fillRect(X - 3, by - h - 1 - f, 2, 2); x.fillRect(X + 2, by - h + f, 2, 2);
      x.fillStyle = '#ffd36a'; x.fillRect(X - 3, by - h - f, 1, 1); x.fillRect(X + 2, by - h + 1 + f, 1, 1);
    }
    if (e.vulnT > 0) { const yy = by - h - 4; x.fillStyle = A.INK; x.fillRect(X + w / 2 - 6, yy, 5, 3); x.fillStyle = '#c46a4c'; x.fillRect(X + w / 2 - 5, yy + 1, 3, 1); }
    // 체력 막대
    const bw = e.kind === 'boss' ? 36 : 16, bx = Math.round(X - bw / 2), byy = Math.round(by - h - 3);
    if (e.hp < e.max || e.kind === 'boss') {
      const k = Math.max(0, e.hp / e.max);
      x.fillStyle = A.INK; x.fillRect(bx - 1, byy - 1, bw + 2, 4);
      x.fillStyle = '#fff6e3'; x.fillRect(bx, byy, bw, 2);
      x.fillStyle = k > 0.5 ? '#7ddc6a' : k > 0.25 ? '#ffc94a' : '#ff6a6a'; x.fillRect(bx, byy, Math.ceil(bw * k), 2);
    }
  }
  function drawProj(x, p, t) {
    const img = A.shot[p.ch];
    const X = p.x * TILE, Y = p.y * TILE - 6;
    if (p.ch === 'momonga' && p.hop > 0) {
      x.save(); x.strokeStyle = 'rgba(191,226,255,.9)'; x.lineWidth = 1.5; x.beginPath();
      const sx = p.sx * TILE, sy = p.sy * TILE - 6;
      x.moveTo(sx, sy); x.lineTo((sx + X) / 2 + (Math.random() - 0.5) * 4, (sy + Y) / 2 + (Math.random() - 0.5) * 4); x.lineTo(X, Y); x.stroke(); x.restore();
    }
    x.save(); x.translate(X, Y);
    const dx = p.tx - p.x, dy = p.ty - p.y;
    if (p.ch === 'usagi' || p.ch === 'hachiware') x.rotate(Math.atan2(dy, dx) + (p.ch === 'usagi' ? Math.PI / 4 : Math.PI / 2 + Math.PI));
    else if (p.ch === 'rakko' || p.ch === 'kurimanju' || p.ch === 'furuhonya' || p.ch === 'chiikawa') x.rotate(t * 12);
    const k = p.g >= 2 ? 1.3 : 1;
    x.imageSmoothingEnabled = false;
    x.drawImage(img, (-img.width / 2) * k, (-img.height / 2) * k, img.width * k, img.height * k);
    x.restore();
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
      case 'rays':
        x.translate(f.x, f.y); x.rotate(f.t * 2); x.globalAlpha = 0.6 * (1 - k); x.fillStyle = f.col;
        for (let i = 0; i < 10; i++) { x.rotate(Math.PI / 5); x.beginPath(); x.moveTo(0, 0); x.lineTo(-3, -48); x.lineTo(3, -48); x.closePath(); x.fill(); }
        break;
    }
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
    const w = 110, X = (BW - w) / 2, Y = TILE + 3;
    x.save();
    x.fillStyle = A.INK; A.roundRect(x, X - 3, Y - 2, w + 6, 13, 4); x.fill();
    x.fillStyle = '#fff6e3'; x.fillRect(X, Y + 5, w, 4);
    x.fillStyle = '#ff6a8a'; x.fillRect(X, Y + 5, Math.ceil(w * Math.max(0, b.hp / b.max)), 4);
    x.font = '6px Galmuri11, sans-serif'; x.fillStyle = '#ffffff'; x.textBaseline = 'top';
    x.fillText(T.enemy.kinds.boss.name + ' ' + fmt(Math.max(0, b.hp)), X, Y - 1);
    if (g.wave >= T.waves) { x.textAlign = 'right'; x.fillStyle = '#ffd0dc'; x.fillText(Math.ceil(Math.max(0, g.tWave)) + '초', X + w, Y - 1); }
    x.restore();
  }
  function render() {
    const t = view.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#c9e5a6'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    const sh = view.shake > 0 ? view.shake * 6 * s : 0;
    ctx.setTransform(s, 0, 0, s, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(A.floor, 0, 0);
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
      drawChar(ctx, f.ch, f.x0 + (f.x1 - f.x0) * e, f.y0 + 12 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 10, { h: 25, flash: k, alpha: 1 });
    }
    const es = g.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of es) drawEnemy(ctx, e, t);
    for (const p of g.proj) drawProj(ctx, p, t);
    for (const f of view.fx) drawFx(ctx, f);
    if (drag && drag.moved) {
      const u = g.slots[drag.from].u;
      if (u) drawChar(ctx, u.ch, drag.ax, drag.ay + 14, { h: 30, sx: 1.05, sy: 1.05, glow: GR[u.g].color });
    }
    drawBossBar(ctx);
    drawTexts(ctx);
  }

  // ── 시간 ──────────────────────────────────────────────────
  let lastT = 0, acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    view.t += dt;
    if (g && phase === 'play') {
      acc += dt * speeds[spd];
      let n = 0;
      while (acc >= STEP && n < 60) { g.step(STEP); acc -= STEP; n++; }
      if (n >= 60) acc = 0;
      onEvents();
    }
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
    }
    for (const f of view.fx) {
      f.t += dt;
      if (f.type === 'part' || f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 70 * dt; f.vx *= 0.96; }
    }
    view.fx = view.fx.filter((f) => f.t < f.life);
    for (const tx of view.texts) { if (tx.delay > 0) { tx.delay -= dt; tx.t = -1; continue; } tx.t = Math.max(0, tx.t) + dt; tx.y += tx.vy * dt; tx.vy *= 0.92; }
    view.texts = view.texts.filter((tx) => tx.t < tx.life);
    for (const f of view.flyGhosts) f.t += dt;
    view.flyGhosts = view.flyGhosts.filter((f) => f.t < f.life);
  }

  // ── 윗줄 · 판넬 ──────────────────────────────────────────
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function hudTick() {
    if (!g) return;
    setText('waveTxt', g.wave ? '웨이브 ' + g.wave + '/' + T.waves : '준비');
    const last = g.wave >= T.waves;
    setText('waveT', g.over ? '' : last ? '남은 ' + Math.ceil(Math.max(0, g.tWave)) + '초' : '다음 ' + Math.ceil(Math.max(0, g.tWave)) + '초');
    const load = g.load(), k = Math.min(1, load / T.cap);
    const lb = $('loadBar'); const wpct = Math.round(k * 100) + '%';
    if (hudCache.lb !== wpct) { hudCache.lb = wpct; lb.style.width = wpct; }
    setText('loadTxt', '괴물 ' + load + '/' + T.cap);
    const cls = 'pill load' + (k >= 0.75 ? ' hot' : k >= 0.5 ? ' warn' : '');
    if (hudCache.lc !== cls) { hudCache.lc = cls; $('loadBox').className = cls; }
    setText('coinTxt', String(g.coins));
    setText('costTxt', String(g.cost()));
    const canSum = !g.over && g.coins >= g.cost() && g.empty().length > 0;
    const sb = $('summonBtn');
    if (hudCache.sb !== canSum) { hudCache.sb = canSum; sb.classList.toggle('pulse', canSum && g.empty().length > 0); sb.setAttribute('aria-disabled', String(!canSum)); sb.style.filter = canSum ? '' : 'grayscale(.6)'; sb.style.opacity = canSum ? '' : '.7'; }
    GR.forEach((gr, i) => {
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
      const b = document.createElement('button');
      b.className = 'up'; b.id = 'up' + i; b.style.setProperty('--c', gr.color);
      b.setAttribute('aria-label', gr.name + ' 등급 강화');
      b.innerHTML = '<b>' + gr.name + ' <i>Lv0</i></b><span></span>';
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
    const key = u ? [sel, u.id, mate >= 0, g.lv[u.g], g.over].join('|') : 'none|' + (g.wave > 0);
    if (key === infoKey) return;
    infoKey = key;
    const box = $('info');
    box.innerHTML = '';
    if (!u) {
      const d = document.createElement('div'); d.className = 'hint';
      d.innerHTML = g.wave > 0
        ? '캐릭터를 <b>눌러</b> 정보 보기 · <b>같은 캐릭터 · 같은 등급</b>끼리 <b>끌어다 놓으면</b> 한 등급 위 무작위 친구로 합성!'
        : '<b>소환</b>을 눌러 친구를 불러요. 괴물이 길을 돌면 자동으로 공격해요. 길 위 괴물이 ' + T.cap + '마리가 되면 져요.';
      box.appendChild(d);
      return;
    }
    const c = CH[u.ch], gr = GR[u.g];
    const por = portrait(u.ch, 24); por.className = 'por'; por.style.borderColor = gr.color; por.style.background = gr.glow;
    box.appendChild(por);
    const tx = document.createElement('div'); tx.className = 'txt';
    const dmg = g.unitDmg(u), rate = g.unitRate(u), rng = g.unitRange(u);
    tx.innerHTML = '<div class="nm">' + c.name + ' <span class="gr" style="background:' + gr.color + '">' + gr.name + '</span></div>' +
      '<div class="ds">' + c.desc + '<br>공격 ' + fmt(dmg) + ' · 1초에 ' + rate.toFixed(1) + '번 · 사거리 ' + rng.toFixed(1) + '칸</div>';
    box.appendChild(tx);
    const acts = document.createElement('div'); acts.className = 'acts';
    if (u.g < GR.length - 1) {
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

  let toastT = 0;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1700);
  }
  function banner(big, small, cls) {
    const el = $('banner');
    el.className = ''; void el.offsetWidth;
    el.innerHTML = '';
    el.appendChild(document.createTextNode(big));
    if (small) { const sm = document.createElement('small'); sm.textContent = small; el.appendChild(sm); }
    el.className = 'go' + (cls === 'boss' ? ' boss' : '');
  }

  // ── 입력: 누르기 = 고르기, 끌기 = 옮기기 · 합성 ─────────────
  function toArt(ev) {
    const r = cvs.getBoundingClientRect();
    return { ax: ((ev.clientX - r.left) / r.width) * BW, ay: ((ev.clientY - r.top) / r.height) * BH };
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
  $('spdBtn').addEventListener('click', () => { spd = (spd + 1) % speeds.length; $('spdBtn').textContent = '×' + speeds[spd]; });
  $('sndBtn').addEventListener('click', () => { S.on = !S.on; $('sndBtn').setAttribute('aria-pressed', String(S.on)); const r = rec(); r.mute = !S.on; saveRec(r); });
  $('pauseBtn').addEventListener('click', () => { if (phase === 'play') pauseScreen(); });
  $('codexBtn2').addEventListener('click', () => { if (phase === 'play') { phase = 'pause'; } codexScreen(true); });
  document.addEventListener('keydown', (ev) => {
    if (phase !== 'play' || ev.repeat) return;
    if (ev.key === ' ' || ev.key === 's' || ev.key === 'S') { ev.preventDefault(); $('summonBtn').click(); }
    else if (ev.key === 'Escape') sel = -1;
    else if (ev.key === 'p' || ev.key === 'P') pauseScreen();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') pauseScreen(); });
  addEventListener('resize', () => { fit(); });

  // ── 덮개 화면 ─────────────────────────────────────────────
  const ov = $('ov'), sheet = $('sheet');
  function open(html) { sheet.innerHTML = html; ov.hidden = false; sheet.scrollTop = 0; }
  function close() { ov.hidden = true; }
  function parade(box, ids) { ids.forEach((id) => box.appendChild(portrait(id, 23, true))); }
  function btn(id, fn) { const b = sheet.querySelector('#' + id); if (b) b.addEventListener('click', () => { S.unlock(); fn(); }); }

  function titleScreen() {
    phase = 'title';
    const r = rec();
    open(
      '<h1>치이카와 <em>랜덤</em> 디펜스</h1>' +
      '<div class="sub">들판 토벌대 · 비영리 팬 게임</div>' +
      '<div class="parade" id="parade"></div>' +
      '<div class="rules"><ol>' +
      '<li><b>소환</b>하면 무작위 친구가 무작위 등급으로 자리에 나와요.</li>' +
      '<li>길을 도는 괴물을 알아서 공격해요. 잡으면 <b>동전</b>.</li>' +
      '<li><b>같은 캐릭터 · 같은 등급</b> 둘을 끌어다 겹치면 한 등급 위 무작위 친구로 <b>합성</b>!</li>' +
      '<li>길 위 괴물이 <b>' + T.cap + '</b>마리가 되면 패배. <b>' + T.waves + '웨이브</b> 마지막 보스를 잡으면 클리어.</li>' +
      '</ol></div>' +
      '<div class="row-btns"><button class="btn" id="startBtn">시작하기</button><button class="btn sky" id="codexBtn">도감 · 규칙</button></div>' +
      '<div class="rec">' + (r.plays ? '최고 웨이브 ' + (r.best || 0) + ' · 클리어 ' + (r.clears || 0) + '번 · ' + r.plays + '판' : '첫 판이에요!') + '</div>'
    );
    parade($('parade'), T.chars.map((c) => c.id));
    btn('startBtn', start);
    btn('codexBtn', () => codexScreen(false));
  }
  function codexScreen(inGame) {
    const odds = T.summonOdds;
    let rows = '';
    GR.forEach((gr, i) => {
      rows += '<tr><td><span class="gname" style="background:' + gr.color + '">' + gr.name + '</span></td><td>×' + gr.dmg + '</td><td>' + (odds[i] ? Math.round(odds[i] * 1000) / 10 + '%' : '합성만') + '</td><td>' + T.sell[i] + '</td></tr>';
    });
    open(
      '<h2>도감 · 규칙</h2>' +
      '<div class="codex" id="codex"></div>' +
      '<table class="grades"><tr><th>등급</th><th>공격력</th><th>소환 확률</th><th>팔면</th></tr>' + rows + '</table>' +
      '<p class="sub">강화는 등급마다 따로 — 한 단계에 그 등급 친구 모두 공격력 +' + Math.round(T.upgrade.dmg * 100) + '%. 합성하면 캐릭터가 무작위로 바뀌니까 등급에 붙여 뒀어요.<br>' +
      '보스 「' + T.enemy.kinds.boss.name + '」 는 ' + T.bossEvery + '웨이브마다 와요. 길 위에선 괴물 ' + T.bossWeight + '마리로 세요.<br>' +
      '데스크톱: 스페이스 = 소환 · P = 멈춤 · Esc = 고르기 취소</p>' +
      '<div class="row-btns"><button class="btn" id="backBtn">' + (inGame ? '계속하기' : '돌아가기') + '</button></div>'
    );
    const box = $('codex');
    T.chars.forEach((c) => {
      const d = document.createElement('div');
      d.appendChild(portrait(c.id, 20));
      const t = document.createElement('div');
      t.innerHTML = '<b>' + c.name + '</b><span>' + c.desc + '<br>사거리 ' + c.range + '칸</span>';
      d.appendChild(t); box.appendChild(d);
    });
    btn('backBtn', () => { if (inGame) { close(); phase = 'play'; } else titleScreen(); });
  }
  function pauseScreen() {
    phase = 'pause';
    open('<h2>잠깐 쉬어요</h2><p class="sub">웨이브 ' + g.wave + ' · 동전 ' + g.coins + '</p>' +
      '<div class="row-btns"><button class="btn" id="resumeBtn">계속하기</button><button class="btn sky" id="codexBtn">도감</button><button class="btn pink" id="quitBtn">처음으로</button></div>');
    btn('resumeBtn', () => { close(); phase = 'play'; });
    btn('codexBtn', () => codexScreen(true));
    btn('quitBtn', titleScreen);
  }
  function endScreen(e) {
    const r = rec();
    r.plays = (r.plays || 0) + 1;
    r.best = Math.max(r.best || 0, e.wave);
    if (e.win) { r.clears = (r.clears || 0) + 1; r.bestTime = Math.min(r.bestTime || 1e9, Math.round(g.time)); }
    saveRec(r);
    const m = Math.floor(g.time / 60), sec = Math.round(g.time % 60);
    open(
      (e.win ? '<h1>클리어!</h1><div class="sub">들판에 평화가 왔어요</div>' : '<h1>패배…</h1><div class="sub">' + e.why + '</div>') +
      '<div class="parade" id="parade"></div>' +
      '<div class="stats">' +
      '<div><b>' + e.wave + '/' + T.waves + '</b><span>웨이브</span></div>' +
      '<div><b>' + g.kills + '</b><span>토벌한 괴물</span></div>' +
      '<div><b>' + m + '분 ' + sec + '초</b><span>버틴 시간</span></div>' +
      '<div><b style="color:' + (g.bestGrade >= 0 ? GR[g.bestGrade].color : 'inherit') + '">' + (g.bestGrade >= 0 ? GR[g.bestGrade].name : '-') + '</b><span>최고 등급</span></div>' +
      '</div>' +
      '<div class="rec">최고 웨이브 ' + r.best + ' · 클리어 ' + (r.clears || 0) + '번</div>' +
      '<div class="row-btns"><button class="btn" id="againBtn">다시 하기</button><button class="btn sky" id="homeBtn">처음으로</button></div>'
    );
    // 판에 남은 친구들
    const ids = [];
    g.slots.forEach((sl) => { if (sl.u && ids.length < 8) ids.push(sl.u.ch); });
    parade($('parade'), ids.length ? ids : ['chiikawa', 'hachiware', 'usagi']);
    btn('againBtn', start);
    btn('homeBtn', titleScreen);
  }

  function start() {
    const seed = +Q.get('seed') || undefined;
    g = new Core.Game({ seed });
    view.an.clear(); view.fx = []; view.texts = []; view.flyGhosts = [];
    sel = -1; drag = null; hudCache.sb = null; infoKey = '';
    GR.forEach((_, i) => { $('up' + i).dataset.k = ''; });
    close();
    phase = 'play';
    acc = 0;
    toast('소환을 눌러 친구를 불러요!');
  }

  // ── 시작 ──────────────────────────────────────────────────
  const coinIcons = [$('coinIco'), document.querySelector('#summonBtn .cost canvas')];
  coinIcons.forEach((c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(A.coin, 0, 0); });
  buildUps();
  if (rec().mute) { S.on = false; $('sndBtn').setAttribute('aria-pressed', 'false'); }
  if (speeds[0] !== 1) $('spdBtn').textContent = '×' + speeds[0];
  A.loadChars(T.chars, () => {
    g = new Core.Game({ seed: 1 });   // 시작 화면 뒤에 빈 판을 보여 주려고
    fit();
    titleScreen();
    hudTick();
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fit(); });
  });

  // 확인용 (play_check.py 가 읽기만 함)
  CD.test = {
    phase: () => phase,
    state: () => (g ? g.state() : null),
    sel: () => sel,
    // 칸 i 가운데의 화면 좌표 (CSS px)
    slotPoint(i) {
      const r = cvs.getBoundingClientRect(), sl = g.slots[i];
      return { x: r.left + (sl.x / COLS) * r.width, y: r.top + (sl.y / ROWS) * r.height };
    },
    mates() { const o = []; g.slots.forEach((_, i) => { const j = g.mateOf(i); if (j > i) o.push([i, j]); }); return o; },
  };
})();
