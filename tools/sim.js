/* 균형 확인 — 화면 없이 규칙만 돌려 봅니다. 난이도 넷 × 봇 다섯 × 씨앗 N 개.
     node tools/sim.js            # 씨앗 24개
     node tools/sim.js 40 --md    # 씨앗 40개 · README 에 붙일 표(마크다운)
     node tools/sim.js 24 --diff 3 --bot good   # 하나만
   목표 (README 「밸런스」):
     쉬움 = 느린 봇도 거의 클리어 · 보통 = 잘하는 봇 클리어 · 느린 봇 절반 · 어려움 = 잘하는 봇만 · 지옥 = 잘하는 봇도 일부만
   봇은 판을 읽기만 하고 사람이 누르는 것(소환·합성·강화·확률 업·행운 소환·신화 레시피·3택 보상)만 합니다.
   table.js 숫자를 바꿨으면 이걸로 목표가 그대로인지 봅니다. */
const T = require('../js/table.js');
const { Game } = require('../js/core.js');

// 보상 카드 점수 (잘하는 봇) — 공격력·영웅·전설 상자를 먼저, 동전은 그다음
const CARD = { power: 6, legend: 5, epic: 4.5, coins: 3, clover: 2.6, room: 2.2, cheap: 1.8, lift: 1.2, double: 1 };

// 확률 업을 사는 웨이브 (레벨 0→1 은 ODDS_AT[0] 웨이브부터)
const ODDS_AT = [2, 6, 10];
function mergeAll(g) {
  for (let k = 0; k < 40; k++) {
    let did = false;
    for (let i = 0; i < g.slots.length; i++) { const j = g.mateOf(i); if (j >= 0) { g.merge(i, j); did = true; break; } }
    if (!did) break;
  }
}
// 잘하는 사람의 한 차례: 보상 고르기 → 신화 → 합성 → 행운 소환 → 확률 업 / 강화 / 소환 → 꽉 차면 팔기
function smart(g, o) {
  o = o || {};
  if (g.pick) {
    let k = 0;
    if (!o.firstCard) g.pick.forEach((c, i) => { if ((CARD[c.key] || 0) > (CARD[g.pick[k].key] || 0)) k = i; });
    g.choose(k);
  }
  for (const r of g.readyRecipes()) g.craft(r);
  mergeAll(g);
  // 신화: 빠진 재료를 남는 전설 + 클로버로 채울 수 있는 레시피가 있으면 채워서 만듦
  const legends = g.slots.filter((s) => s.u && s.u.g === T.mergeTop).length;
  if (o.luck !== false && legends >= 3) {
    T.recipes.forEach((_, r) => {
      const N = g.recipeNeed(r);
      if (N.miss.length && N.miss.length <= N.spare.length && g.clovers >= N.miss.length * T.luck.swap) {
        while (g.recipeNeed(r).miss.length) if (!g.swapFor(r).ok) break;
      }
      if (g.recipeSlots(r)) g.craft(r);
    });
  }
  // 전설이 둘 이상이면 클로버는 신화 재료 바꾸기용으로 아껴 둠
  if (o.luck !== false && g.clovers > (legends >= 2 ? 2 : 0) && g.empty().length) {
    // 전설 칸은 실패가 쌓일수록 좋아짐 — 초반엔 영웅, 12웨이브부터 전설
    g.gamble(g.wave >= 12 ? 2 : 1);
  }
  const pow = T.upgrade.base.map(() => 0);
  g.slots.forEach((s) => { if (s.u) pow[T.upGroup[s.u.g]] += T.grades[s.u.g].dmg; });
  // 확률 업: 정해 둔 웨이브에 한 단계씩, 동전이 넉넉할 때 (많이 사면 오히려 강화가 밀려 약해짐 — sim 으로 확인)
  const oddsAt = o.oddsAt || ODDS_AT;
  if (o.odds !== false && g.oddsLv < oddsAt.length && g.wave >= oddsAt[g.oddsLv] && g.coins >= g.oddsCost() + 20) { g.oddsUp(); return; }
  // 동전 하나당 늘어나는 힘: 강화 = 그 계열 힘의 20% / 강화값, 소환 = 일반 하나(≈1.3 기대) / 소환값
  let best = null, bestV = 1.3 / g.cost();
  for (let k = 0; k < pow.length; k++) { const v = (T.upgrade.dmg * pow[k]) / g.upCost(k); if (v > bestV) { bestV = v; best = k; } }
  if (best != null) { if (g.coins >= g.upCost(best)) g.upgrade(best); }
  else if (g.empty().length && g.coins >= g.cost()) g.summon();
  if (!g.empty().length) {
    if (best != null && g.coins >= g.upCost(best)) g.upgrade(best);
    else if (g.coins > 150) { // 꽉 찼고 합칠 짝도 없으면 가장 약한 일반 하나 팔기
      const i = g.slots.findIndex((s) => s.u && s.u.g === 0);
      if (i >= 0) g.sell(i);
    }
  }
}

