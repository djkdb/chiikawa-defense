/* 게임 규칙 — 화면(DOM·캔버스)을 전혀 모릅니다. 그래서 node 에서도 그대로 돌아가고(tools/sim.js 균형 확인),
   화면은 g.ev 에 쌓인 사건(소환·합성·명중·처치·보스 기술…)만 꺼내 연출합니다.
   좌표는 전부 「칸」 단위. 판 가장자리 한 바퀴의 칸 가운데를 잇는 선이 괴물 길입니다.
   숫자는 전부 table.js — 여기는 「어떻게 돌아가는지」 만. */
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

  // 난이도 · 변수 칩 → 판 전체에 곱하는 값 하나로
  function mods(diff, chips) {
    const D = T.diffs[diff] || T.diffs[1];
    const m = { hp: D.hp, speed: 1, regen: 0, start: 1, coin: 1, count: 1, bossHp: 1, cap: D.cap };
    for (const k of chips) {
      const c = T.chips[k];
      if (!c) continue;
      if (c.hp) m.hp *= c.hp;
      if (c.speed) m.speed *= c.speed;
      if (c.regen) m.regen += c.regen;
      if (c.start) m.start *= c.start;
      if (c.coin) m.coin *= c.coin;
      if (c.count) m.count *= c.count;
      if (c.bossHp) m.bossHp *= c.bossHp;
    }
    return m;
  }
  // 판마다 붙는 변수 칩 — 씨앗으로 정해짐 (시작 화면에 미리 보여 주려고 Game 밖에서도 부름)
  function rollChips(diff, seed) {
    const D = T.diffs[diff] || T.diffs[1], r = rng((seed || 1) * 31 + diff * 7 + 3);
    const n = D.chips[0] + Math.floor(r() * (D.chips[1] - D.chips[0] + 1));
    const keys = Object.keys(T.chips), o = [];
    while (o.length < n && keys.length) o.push(keys.splice(Math.floor(r() * keys.length), 1)[0]);
    return o;
  }

  function Game(opt) {
    opt = opt || {};
    this.T = T;
    this.seed = opt.seed || (Date.now() & 0xffffff);
    this.rand = rng(this.seed);
    this.diff = opt.diff == null ? 1 : opt.diff;
    this.chips = opt.chips || rollChips(this.diff, this.seed);
    this.m = mods(this.diff, this.chips);
    this.cap = this.m.cap;
    const { cols, rows } = T.board;
    this.cols = cols; this.rows = rows;
    this.path = makePath(cols, rows);
    this.slots = [];
    // reach = 칸에서 길까지 가장 가까운 거리. 안쪽 칸(가운데 두 줄)은 2칸이라 사거리 짧은 친구(우사기 1.8 · 시사 1.9)는 길에 닿지 않음
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) this.slots.push({ x: x + 0.5, y: y + 0.5, u: null, reach: Math.min(x, y, cols - 1 - x, rows - 1 - y) });
    this.charIdx = {};
    T.chars.forEach((c, i) => (this.charIdx[c.id] = i));
    this.lv = T.upgrade.base.map(() => 0);   // 강화 계열별 단계 (신화는 전설 계열 — T.upGroup)
    this.coins = Math.round(T.startCoins * this.m.start);
    this.summons = 0;
    this.oddsLv = 0;          // 소환 확률 레벨
    this.clovers = T.luck.start;
    this.pity = T.luck.p.map(() => 0);   // 행운 소환 실패로 쌓인 보너스
    this.power = 0;           // 3택 보상 「힘내기 응원」 누적
    this.discount = 0;        // 3택 보상 「소환 할인」 누적
    this.plan = {};           // 웨이브 → 특성 목록 (다음 웨이브를 미리 보여 주려고 한 웨이브 앞서 정함)
    this.pick = null;         // 보스를 잡은 뒤 고를 카드 셋 (있으면 시간이 멈춤)
    this.endless = false;
    this.made = [];           // 이번 판에 만든 신화 레시피 번호
    this.syn = {};
    this.wave = 0;
    this.tWave = 2.5;         // 첫 웨이브까지 숨 돌릴 틈
    this.time = 0;
    this.enemies = [];
    this.proj = [];
    this.spawnQ = [];
    this.spawnT = 0;
    this.nextId = 1;
    this.over = null;         // null | 'win' | 'lose'
    this.won = false;
    this.loseWhy = '';
    this.kills = 0;
    this.bestGrade = -1;
    this.ev = [];
    this.planWave(1);
  }
  const G = Game.prototype;

  G.emit = function (type, o) { o = o || {}; o.type = type; this.ev.push(o); };
  G.char = function (id) { return T.chars[this.charIdx[id]]; };
  G.cost = function () { return Math.max(5, T.summonCost + T.summonStep * this.summons - this.discount); };
  G.upCost = function (g) { return this.lv[g] >= T.upgrade.max ? Infinity : T.upgrade.base[g] + T.upgrade.step[g] * this.lv[g]; };
  G.odds = function () { return T.odds.table[this.oddsLv]; };
  G.oddsCost = function () { return this.oddsLv >= T.odds.cost.length ? Infinity : T.odds.cost[this.oddsLv]; };
  G.luckP = function (i) { return Math.min(1, T.luck.p[i] + this.pity[i]); };
  G.empty = function () { const o = []; this.slots.forEach((s, i) => { if (!s.u) o.push(i); }); return o; };
  // 새 친구가 설 빈칸: 길에 가까운 바깥 칸부터 무작위 (가운데에 떨어져 아무것도 못 때리는 운을 없앰 — 가운데는 바깥이 다 찬 뒤)
  G.freeSlot = function () {
    const free = this.empty();
    if (!free.length) return -1;
    const near = Math.min(...free.map((i) => this.slots[i].reach));
    return this.pick1(free.filter((i) => this.slots[i].reach === near));
  };
  G.load = function () {
    let n = 0;
    for (const e of this.enemies) n += e.kind === 'boss' ? T.bossWeight : 1;
    return n;
  };
  G.isBossWave = function (w) { return w % T.bossEvery === 0; };
  G.bossType = function (w) { return T.bosses[(Math.max(1, Math.floor(w / T.bossEvery)) - 1) % T.bosses.length]; };

  G.pick1 = function (arr) { return arr[Math.floor(this.rand() * arr.length)]; };
  G.newUnit = function (ch, g, myth) {
    if (g > this.bestGrade) this.bestGrade = g;
    const u = { id: this.nextId++, ch, g, cd: 0.3 + this.rand() * 0.4, aim: 1, n: 0, mn: 0, haste: 0, hasteT: 0, hasteX: 0, silT: 0, buffD: 0 };
    if (myth != null) u.myth = myth;
    return u;
  };
  G.rollGrade = function () {
    const o = this.odds();
    let r = this.rand();
    for (let i = 0; i < o.length; i++) { if (r < o[i]) return i; r -= o[i]; }
    return 0;
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
    const g = this.rollGrade();
    const ch = this.pick1(T.chars).id;
    const slot = this.freeSlot();
    this.slots[slot].u = this.newUnit(ch, g);
    this.emit('summon', { slot, ch, g, cost });
    return { ok: true, slot };
  };

  G.canMerge = function (a, b) {
    const A = this.slots[a] && this.slots[a].u, B = this.slots[b] && this.slots[b].u;
    return !!(A && B && a !== b && A.ch === B.ch && A.g === B.g && A.g < T.mergeTop);
  };
  // 같은 캐릭터·같은 등급 둘 → 한 등급 위 무작위 캐릭터 (b 자리에). 전설이 끝 — 신화는 레시피로만
  G.merge = function (a, b) {
    if (this.over || !this.canMerge(a, b)) {
      const A = this.slots[a] && this.slots[a].u;
      return { ok: false, why: A && A.g >= T.mergeTop ? '전설은 합성 대신 신화 레시피로!' : '같은 캐릭터 · 같은 등급끼리만 합칠 수 있어요' };
    }
    const g = this.slots[b].u.g + 1, from = this.slots[a].u.ch;
    this.slots[a].u = null;
    const ch = this.pick1(T.chars).id;
    this.slots[b].u = this.newUnit(ch, g);
    this.emit('merge', { from: a, slot: b, ch, g, was: from });
    return { ok: true, slot: b };
  };
  G.mateOf = function (a) {
    const A = this.slots[a] && this.slots[a].u;
    if (!A || A.g >= T.mergeTop) return -1;
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
  // 소환 확률 올리기
  G.oddsUp = function () {
    const c = this.oddsCost();
    if (this.over || c === Infinity) return { ok: false, why: '확률은 최대예요' };
    if (this.coins < c) return { ok: false, why: '동전이 모자라요' };
    this.coins -= c;
    this.oddsLv++;
    this.emit('odds', { lv: this.oddsLv });
    return { ok: true };
  };
  // 행운 소환: 클로버 하나로 i 칸(희귀·영웅·전설) 「확정」 을 노림. 실패하면 그 칸 확률이 쌓임
  G.gamble = function (i) {
    if (this.over) return { ok: false, why: '끝난 판' };
    if (this.clovers < 1) return { ok: false, why: '클로버가 없어요 — 보스를 잡으면 받아요' };
    const free = this.empty();
    if (!free.length) return { ok: false, why: '빈칸이 있어야 해요' };
    this.clovers--;
    const p = this.luckP(i), g = T.luck.grades[i];
    if (this.rand() < p) {
      this.pity[i] = 0;
      const slot = this.freeSlot(), ch = this.pick1(T.chars).id;
      this.slots[slot].u = this.newUnit(ch, g);
      this.emit('gamble', { win: true, i, g, slot, ch, p });
      this.emit('summon', { slot, ch, g, cost: 0, luck: true });
      return { ok: true, win: true, slot, g, p };
    }
    this.pity[i] += T.luck.pity;
    this.emit('gamble', { win: false, i, g, p });
    return { ok: true, win: false, p };
  };
  // 신화 레시피: 판 위 전설 가운데 need 셋이 다 있으면 그 칸 번호들, 아니면 null
  G.recipeSlots = function (r) {
    const R = T.recipes[r], used = new Set(), o = [];
    for (const ch of R.need) {
      const i = this.slots.findIndex((s, j) => !used.has(j) && s.u && s.u.g === T.mergeTop && s.u.ch === ch);
      if (i < 0) return null;
      used.add(i); o.push(i);
    }
    return o;
  };
  // 레시피에서 아직 판에 없는 재료(친구 id)와, 그 레시피에 안 쓰이는 「남는 전설」 칸
  G.recipeNeed = function (r) {
    const R = T.recipes[r], used = new Set(), miss = [];
    for (const ch of R.need) {
      const i = this.slots.findIndex((s, j) => !used.has(j) && s.u && s.u.g === T.mergeTop && s.u.ch === ch);
      if (i < 0) miss.push(ch); else used.add(i);
    }
    const spare = [];
    this.slots.forEach((s, j) => { if (!used.has(j) && s.u && s.u.g === T.mergeTop) spare.push(j); });
    return { miss, spare, have: Array.from(used) };
  };
  // 클로버로 「남는 전설」 하나를 레시피에 빠진 친구로 바꾸기 — 운에만 맡기지 않고 신화를 노릴 길
  G.swapFor = function (r) {
    if (this.over) return { ok: false, why: '끝난 판' };
    const N = this.recipeNeed(r);
    if (!N.miss.length) return { ok: false, why: '재료가 다 있어요 — 만들기를 눌러요' };
    if (!N.spare.length) return { ok: false, why: '바꿀 전설이 하나 더 있어야 해요' };
    if (this.clovers < T.luck.swap) return { ok: false, why: '클로버가 ' + T.luck.swap + '개 필요해요' };
    this.clovers -= T.luck.swap;
    const i = N.spare[0], u = this.slots[i].u, was = u.ch;
    this.slots[i].u = this.newUnit(N.miss[0], u.g);
    this.emit('swap', { slot: i, ch: N.miss[0], was });
    return { ok: true, slot: i };
  };
  G.readyRecipes = function () { const o = []; T.recipes.forEach((_, r) => { if (this.recipeSlots(r)) o.push(r); }); return o; };
  G.craft = function (r) {
    if (this.over) return { ok: false, why: '끝난 판' };
    const sl = this.recipeSlots(r);
    if (!sl) return { ok: false, why: '레시피의 전설 셋이 판에 다 있어야 해요' };
    const R = T.recipes[r];
    for (const i of sl) this.slots[i].u = null;
    const at = sl[0];
    this.slots[at].u = this.newUnit(R.need[0], T.mergeTop + 1, r);
    if (!this.made.includes(r)) this.made.push(r);
    this.emit('myth', { slot: at, ch: R.need[0], r, from: sl.slice(1) });
    return { ok: true, slot: at };
  };

  // ── 3택 보상 ─────────────────────────────────────────────
  G.makeCards = function () {
    const C = T.cards, w = this.wave, f = C.fixed.slice(), o = [];
    for (let k = 0; k < 2; k++) {
      const c = f.splice(Math.floor(this.rand() * f.length), 1)[0];
      const v = c.v(w);
      o.push({ key: c.key, name: c.name, desc: c.desc.replace('{v}', v), v, gamble: false });
    }
    const gc = this.pick1(C.gamble);
    o.push({ key: gc.key, name: gc.name, desc: gc.desc, p: gc.p, gamble: true });
    return o;
  };
  G.giveUnit = function (g) {
    const free = this.empty();
    if (!free.length) { this.coins += T.sell[g]; return -1; }   // 빈칸이 없으면 판 값만큼 동전으로
    const s = this.freeSlot(), ch = this.pick1(T.chars).id;
    this.slots[s].u = this.newUnit(ch, g);
    this.emit('summon', { slot: s, ch, g, cost: 0 });
    return s;
  };
  G.choose = function (k) {
    const c = this.pick && this.pick[k];
    if (!c) return { ok: false };
    this.pick = null;
    const out = { ok: true, key: c.key, win: null };
    switch (c.key) {
      case 'coins': this.coins += c.v; break;
      case 'clover': this.clovers += c.v; break;
      case 'epic': this.giveUnit(2); break;
      case 'power': this.power += c.v; break;
      case 'cheap': this.discount += c.v; break;
      case 'room': this.cap += c.v; break;
      case 'legend': out.win = this.rand() < c.p; if (out.win) this.giveUnit(3); break;
      case 'double': out.win = this.rand() < c.p; this.coins = out.win ? this.coins * 2 : Math.floor(this.coins / 2); break;
      case 'lift': {
        const us = [];
        this.slots.forEach((s, i) => { if (s.u && s.u.g < T.mergeTop) us.push(i); });
        if (!us.length) { this.coins += 50; break; }
        const i = this.pick1(us), u = this.slots[i].u;
        out.win = this.rand() < c.p;
        out.slot = i;
        if (out.win) { this.slots[i].u = this.newUnit(u.ch, u.g + 1); this.emit('summon', { slot: i, ch: u.ch, g: u.g + 1, cost: 0 }); }
        else { this.slots[i].u = null; this.emit('sell', { slot: i, ch: u.ch, g: u.g, coins: 0 }); }
        break;
      }
    }
    this.emit('chose', Object.assign({ card: c }, out));
    return out;
  };
  // 무한 모드: 20웨이브 클리어 뒤 이어 가기
  G.goEndless = function () {
    if (this.over !== 'win') return false;
    this.over = null; this.won = false; this.endless = true;
    this.tWave = Math.min(this.tWave, 6);
    this.emit('endless', {});
    return true;
  };

  // ── 웨이브 ───────────────────────────────────────────────
  G.waveHp = function (w) { return T.enemy.hp * Math.pow(T.enemy.hpGrow, w - 1) * this.m.hp; };
  // 웨이브 특성: from 이 지난 것 중 1개(8웨이브부터 2개). 막 열린 특성은 그 웨이브에 꼭, 바로 앞과 같은 조합은 피함
  G.planWave = function (w) {
    if (this.plan[w]) return this.plan[w];
    const open = Object.keys(T.traits).filter((k) => w >= T.traits[k].from);
    const n = Math.min(open.length, w >= 8 ? 2 : 1);
    const prev = (this.plan[w - 1] || []).join();
    const fresh = open.find((k) => T.traits[k].from === w);
    let o = [];
    for (let tries = 0; tries < 8; tries++) {
      const pool = open.slice();
      o = [];
      while (o.length < n) o.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
      if (fresh && !o.includes(fresh)) o[0] = fresh;
      o.sort();
      if (o.join() !== prev || open.length <= n) break;
    }
    this.plan[w] = o;
    return o;
  };
  G.nextTraits = function () { return this.planWave(this.wave + 1); };
  G.startWave = function () {
    this.wave++;
    const w = this.wave, E = T.enemy;
    const q = [];
    const n = Math.round(E.count(w) * this.m.count);
    const boss = this.isBossWave(w);
    const tr = this.planWave(w);
    const tankP = w >= E.kinds.tank.from ? 0.14 : 0;
    for (let i = 0; i < n; i++) {
      const k = this.rand() < tankP ? 'tank' : 'blob';
      let t = null;
      if (k === 'blob' && tr.length && this.rand() < T.traitShare / (1 - tankP)) t = tr[Math.floor(this.rand() * tr.length)];
      q.push({ k, t });
    }
    if (boss) q.splice(Math.floor(n / 2), 0, { k: 'boss', t: null });
    this.spawnQ = q;
    this.spawnT = 0;
    this.tWave = w >= T.waves && !this.endless ? T.finalTime : T.waveTime;
    if (w > 1) {
      // 이자: 지금 가진 동전의 5% (상한) — 웨이브 보상과 같이
      const it = Math.min(T.interest.cap, Math.floor(this.coins * T.interest.rate));
      this.coins += T.reward.wave + it;
      this.emit('interest', { coins: it, wave: T.reward.wave });
    }
    this.planWave(w + 1);
    this.emit('wave', { n: w, boss, last: w >= T.waves && !this.endless, traits: tr, bt: boss ? this.bossType(w).key : null });
  };
  G.spawn = function (q, at) {
    const k = q.k, t = q.t, K = T.enemy.kinds[k], TR = t ? T.traits[t] : null;
    let hp = this.waveHp(this.wave) * K.hp;
    if (TR && TR.hp && (t === 'fast')) hp *= TR.hp;
    if (k === 'boss') hp *= this.m.bossHp;
    if (q.small) hp = q.hp;
    const sp = T.enemy.speed * K.speed * this.m.speed * (TR && TR.speed ? TR.speed : 1) * (q.small ? 1.15 : 1);
    const e = { id: this.nextId++, kind: k, trait: t, small: !!q.small, hp, max: hp, d: at || 0, sp, slowT: 0, slow: 0, burnT: 0, burn: 0, psn: 0, psnT: 0, hitT: 0, stunT: 0, downT: 0, x: 0.5, y: 0.5, dir: 0, wave: this.wave };
    if (k === 'boss') {
      const B = this.bossType(this.wave);
      e.bt = B.key;
      e.bs = { phase: 'walk', t: B.first, pt: 0, targets: [] };
    }
    const p = this.path.at(e.d);
    e.x = p.x; e.y = p.y; e.dir = p.dir;
    this.enemies.push(e);
    if (k === 'boss') this.emit('boss', { id: e.id, bt: e.bt });
    return e;
  };
  // 보스 기술: 걷기 → 준비(멈춰 서서 예고 · 침묵은 노릴 칸을 미리 보여 줌) → 쓰는 중
  G.bossTick = function (e, dt) {
    const B = T.bosses.find((b) => b.key === e.bt), S = e.bs;
    if (S.phase === 'walk') {
      S.t -= dt;
      if (S.t > 0) return;
      S.phase = 'warn'; S.pt = B.warn;
      if (B.key === 'silence') {
        // 등급이 높은 친구부터 (같으면 무작위)
        const us = [];
        this.slots.forEach((s, i) => { if (s.u) us.push([i, s.u.g * 10 + this.rand()]); });
        us.sort((a, b) => b[1] - a[1]);
        S.targets = us.slice(0, B.n).map((x) => x[0]);
      }
      this.emit('bwarn', { id: e.id, bt: B.key, targets: S.targets.slice(), x: e.x, y: e.y });
      return;
    }
    S.pt -= dt;
    if (S.pt > 0) return;
    if (S.phase === 'warn') {
      S.phase = 'cast'; S.pt = B.cast;
      const out = { id: e.id, bt: B.key, x: e.x, y: e.y };
      if (B.key === 'silence') {
        out.targets = [];
        for (const i of S.targets) { const u = this.slots[i].u; if (u) { u.silT = B.t; out.targets.push(i); } }
      } else if (B.key === 'summon') {
        for (let k = 0; k < B.n; k++) this.spawn({ k: 'minion', t: null }, Math.max(0, e.d - 0.3 - k * 0.32));
      } else if (B.key === 'heal') {
        out.heal = Math.min(e.max - e.hp, e.max * B.x);
        e.hp += out.heal;
      } else if (B.key === 'shuffle') {
        const us = this.slots.map((s) => s.u), idx = us.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        out.moves = [];
        idx.forEach((to, from) => { this.slots[to].u = us[from]; if (us[from]) out.moves.push([from, to]); });
      }
      this.emit('bcast', out);
      return;
    }
    S.phase = 'walk'; S.t = B.every; S.targets = [];
  };

  // ── 공격 ─────────────────────────────────────────────────
  G.unitDmg = function (u) {
    const c = this.char(u.ch), gr = T.grades[u.g];
    return c.dmg * gr.dmg * (1 + T.upgrade.dmg * this.lv[T.upGroup[u.g]]) * (1 + (this.syn[u.ch] || 0) + this.power + (u.buffD || 0));
  };
  G.unitRange = function (u) { return this.char(u.ch).range + Math.min(u.g, 4) * 0.15; };
  // 공속 = 기본 × 등급 × (1 + 쿠리만쥬 곁 버프)
  G.unitRate = function (u) { return this.char(u.ch).rate * T.grades[u.g].spd * (1 + (u.haste || 0) + (u.hasteT > 0 ? u.hasteX : 0)); };
  G.inRange = function (x, y, r, skip) {
    let best = null;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.downT > 0 || (skip && skip.has(e.id))) continue;
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
    // 같은 친구 시너지 · 신화 쿠리만쥬 「들판 잔치」(판 전체)
    const cnt = {};
    let feast = null;
    for (const s of this.slots) {
      if (!s.u) continue;
      cnt[s.u.ch] = (cnt[s.u.ch] || 0) + 1;
      if (s.u.myth != null && T.recipes[s.u.myth].myth.kind === 'feast') feast = T.recipes[s.u.myth].myth;
    }
    this.syn = {};
    for (const ch in cnt) for (const [n, v] of T.synergy) if (cnt[ch] >= n) { this.syn[ch] = v; break; }
    for (const s of this.slots) if (s.u) { s.u.haste = feast ? feast.haste : 0; s.u.buffD = feast ? feast.dmg : 0; }
    this.slots.forEach((s, i) => {
      const u = s.u;
      if (!u) return;
      const c = this.char(u.ch);
      if (!c.aura) return;
      const h = c.haste[Math.min(u.g, c.haste.length - 1)];
      for (const j of this.neighbors(i, c.aura)) { const v = this.slots[j].u; if (h > v.haste) v.haste = h; }
    });
  };
  G.hurt = function (e, dmg, src, o) {
    if (e.hp <= 0 || e.downT > 0) return 0;
    o = o || {};
    // 장갑: 지속 피해(화상·독)와 관통(바람)은 그대로, 나머지는 절반
    if (e.trait === 'armor' && o.kind !== 'dot' && o.kind !== 'psn' && o.kind !== 'pierce') { dmg *= T.traits.armor.armor; o.armor = true; }
    e.hp -= dmg;
    e.hitT = 0.12;
    this.emit('hit', { id: e.id, x: e.x, y: e.y, dmg, crit: !!o.crit, ch: src, kind: o.kind || '', skill: !!o.skill, armor: !!o.armor });
    if (e.hp <= 0) {
      // 부활: 한 번은 쓰러졌다가 체력 절반으로 일어남 (쓰러져 있는 동안은 맞지 않음)
      if (e.trait === 'revive' && !e.revived) {
        e.revived = true; e.hp = e.max * T.traits.revive.hp; e.downT = T.traits.revive.downT;
        e.burnT = 0; e.psnT = 0; e.psn = 0; e.slowT = 0; e.slow = 0;
        this.emit('revive', { id: e.id, x: e.x, y: e.y });
        return dmg;
      }
      this.kill(e, src);
    }
    return dmg;
  };
  G.kill = function (e) {
    const R = T.reward;
    let c = e.kind === 'boss' ? R.boss : e.small ? R.small : e.kind === 'minion' ? R.minion : e.trait ? R.trait : R[e.kind] || R.kill;
    c = Math.round(c * this.m.coin);
    this.coins += c;
    this.kills++;
    this.emit('kill', { id: e.id, x: e.x, y: e.y, kind: e.kind, trait: e.trait, small: e.small, dir: e.dir, coins: c, bt: e.bt });
    // 분열: 작은 젤리 둘 (조금 뒤에서)
    if (e.trait === 'split' && !e.small) {
      const S = T.traits.split;
      for (let k = 0; k < S.n; k++) this.spawn({ k: 'blob', t: 'split', small: true, hp: e.max * S.hp }, Math.max(0, e.d - 0.15 - k * 0.3));
      this.emit('split', { id: e.id, x: e.x, y: e.y });
    }
    if (e.kind === 'boss') {
      this.clovers += T.luck.boss;
      // 마지막 웨이브의 보스를 잡으면 클리어 (무한 모드엔 끝이 없음) — 아니면 3택 보상
      if (e.wave >= T.waves && !this.endless) this.won = true;
      else { this.pick = this.makeCards(); this.emit('pick', { cards: this.pick }); }
    }
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
    if (u.myth != null) this.mythFire(si, u, t);
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
  // 신화 고유 스킬 (보통 공격 · 친구 스킬과 따로 센 횟수)
  G.mythFire = function (si, u, t) {
    const M = T.recipes[u.myth].myth;
    if (!M.every) return;
    u.mn = (u.mn || 0) + 1;
    if (u.mn % M.every) return;
    const base = this.unitDmg(u), s = this.slots[si];
    this.emit('mythskill', { slot: si, r: u.myth, kind: M.kind, x: t.x, y: t.y });
    if (M.kind === 'nova') {
      for (const e of this.enemies.slice()) this.hurt(e, base * M.x, u.ch, { kind: 'nova', skill: true });
    } else if (M.kind === 'stun') {
      for (const e of this.enemies.slice()) {
        if (Math.hypot(e.x - s.x, e.y - s.y) > M.r) continue;
        e.stunT = Math.max(e.stunT, e.kind === 'boss' ? M.t * 0.35 : M.t);
        this.hurt(e, base * M.x, u.ch, { kind: 'stun', skill: true });
      }
    } else if (M.kind === 'meteor') {
      let best = null;
      for (const e of this.enemies) if (e.hp > 0 && !(e.downT > 0) && (!best || e.hp > best.hp)) best = e;
      if (best) {
        this.emit('meteor', { x: best.x, y: best.y });
        this.hurt(best, base * M.x * (best.kind === 'boss' ? 2 : 1), u.ch, { kind: 'meteor', skill: true, crit: true });
      }
    }
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
        if (e.hp <= 0 || e.downT > 0) continue;
        const dx = e.x - at.x, dy = e.y - at.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (c.slow) { e.slow = Math.max(e.slow, sk && sk.slow ? sk.slow : c.slow); e.slowT = c.slowT; }
        if (c.burn) { e.burn = Math.max(e.burn, p.dmg * c.burn); e.burnT = c.burnT; e.burnSrc = p.ch; }
        if (c.kind === 'poison') this.poison(e, sk.stacks, p.dmg / sk.x, c);
        if (sk && sk.push && !e.bs) e.d = Math.max(0, e.d - sk.push);
        if (p.dmg > 0) this.hurt(e, p.dmg, p.ch, { kind: c.kind === 'single' ? 'splash' : c.kind, skill: !!sk, crit: p.crit });
      }
      this.emit('splash', { x: at.x, y: at.y, r, ch: p.ch, skill: !!sk });
      return;
    }
    if (!tgt || tgt.downT > 0) return;
    if (c.kind === 'poison') this.poison(tgt, 1, p.dmg, c);
    this.hurt(tgt, p.dmg, p.ch, { crit: p.crit, kind: c.kind, skill: !!sk });
  };

  // ── 한 틱 ────────────────────────────────────────────────
  G.step = function (dt) {
    if (this.over || this.pick) return;   // 3택 보상을 고르는 동안은 멈춤
    this.time += dt;
    // 웨이브 시계
    this.tWave -= dt;
    if (this.tWave <= 0) {
      if (this.wave >= T.waves && !this.endless) return this.end('lose', '마지막 보스를 시간 안에 못 잡았어요');
      this.startWave();
    }
    if (this.spawnQ.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const q = this.spawnQ.shift();
        this.spawn(q);
        this.spawnT = q.k === 'boss' ? T.enemy.gap * 2 : T.enemy.gap;
      }
    }
    // 괴물 이동 · 상태
    for (const e of this.enemies) {
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.hitT > 0) e.hitT -= dt;
      if (e.bs) this.bossTick(e, dt);
      // 재생(특성) + 약초 들판(칩): 화상·독이 붙어 있으면 멈춤
      const rg = (e.trait === 'regen' ? T.traits.regen.regen : 0) + this.m.regen;
      if (rg && e.hp > 0 && !(e.burnT > 0) && !(e.psnT > 0) && !(e.downT > 0)) e.hp = Math.min(e.max, e.hp + e.max * rg * dt);
      if (e.downT > 0) { e.downT -= dt; continue; }        // 부활 중: 쓰러진 자리에서 멈춤
      if (e.stunT > 0) e.stunT -= dt;
      else if (!e.bs || e.bs.phase === 'walk') e.d += e.sp * (1 - e.slow) * dt;
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
      if (u.silT > 0) { u.silT -= dt; return; }   // 침묵: 봉인된 동안 공격 못 함
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
          if (e.hp <= 0 || e.downT > 0 || p.hits.has(e.id)) continue;
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
    if (this.load() >= this.cap) return this.end('lose', '길 위 괴물이 ' + this.cap + '마리가 됐어요');
  };
  G.end = function (r, why) {
    this.over = r;
    this.loseWhy = why || '';
    this.emit('end', { win: r === 'win', why: this.loseWhy, wave: this.wave, endless: this.endless });
  };

  // 화면·봇이 읽는 요약 (읽기 전용)
  G.state = function () {
    const b = this.enemies.find((e) => e.bs);
    return {
      wave: this.wave, waves: T.waves, tWave: this.tWave, coins: this.coins, cost: this.cost(),
      load: this.load(), cap: this.cap, over: this.over, kills: this.kills, time: this.time,
      units: this.slots.map((s) => (s.u ? { ch: s.u.ch, g: s.u.g, myth: s.u.myth, sil: s.u.silT > 0 } : null)),
      enemies: this.enemies.length, lv: this.lv.slice(),
      diff: this.diff, chips: this.chips.slice(), oddsLv: this.oddsLv, oddsCost: this.oddsCost(), clovers: this.clovers,
      pity: this.pity.slice(), pick: this.pick ? this.pick.map((c) => c.key) : null, endless: this.endless, made: this.made.slice(),
      next: this.nextTraits(), traitsOn: Array.from(new Set(this.enemies.map((e) => e.trait).filter(Boolean))),
      boss: b ? { bt: b.bt, phase: b.bs.phase, hp: b.hp, max: b.max, x: b.x, y: b.y } : null,
    };
  };

  const API = { Game, rng, makePath, rollChips, mods };
  root.CD_CORE = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
