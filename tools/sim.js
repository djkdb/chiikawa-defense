/* 균형 확인 — 화면 없이 규칙만 돌려 봅니다.
     node portfolio_src/chiikawa-defense/tools/sim.js          # 봇 넷 × 씨앗 20개
   기대: 「잘함」 은 거의 다 클리어, 「합성 안 함」 은 중반에 지고, 「손 놓음」 은 초반에 집니다.
   table.js 숫자를 바꿨으면 이걸로 기대가 그대로인지 봅니다. */
const T = require('../js/table.js');
const { Game } = require('../js/core.js');

const BOTS = {
  // 소환 → 짝 있으면 바로 합성 → 남는 동전으로 가장 많이 세운 계열 강화
  good(g) {
    for (let k = 0; k < 40; k++) {
      let did = false;
      for (let i = 0; i < g.slots.length; i++) { const j = g.mateOf(i); if (j >= 0) { g.merge(i, j); did = true; break; } }
      if (!did) break;
    }
    // 등급별 「그 등급 공격력 합」 이 가장 큰 계열을 강화
    const pow = [0, 0, 0, 0];
    g.slots.forEach((s) => { if (s.u) pow[s.u.g] += T.grades[s.u.g].dmg; });
    // 동전 하나당 늘어나는 힘: 강화 = 그 등급 힘의 20% / 강화값, 소환 = 일반 하나(≈1.3 기대) / 소환값
    let best = null, bestV = 1.3 / g.cost();
    for (let k = 0; k < 4; k++) { const v = (T.upgrade.dmg * pow[k]) / g.upCost(k); if (v > bestV) { bestV = v; best = k; } }
    // 강화 값이 소환 값보다 싸면 강화가 먼저 (높은 등급이 몰린 계열일수록 이득)
    if (best != null) { if (g.coins >= g.upCost(best)) g.upgrade(best); }
    else if (g.empty().length && g.coins >= g.cost()) g.summon();
    if (!g.empty().length) {
      if (best != null && g.coins >= g.upCost(best)) g.upgrade(best);
      else if (g.coins > 150) { // 꽉 찼고 합칠 짝도 없으면 가장 약한 일반 하나 팔기
        const i = g.slots.findIndex((s) => s.u && s.u.g === 0);
        if (i >= 0) g.sell(i);
      }
    }
  },
  // 소환만 하고 합성은 안 함
  nomerge(g) { if (g.empty().length && g.coins >= g.cost()) g.summon(); },
  // 처음 다섯 번만 소환하고 손 놓음
  idle(g) { if (g.summons < 5 && g.coins >= g.cost()) g.summon(); },
  // 사람처럼: 1초에 한 번만 뭔가 함
  slow(g, t) { if (Math.floor(t) !== Math.floor(t - 0.05)) BOTS.good(g); },
};

const N = +process.argv[2] || 20;
const dt = 0.05;
for (const [name, bot] of Object.entries(BOTS)) {
  let wins = 0; const waves = []; const why = {};
  for (let s = 1; s <= N; s++) {
    const g = new Game({ seed: s * 7919 });
    let t = 0;
    while (!g.over && t < 3600) { bot(g, t); g.step(dt); t += dt; g.ev.length = 0; }
    if (g.over === 'win') wins++;
    waves.push(g.wave);
    why[g.loseWhy || g.over] = (why[g.loseWhy || g.over] || 0) + 1;
    if (s === 1 && name === 'good') {
      const gr = [0, 0, 0, 0]; g.slots.forEach((x) => x.u && gr[x.u.g]++);
      console.log(`  (씨앗1 good: ${Math.round(t)}초 · 등급분포 ${gr.join('/')} · 강화 ${JSON.stringify(g.lv)})`);
    }
  }
  waves.sort((a, b) => a - b);
  console.log(`${name.padEnd(8)} 클리어 ${wins}/${N} · 도달 웨이브 중앙 ${waves[N >> 1]} (최소 ${waves[0]} 최대 ${waves[N - 1]}) · ${JSON.stringify(why)}`);
}