const BOTS = {
  // 잘함: 0.05초마다 생각 · 모든 기능을 씀
  good(g) { smart(g); },
  // 느림: 딴짓하는 사람처럼 3초에 한 번만, 보상은 첫 카드, 확률 업 · 행운 소환은 안 씀(있는 줄 모름)
  slow(g, t) { if (Math.floor(t / 3) !== Math.floor((t - 0.05) / 3)) smart(g, { firstCard: true, odds: false, luck: false }); },
  // 대충 하는 사람(인스타로 온 첫 판 · 2026-10-30 페르소나): 2초에 한 번 — 빈칸 있으면 소환, 보이는 짝은 전부 합성, 꽉 차면 싼 강화부터.
  // 잘하는 봇의 「동전당 힘」 셈은 합성으로 생기는 값을 안 쳐서, 이렇게 소환만 몰아도 잘하는 봇만큼 깸 — 난이도는 이 봇으로도 봄
  casual(g, t) {
    if (Math.floor(t / 2) === Math.floor((t - 0.05) / 2)) return;
    if (g.pick) g.choose(0);
    mergeAll(g);
    if (g.empty().length) { if (g.coins >= g.cost()) g.summon(); }
    else for (let k = 0; k < T.upgrade.base.length; k++) if (g.coins >= g.upCost(k)) { g.upgrade(k); break; }
  },
  // 합성 안 함: 소환만 (보상은 첫 카드)
  nomerge(g) { if (g.pick) g.choose(0); if (g.empty().length && g.coins >= g.cost()) g.summon(); },
  // 가만히: 처음 다섯 번만 소환하고 손 놓음
  idle(g) { if (g.pick) g.choose(0); if (g.summons < 5 && g.coins >= g.cost()) g.summon(); },
};
const NAMES = { good: '잘하는 봇', slow: '느린 봇', casual: '대충 소환 봇', nomerge: '합성 안 하는 봇', idle: '가만히 봇' };

function play(diff, bot, seed) {
  const g = new Game({ seed, diff });
  let t = 0;
  const dt = 0.05;
  while (!g.over && t < 4000) { BOTS[bot](g, t); g.step(dt); t += dt; g.ev.length = 0; }
  return g;
}

module.exports = { BOTS, play, smart };
if (require.main === module) main();
function main() {
const args = process.argv.slice(2);
const N = +args.find((a) => /^\d+$/.test(a)) || 24;
const md = args.includes('--md');
const onlyD = args.includes('--diff') ? +args[args.indexOf('--diff') + 1] : null;
const onlyB = args.includes('--bot') ? args[args.indexOf('--bot') + 1] : null;
const rows = [];
T.diffs.forEach((D, di) => {
  if (onlyD != null && di !== onlyD) return;
  for (const name of Object.keys(BOTS)) {
    if (onlyB && name !== onlyB) continue;
    let wins = 0, myth = 0;
    const waves = [], why = {};
    for (let s = 1; s <= N; s++) {
      const g = play(di, name, s * 7919);
      if (g.over === 'win') wins++;
      if (g.made.length) myth++;
      waves.push(g.wave);
      const w = g.over === 'win' ? '클리어' : g.loseWhy.startsWith('마지막') ? '시간 초과' : '한도';
      why[w] = (why[w] || 0) + 1;
    }
    waves.sort((a, b) => a - b);
    const r = { diff: D.name, bot: NAMES[name], wins, N, med: waves[N >> 1], min: waves[0], max: waves[N - 1], myth, why };
    rows.push(r);
    if (!md) console.log(`${D.name.padEnd(4)} ${NAMES[name].padEnd(9)} 클리어 ${String(wins).padStart(2)}/${N} · 도달 웨이브 중앙 ${r.med} (최소 ${r.min} 최대 ${r.max}) · 신화 만든 판 ${myth} · ${JSON.stringify(why)}`);
  }
});
if (md) {
  console.log('| 난이도 | 봇 | 클리어 | 도달 웨이브 중앙 (최소~최대) | 신화 만든 판 |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.diff} | ${r.bot} | ${r.wins}/${r.N} (${Math.round((r.wins / r.N) * 100)}%) | ${r.med} (${r.min}~${r.max}) | ${r.myth} |`);
}
}
