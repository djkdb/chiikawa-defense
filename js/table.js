/* 숫자 표 — 게임의 모든 숫자는 여기 한 곳에서만 정합니다.
   화면의 안내 글(등급 이름·공격 설명·소환 확률)도 이 표를 읽어 만들어지므로, 여기만 고치면 됩니다.
   균형을 바꿨으면 `node tools/sim.js` 로 「잘하는 봇은 깨고, 손 놓은 봇은 진다」 가 그대로인지 확인하세요. */
(function (root) {
  const T = {
    // 판: 가장자리 한 바퀴가 괴물 길, 안쪽 (cols-2)×(rows-2) 칸이 아군 자리
    board: { cols: 6, rows: 8 },

    waves: 20,          // 이만큼 버티고 마지막 보스를 잡으면 클리어
    bossEvery: 5,       // 5·10·15·20 웨이브는 보스
    waveTime: 20,       // 웨이브 사이 (초)
    finalTime: 75,      // 마지막 웨이브 제한 시간 — 넘기면 패배
    cap: 40,            // 길 위 괴물 수 상한 — 이 수에 닿으면 패배
    bossWeight: 10,     // 보스 한 마리는 상한에서 이만큼으로 셉니다

    startCoins: 100,
    summonCost: 20,     // 첫 소환 값
    summonStep: 1,      // 소환할 때마다 값이 이만큼 오름
    // 소환으로 나오는 등급 확률 (일반·희귀·영웅·전설). 전설은 합성으로만
    summonOdds: [0.86, 0.12, 0.02, 0],
    sell: [10, 30, 80, 200],      // 팔면 받는 동전 (등급별)

    reward: { kill: 4, fast: 4, tank: 8, boss: 120, wave: 20 },  // 처치·웨이브 넘김 보상

    // 등급 — dmg·spd 는 캐릭터 기본값에 곱함
    grades: [
      { key: 'common',    name: '일반', color: '#b9ab9c', glow: '#efe6db', dmg: 1,   spd: 1 },
      { key: 'rare',      name: '희귀', color: '#5aa7ee', glow: '#cfe7ff', dmg: 3.2, spd: 1.08 },
      { key: 'epic',      name: '영웅', color: '#ae78ee', glow: '#ead9ff', dmg: 10,  spd: 1.16 },
      { key: 'legend',    name: '전설', color: '#ffb428', glow: '#fff0b8', dmg: 32,  spd: 1.25 },
    ],

    // 캐릭터 — 공격 성격. range 는 칸 수, rate 는 1초에 몇 번
    // kind: single(단일) splash(범위) chain(튕김) burn(화상 범위) mark(약화)
    chars: [
      { id: 'chiikawa',  name: '치이카와', dmg: 10, rate: 1.0,  range: 2.2, kind: 'single',
        desc: '무난한 한 방씩', color: '#ffffff', ink: '#f2a7b8' },
      { id: 'hachiware', name: '하치와레', dmg: 6,  rate: 0.8,  range: 2.0, kind: 'splash', splash: 0.9, slow: 0.4, slowT: 1.6,
        desc: '범위 공격 + 둔화', color: '#8fb8e6', ink: '#4f7fbf' },
      { id: 'usagi',     name: '우사기',   dmg: 3.6, rate: 2.8, range: 1.8, kind: 'single', crit: 0.22, critX: 3,
        desc: '빠른 연타 + 치명타', color: '#fbe39a', ink: '#d9a93c' },
      { id: 'rakko',     name: '랏코',     dmg: 34, rate: 0.36, range: 3.4, kind: 'single', bossX: 2,
        desc: '먼 데서 센 한 방 · 보스 2배', color: '#f3dfbf', ink: '#8a6a4a' },
      { id: 'momonga',   name: '모몽가',   dmg: 7,  rate: 0.9,  range: 2.2, kind: 'chain', chains: 3, chainFall: 0.75,
        desc: '세 마리까지 튕김', color: '#cfe6fb', ink: '#6aa6dc' },
      { id: 'furuhonya', name: '후루혼야', dmg: 6,  rate: 0.8,  range: 2.4, kind: 'mark', vuln: 0.3, vulnT: 3,
        desc: '맞은 괴물이 받는 피해 +30%', color: '#c9a27c', ink: '#7a5536' },
      { id: 'kurimanju', name: '쿠리만쥬', dmg: 8,  rate: 0.9,  range: 2.0, kind: 'single', bonusCoin: 2,
        desc: '잡으면 동전 +2', color: '#f2d39c', ink: '#8b5a34' },
      { id: 'shisa',     name: '시사',     dmg: 4,  rate: 0.85, range: 1.9, kind: 'burn', splash: 0.75, burn: 0.9, burnT: 2.5,
        desc: '불꽃 범위 + 화상', color: '#ffb27a', ink: '#d85a2a' },
    ],

    // 강화 — 등급 계열마다 따로 (합성하면 캐릭터가 무작위로 바뀌므로 캐릭터가 아니라 등급에 붙입니다).
    // 단계마다 그 등급 아군 모두의 공격력 +dmg. 값은 base + step × 지금 단계
    upgrade: { base: [30, 50, 80, 120], step: [25, 40, 60, 90], dmg: 0.2, max: 10 },

    // 괴물 — hp 는 웨이브마다 hpGrow 배씩
    enemy: {
      hp: 48, hpGrow: 1.155, speed: 1.05,   // 칸/초
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
    speeds: [1, 2, 3],  // 배속 버튼이 돌아가는 값
  };
  root.CD_TABLE = T;
  if (typeof module !== 'undefined') module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
