/* 숫자 표 — 게임의 모든 숫자는 여기 한 곳에서만 정합니다.
   화면의 안내 글(등급 이름·공격 설명·스킬·소환 확률)도 이 표를 읽어 만들어지므로, 여기만 고치면 됩니다.
   균형을 바꿨으면 `node tools/sim.js` 로 「잘하는 봇은 깨고, 손 놓은 봇은 진다」 가 그대로인지 확인하세요. */
(function (root) {
  const T = {
    // 판: 가장자리 한 바퀴가 괴물 길, 안쪽 (cols-2)×(rows-2) 칸이 친구 자리
    board: { cols: 6, rows: 8 },

    waves: 20,          // 마지막 웨이브의 보스를 잡으면 클리어
    bossEvery: 5,       // 5·10·15·20 웨이브는 보스
    waveTime: 20,       // 웨이브 사이 (초)
    finalTime: 75,      // 마지막 웨이브 제한 시간 — 그 안에 보스를 못 잡으면 패배
    cap: 40,            // 길 위 괴물 수 상한 — 이 수에 닿으면 패배
    bossWeight: 10,     // 보스 한 마리는 상한에서 이만큼으로 셉니다

    startCoins: 100,
    summonCost: 20,     // 첫 소환 값
    summonStep: 1,      // 소환할 때마다 값이 이만큼 오름
    // 소환으로 나오는 등급 확률 (일반·희귀·영웅·전설). 전설은 합성으로만
    summonOdds: [0.86, 0.12, 0.02, 0],
    sell: [10, 30, 80, 200],      // 팔면 받는 동전 (등급별)

    reward: { kill: 4, fast: 4, tank: 8, boss: 120, wave: 20 },  // 처치·웨이브 넘김 보상

    // 등급 — dmg·spd 는 친구 기본값에 곱함. stars 는 칸에 그리는 별 수
    grades: [
      { key: 'common', name: '일반', color: '#b9ab9c', glow: '#efe6db', dmg: 1,   spd: 1,    stars: 1 },
      { key: 'rare',   name: '희귀', color: '#5aa7ee', glow: '#cfe7ff', dmg: 3.2, spd: 1.08, stars: 2 },
      { key: 'epic',   name: '영웅', color: '#ae78ee', glow: '#ead9ff', dmg: 10,  spd: 1.16, stars: 3 },
      { key: 'legend', name: '전설', color: '#ffb428', glow: '#fff0b8', dmg: 32,  spd: 1.25, stars: 4 },
    ],

    // 친구 — 공격 성격. range 는 칸 수, rate 는 1초에 몇 번.
    // kind: single(단일) splash(범위·둔화) burn(불 범위·화상) pierce(일직선 관통) poison(독 쌓기)
    // skill: every 번째 공격마다 강한 한 방(그림은 skill 프레임). x = 피해 배수, 나머지는 kind 별 덧붙임
    chars: [
      { id: 'chiikawa',  name: '치이카와', dmg: 10, rate: 1.0, range: 2.2, kind: 'single',
        desc: '무난한 한 방씩', skill: { every: 6, x: 4, name: '힘껏 콩!', desc: '6번째마다 4배 한 방' } },
      { id: 'hachiware', name: '하치와레', dmg: 6, rate: 0.8, range: 2.0, kind: 'splash', splash: 0.9, slow: 0.35, slowT: 1.6,
        desc: '물방울 범위 공격 + 둔화', skill: { every: 5, x: 2.5, splash: 1.5, slow: 0.6, name: '큰 물결!', desc: '5번째마다 넓은 물결 · 강한 둔화' } },
      { id: 'usagi',     name: '우사기', dmg: 3.6, rate: 2.8, range: 1.8, kind: 'single', crit: 0.22, critX: 3,
        desc: '빠른 연타 + 치명타 22%', skill: { every: 12, x: 3, crit: true, name: '야하!', desc: '12번째마다 확정 치명타 3배' } },
      { id: 'shisa',     name: '시사', dmg: 4, rate: 0.85, range: 1.9, kind: 'burn', splash: 0.75, burn: 0.9, burnT: 2.5,
        desc: '불꽃 범위 + 화상', skill: { every: 5, x: 3, splash: 1.4, name: '불꽃 화르륵!', desc: '5번째마다 큰 불꽃 3배' } },
      { id: 'momonga',   name: '모몽가', dmg: 7, rate: 0.9, range: 2.4, kind: 'pierce', pierce: 1.6, width: 0.42,
        desc: '바람이 일직선으로 꿰뚫음', skill: { every: 5, x: 2, splash: 1.1, push: 0.8, name: '회오리!', desc: '5번째마다 회오리 · 괴물을 뒤로 밀어냄' } },
      { id: 'rakko',     name: '랏코', dmg: 34, rate: 0.36, range: 3.4, kind: 'single', bossX: 2,
        desc: '먼 데서 센 한 방 · 보스에게 2배', skill: { every: 4, x: 3, name: '별 베기!', desc: '4번째마다 3배 (보스면 6배)' } },
      { id: 'pungdengi', name: '풍뎅이', dmg: 3, rate: 0.9, range: 2.2, kind: 'poison', psn: 0.7, psnT: 4, psnMax: 5,
        desc: '맞히면 독이 쌓임 (최대 5겹)', skill: { every: 5, x: 1, splash: 1.2, stacks: 3, name: '네잎 독풀!', desc: '5번째마다 주변 괴물에 독 3겹' } },
      { id: 'kurimanju', name: '쿠리만쥬', dmg: 5, rate: 0.8, range: 2.0, kind: 'single', aura: 1.5, haste: [0.15, 0.2, 0.28, 0.4],
        desc: '바로 옆 친구들 공격 속도 +15~40%', skill: { every: 6, x: 2, haste: 0.5, hasteT: 3, name: '건배!', desc: '6번째마다 옆 친구들 3초간 공속 +50%' } },
    ],

    // 강화 — 등급 계열마다 따로 (합성하면 친구가 무작위로 바뀌므로 친구가 아니라 등급에 붙입니다).
    // 단계마다 그 등급 친구 모두의 공격력 +dmg. 값은 base + step × 지금 단계
    upgrade: { base: [30, 50, 80, 120], step: [25, 40, 60, 90], dmg: 0.2, max: 10 },

    // 괴물 — hp 는 웨이브마다 hpGrow 배씩
    enemy: {
      hp: 48, hpGrow: 1.165, speed: 1.05,   // 칸/초
      count: (w) => 10 + Math.floor(w * 1.2),
      gap: 0.75,                             // 나오는 간격 (초)
      kinds: {
        blob: { name: '꼬물이', hp: 1,   speed: 1,    from: 1 },
        fast: { name: '날쌘이', hp: 0.6, speed: 1.65, from: 3 },
        tank: { name: '단단이', hp: 2.6, speed: 0.72, from: 7 },
        boss: { name: '키메라', hp: 16,  speed: 0.6 },
      },
    },

    // 화면 · 연출 (게임 규칙과는 무관)
    projSpeed: 9,       // 투사체 칸/초
    pierceSpeed: 7,     // 관통 바람 칸/초
    speeds: [1, 2, 3],  // 배속 버튼이 돌아가는 값
  };
  root.CD_TABLE = T;
  if (typeof module !== 'undefined') module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
