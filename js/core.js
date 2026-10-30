/* 게임 규칙 — 화면(DOM·캔버스)을 전혀 모릅니다. 그래서 node 에서도 그대로 돌아가고(tools/sim.js 균형 확인),
   화면은 g.ev 에 쌓인 사건(소환·합성·명중·처치…)만 꺼내 연출합니다.
   좌표는 전부 「칸」 단위. 판 가장자리 한 바퀴의 칸 가운데를 잇는 선이 괴물 길입니다. */
(function (root) {
  const T = root.CD_TABLE || (typeof require !== 'undefined' ? require('./table.js') : null);

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 길: 왼쪽 위 칸 가운데에서 시작해 시계 방향으로 한 바퀴
  function makePath(cols, rows) {
    const a = 0.5, r = cols - 0.5, b = rows - 0.5;
    const pts = [[a, a], [r, a], [r, b], [a, b], [a, a]];
    const segs = [];
    let len = 0;
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const l = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      segs.push({ x0, y0, x1, y1, l, s: len });
      len += l;
    }
    return {
      len, segs,
      at(d) {
        d = ((d % len) + len) % len;
        for (const s of segs) {
          if (d <= s.s + s.l) {
            const k = (d - s.s) / s.l;
            return { x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, dir: s.x1 > s.x0 ? 0 : s.y1 > s.y0 ? 1 : s.x1 < s.x0 ? 2 : 3 };
          }
        }
        return { x: a, y: a, dir: 0 };
      },
    };
  }

  function Game(opt) {
    opt = opt || {};
    this.T = T;
    this.rand = rng(opt.seed || (Date.now() & 0xffffff));
    const { cols, rows } = T.board;
    this.cols = cols; this.rows = rows;
    this.path = makePath(cols, rows);
    this.slots = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) this.slots.push({ x: x + 0.5, y: y + 0.5, u: null });
    this.charIdx = {};
    T.chars.forEach((c, i) => (this.charIdx[c.id] = i));
    this.lv = T.grades.map(() => 0);   // 등급별 강화 단계
    this.coins = T.startCoins;
    this.summons = 0;
    this.wave = 0;
    this.tWave = 2.5;       // 첫 웨이브까지 숨 돌릴 틈
    this.time = 0;
    this.enemies = [];
    this.proj = [];
    this.spawnQ = [];
    this.spawnT = 0;
    this.nextId = 1;
    this.over = null;       // null | 'win' | 'lose'
    this.won = false;
    this.loseWhy = '';
    this.kills = 0;
    this.bestGrade = -1;
    this.ev = [];
  }
  const G = Game.prototype;

  G.emit = function (type, o) { o = o || {}; o.type = type; this.ev.push(o); };
  G.char = function (id) { return T.chars[this.charIdx[id]]; };
  G.cost = function () { return T.summonCost + T.summonStep * this.summons; };
  G.upCost = function (g) { return this.lv[g] >= T.upgrade.max ? Infinity : T.upgrade.base[g] + T.upgrade.step[g] * this.lv[g]; };
  G.empty = function () { const o = []; this.slots.forEach((s, i) => { if (!s.u) o.push(i); }); return o; };
  G.load = function () {
    let n = 0;
    for (const e of this.enemies) n += e.kind === 'boss' ? T.bossWeight : 1;
    return n;
  };
  G.isBossWave = function (w) { return w % T.bossEvery === 0; };

  G.pick = function (arr) { return arr[Math.floor(this.rand() * arr.length)]; };
  G.newUnit = function (ch, g) {
    if (g > this.bestGrade) this.bestGrade = g;
    return { id: this.nextId++, ch, g, cd: 0.3 + this.rand() * 0.4, aim: 1, n: 0, haste: 0, hasteT: 0, hasteX: 0 };
  };

  // ── 사람이 하는 일 ───────────────────────────────────────
  G.summon = function () {
    if (this.over) return { ok: false, why: '끝난 판' };
    const cost = this.cost();
    if (this.coins < cost) return { ok: false, why: '동전이 모자라요' };
    const free = this.empty();
    if (!free.length) return { ok: false, why: '자리가 꽉 찼어요 — 합성하거나 팔아 주세요' };
    this.coins -= cost;
    this.summons++;
    let r = this.rand(), g = 0;
    for (let i = 0; i < T.summonOdds.length; i++) { if (r < T.summonOdds[i]) { g = i; break; } r -= T.summonOdds[i]; }
    const ch = this.pick(T.chars).id;
    const slot = this.pick(free);
    this.slots[slot].u = this.newUnit(ch, g);
    this.emit('summon', { slot, ch, g, cost });
    return { ok: true, slot };
  };

  G.canMerge = function (a, b) {
    const A = this.slots[a] && this.slots[a].u, B = this.slots[b] && this.slots[b].u;
    return !!(A && B && a !== b && A.ch === B.ch && A.g === B.g && A.g < T.grades.length - 1);
  };
  // 같은 캐릭터·같은 등급 둘 → 한 등급 위 무작위 캐릭터 (b 자리에)
  G.merge = function (a, b) {
    if (this.over || !this.canMerge(a, b)) return { ok: false, why: '같은 캐릭터 · 같은 등급끼리만 합칠 수 있어요' };
    const g = this.slots[b].u.g + 1, from = this.slots[a].u.ch;
    this.slots[a].u = null;
    const ch = this.pick(T.chars).id;
    this.slots[b].u = this.newUnit(ch, g);
    this.emit('merge', { from: a, slot: b, ch, g, was: from });
    return { ok: true, slot: b };
  };
  G.mateOf = function (a) {
    const A = this.slots[a] && this.slots[a].u;
    if (!A || A.g >= T.grades.length - 1) return -1;
    for (let i = 0; i < this.slots.length; i++) if (i !== a && this.canMerge(a, i)) return i;
    return -1;
  };
  // 끌어다 놓기: 빈칸이면 옮김, 짝이면 합성, 아니면 자리 바꿈
  G.drop = function (a, b) {
    if (this.over || a === b || !this.slots[a] || !this.slots[b] || !this.slots[a].u) return { ok: false };
    if (this.canMerge(a, b)) return this.merge(a, b);
    const t = this.slots[b].u;
    this.slots[b].u = this.slots[a].u;
    this.slots[a].u = t;
    this.emit('move', { from: a, slot: b, swap: !!t });
    return { ok: true, moved: true };
  };
  G.sell = function (a) {
    const u = this.slots[a] && this.slots[a].u;
    if (this.over || !u) return { ok: false };
    const v = T.sell[u.g];
    this.coins += v;
    this.slots[a].u = null;
    this.emit('sell', { slot: a, ch: u.ch, g: u.g, coins: v });
    return { ok: true, coins: v };
  };
  G.upgrade = function (g) {
    const c = this.upCost(g);
    if (this.over || this.coins < c) return { ok: false, why: this.lv[g] >= T.upgrade.max ? '최대 강화예요' : '동전이 모자라요' };
    this.coins -= c;
    this.lv[g]++;
    this.emit('upgrade', { g, lv: this.lv[g] });
    return { ok: true };
  };

  // ── 웨이브 ───────────────────────────────────────────────
  G.waveHp = function (w) { return T.enemy.hp * Math.pow(T.enemy.hpGrow, w - 1); };
  G.startWave = function () {
    this.wave++;
    const w = this.wave, E = T.enemy;
    const q = [];
    const n = E.count(w);
    const boss = this.isBossWave(w);
    for (let i = 0; i < n; i++) {
      let k = 'blob';
      const r = this.rand();
      if (w >= E.kinds.tank.from && r < 0.18) k = 'tank';
      else if (w >= E.kinds.fast.from && r < 0.42) k = 'fast';
      q.push(k);
    }
    if (boss) q.splice(Math.floor(n / 2), 0, 'boss');
    this.spawnQ = q;
    this.spawnT = 0;
    this.tWave = w >= T.waves ? T.finalTime : T.waveTime;
    if (w > 1) this.coins += T.reward.wave;
    this.emit('wave', { n: w, boss, last: w >= T.waves });
  };
  G.spawn = function (k) {
    const K = T.enemy.kinds[k];
    const hp = this.waveHp(this.wave) * K.hp;
    const e = { id: this.nextId++, kind: k, hp, max: hp, d: 0, sp: T.enemy.speed * K.speed, slowT: 0, slow: 0, burnT: 0, burn: 0, psn: 0, psnT: 0, hitT: 0, x: 0.5, y: 0.5, dir: 0, wave: this.wave };
    this.enemies.push(e);
    if (k === 'boss') this.emit('boss', { id: e.id });
  };

  // ── 공격 ─────────────────────────────────────────────────
  G.unitDmg = function (u) {
    const c = this.char(u.ch), gr = T.grades[u.g];
    return c.dmg * gr.dmg * (1 + T.upgrade.dmg * this.lv[u.g]);
  };
  G.unitRange = function (u) { return this.char(u.ch).range + u.g * 0.15; };
  // 공속 = 기본 × 등급 × (1 + 쿠리만쥬 곁 버프)
  G.unitRate = function (u) { return this.char(u.ch).rate * T.grades[u.g].spd * (1 + (u.haste || 0) + (u.hasteT > 0 ? u.hasteX : 0)); };
  G.inRange = function (x, y, r, skip) {
    let best = null;
    for (const e of this.enemies) {
      if (e.hp <= 0 || (skip && skip.has(e.id))) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r * r) continue;
      // 가장 멀리 간 괴물부터 (같은 판에서 오래 돈 놈이 상한을 채우므로)
      if (!best || e.d > best.d) best = e;
    }
    return best;
  };
  // 쿠리만쥬 곁(aura 칸 안)의 친구들 공속 버프 — 겹치면 가장 센 것 하나만
  G.neighbors = function (si, r) {
    const s = this.slots[si], o = [];
    this.slots.forEach((t, j) => { if (j !== si && t.u && Math.hypot(t.x - s.x, t.y - s.y) <= r + 0.01) o.push(j); });
    return o;
  };
  G.auras = function () {
    for (const s of this.slots) if (s.u) s.u.haste = 0;
    this.slots.forEach((s, i) => {
      const u = s.u;
      if (!u) return;
      const c = this.char(u.ch);
      if (!c.aura) return;
      const h = c.haste[u.g];
      for (const j of this.neighbors(i, c.aura)) { const v = this.slots[j].u; if (h > v.haste) v.haste = h; }
    });
  };
  G.hurt = function (e, dmg, src, o) {
    if (e.hp <= 0) return 0;
    o = o || {};
    e.hp -= dmg;
    e.hitT = 0.12;
    this.emit('hit', { id: e.id, x: e.x, y: e.y, dmg, crit: !!o.crit, ch: src, kind: o.kind || '', skill: !!o.skill });
    if (e.hp <= 0) this.kill(e, src);
    return dmg;
  };
  G.kill = function (e, src) {
    const R = T.reward;
    const c = e.kind === 'boss' ? R.boss : R[e.kind] || R.kill;
    this.coins += c;
    this.kills++;
    this.emit('kill', { id: e.id, x: e.x, y: e.y, kind: e.kind, coins: c });
    // 마지막 웨이브의 보스를 잡으면 클리어
    if (e.kind === 'boss' && e.wave >= T.waves) this.won = true;
  };
  G.fire = function (si, u, t) {
    const s = this.slots[si], c = this.char(u.ch);
    u.n = (u.n || 0) + 1;
    const sk = c.skill && u.n % c.skill.every === 0 ? c.skill : null;
    let dmg = this.unitDmg(u), crit = false;
    if (sk) dmg *= sk.x;
    if ((sk && sk.crit) || (c.crit && this.rand() < c.crit)) { dmg *= c.critX; crit = true; }
    if (c.bossX && t.kind === 'boss') dmg *= c.bossX;
    u.aim = t.x < s.x ? -1 : 1;
    this.emit('fire', { slot: si, ch: u.ch, g: u.g, crit, skill: !!sk, tx: t.x, ty: t.y });
    if (sk && sk.haste) {   // 쿠리만쥬 건배: 옆 친구들 잠깐 더 빠르게
      const who = this.neighbors(si, c.aura);
      for (const j of who) { const v = this.slots[j].u; v.hasteT = sk.hasteT; v.hasteX = sk.haste; }
      this.emit('buff', { slot: si, to: who });
    }
    if (c.kind === 'pierce' && !sk) {
      // 바람: 과녁 쪽으로 일직선, 길 위 괴물을 차례로 꿰뚫음
      const dx = t.x - s.x, dy = t.y - s.y, l = Math.hypot(dx, dy) || 1;
      this.proj.push({ id: this.nextId++, ch: u.ch, g: u.g, x: s.x, y: s.y - 0.15, sx: s.x, sy: s.y, vx: dx / l, vy: dy / l, left: this.unitRange(u) + c.pierce, pierce: true, hits: new Set(), dmg, crit });
      return;
    }
    this.proj.push({ id: this.nextId++, ch: u.ch, g: u.g, x: s.x, y: s.y - 0.15, sx: s.x, sy: s.y, t: t.id, tx: t.x, ty: t.y, dmg, crit, skill: !!sk });
  };
  G.poison = function (e, n, base, c) {
    e.psn = Math.min(c.psnMax, (e.psn || 0) + n);
    e.psnDps = Math.max(e.psnDps || 0, base * c.psn);
    e.psnT = c.psnT;
    e.psnSrc = c.id;
  };
  G.land = function (p) {
    const c = this.char(p.ch), sk = p.skill ? c.skill : null;
    const tgt = this.enemies.find((e) => e.id === p.t && e.hp > 0);
    const at = tgt || { x: p.tx, y: p.ty };
    const r = sk && sk.splash ? sk.splash : c.splash;
    if (sk) this.emit('skillfx', { x: at.x, y: at.y, ch: p.ch, r: r || 0.6 });
    if (r) {
      // 범위: 물결·불꽃·회오리·독풀
      for (const e of this.enemies.slice()) {
        if (e.hp <= 0) continue;
        const dx = e.x - at.x, dy = e.y - at.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (c.slow) { e.slow = Math.max(e.slow, sk && sk.slow ? sk.slow : c.slow); e.slowT = c.slowT; }
        if (c.burn) { e.burn = Math.max(e.burn, p.dmg * c.burn); e.burnT = c.burnT; e.burnSrc = p.ch; }
        if (c.kind === 'poison') this.poison(e, sk.stacks, p.dmg / sk.x, c);
        if (sk && sk.push && e.kind !== 'boss') e.d = Math.max(0, e.d - sk.push);
        if (p.dmg > 0) this.hurt(e, p.dmg, p.ch, { kind: c.kind === 'single' ? 'splash' : c.kind, skill: !!sk, crit: p.crit });
      }
      this.emit('splash', { x: at.x, y: at.y, r, ch: p.ch, skill: !!sk });
      return;
    }
    if (!tgt) return;
    if (c.kind === 'poison') this.poison(tgt, 1, p.dmg, c);
    this.hurt(tgt, p.dmg, p.ch, { crit: p.crit, kind: c.kind, skill: !!sk });
  };

  // ── 한 틱 ────────────────────────────────────────────────
  G.step = function (dt) {
    if (this.over) return;
    this.time += dt;
    // 웨이브 시계
    this.tWave -= dt;
    if (this.tWave <= 0) {
      if (this.wave >= T.waves) return this.end('lose', '마지막 보스를 시간 안에 못 잡았어요');
      this.startWave();
    }
    if (this.spawnQ.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const k = this.spawnQ.shift();
        this.spawn(k);
        this.spawnT = k === 'boss' ? T.enemy.gap * 2 : T.enemy.gap;
      }
    }
    // 괴물 이동 · 상태
    for (const e of this.enemies) {
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitT > 0) e.hitT -= dt;
      e.d += e.sp * (1 - e.slow) * dt;
      const p = this.path.at(e.d);
      e.x = p.x; e.y = p.y; e.dir = p.dir;
      // 지속 피해(화상 · 독)는 1 넘게 모이면 한 번에 — 숫자가 너무 잘게 뜨지 않게
      if (e.burnT > 0 && e.hp > 0) {
        e.burnT -= dt;
        e.burnAcc = (e.burnAcc || 0) + e.burn * dt;
        if (e.burnAcc >= 1 || e.burnT <= 0) { const d = e.burnAcc; e.burnAcc = 0; this.hurt(e, d, e.burnSrc, { kind: 'dot' }); }
      }
      if (e.psnT > 0 && e.hp > 0) {
        e.psnT -= dt;
        e.psnAcc = (e.psnAcc || 0) + e.psn * e.psnDps * dt;
        if (e.psnAcc >= 1 || e.psnT <= 0) { const d = e.psnAcc; e.psnAcc = 0; this.hurt(e, d, e.psnSrc, { kind: 'psn' }); }
        if (e.psnT <= 0) { e.psn = 0; e.psnDps = 0; }
      }
    }
    // 친구 공격
    this.auras();
    this.slots.forEach((s, i) => {
      const u = s.u;
      if (!u) return;
      if (u.hasteT > 0) u.hasteT -= dt;
      u.cd -= dt;
      if (u.cd > 0) return;
      const t = this.inRange(s.x, s.y, this.unitRange(u));
      if (!t) { u.cd = 0.05; return; }
      this.fire(i, u, t);
      u.cd += 1 / this.unitRate(u);
      if (u.cd < 0) u.cd = 0;
    });
    // 투사체
    for (const p of this.proj) {
      if (p.pierce) {
        const sp = T.pierceSpeed * dt;
        p.x += p.vx * sp; p.y += p.vy * sp; p.left -= sp;
        const c = this.char(p.ch);
        for (const e of this.enemies) {
          if (e.hp <= 0 || p.hits.has(e.id)) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= c.width) { p.hits.add(e.id); this.hurt(e, p.dmg, p.ch, { crit: p.crit, kind: 'pierce' }); }
        }
        if (p.left <= 0) p.done = true;
        continue;
      }
      const sp = T.projSpeed * dt;
      const tgt = this.enemies.find((e) => e.id === p.t && e.hp > 0);
      if (tgt) { p.tx = tgt.x; p.ty = tgt.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, l = Math.hypot(dx, dy);
      if (l <= sp) { p.done = true; this.land(p); }
      else { p.x += (dx / l) * sp; p.y += (dy / l) * sp; }
    }
    this.proj = this.proj.filter((p) => !p.done);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    // 끝?
    if (this.won) return this.end('win');
    if (this.load() >= T.cap) return this.end('lose', '길 위 괴물이 ' + T.cap + '마리가 됐어요');
  };
  G.end = function (r, why) {
    this.over = r;
    this.loseWhy = why || '';
    this.emit('end', { win: r === 'win', why: this.loseWhy, wave: this.wave });
  };

  // 화면·봇이 읽는 요약 (읽기 전용)
  G.state = function () {
    return {
      wave: this.wave, waves: T.waves, tWave: this.tWave, coins: this.coins, cost: this.cost(),
      load: this.load(), cap: T.cap, over: this.over, kills: this.kills, time: this.time,
      units: this.slots.map((s) => (s.u ? { ch: s.u.ch, g: s.u.g } : null)),
      enemies: this.enemies.length, lv: this.lv.slice(),
    };
  };

  const API = { Game, rng, makePath };
  root.CD_CORE = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
