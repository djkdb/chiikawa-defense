/* 숫자 표 — 게임의 모든 숫자는 여기 한 곳에서만 정합니다.
   화면의 안내 글(등급 이름·공격 설명·스킬·소환 확률)도 이 표를 읽어 만들어지므로, 여기만 고치면 됩니다.
   균형을 바꿨으면 `node tools/sim.js` 로 「잘하는 봇은 깨고, 손 놓은 봇은 진다」 가 그대로인지 확인하세요. */
(function (root) {
  const T = {
    // 판: 가장자리 한 바퀴가 괴물 길, 안쪽 (cols-2)×(rows-2) 칸이 친구 자리
    board: { cols: 6, rows: 8 },

    waves: 20,          // 마지막 웨이브의 보스를 잡으면 클리어 (그 뒤 「무한 모드」 로 이어 갈 수 있음)
    bossEvery: 5,       // 5·10·15·20 웨이브는 보스 (무한 모드에서도 5마다, 기술은 순환)
    waveTime: 20,       // 웨이브 사이 (초)
    finalTime: 75,      // 마지막 웨이브 제한 시간 — 그 안에 보스를 못 잡으면 패배 (무한 모드엔 없음)
    cap: 40,            // 길 위 괴물 수 상한(보통) — 난이도마다 diffs[].cap 이 덮어씀
    bossWeight: 10,     // 보스 한 마리는 상한에서 이만큼으로 셉니다

    startCoins: 100,
    summonCost: 20,     // 첫 소환 값
    summonStep: 1,      // 소환할 때마다 값이 이만큼 오름
    sell: [10, 30, 80, 200, 500],      // 팔면 받는 동전 (등급별)

    reward: { kill: 4, tank: 8, trait: 5, small: 2, minion: 1, boss: 120, wave: 20 },  // 처치·웨이브 넘김 보상
    // 이자: 웨이브가 넘어갈 때 지금 동전의 rate 만큼(상한 cap) — 모아 두는 것도 전략이 되게
    interest: { rate: 0.05, cap: 30 },

    // ── 난이도 ── hp = 괴물 체력 배수 · cap = 길 위 한도 · chips = 판마다 붙는 변수 칩 수 [최소, 최대]
    // 쉬움·보통은 처음부터 열림, 바로 아래를 깨면 다음이 열림 (기록은 이 브라우저에만)
    diffs: [
      { key: 'easy',   name: '쉬움',   hp: 0.72, cap: 50, chips: [0, 0], color: '#7ccf6a', desc: '처음이라면 여기서' },
      { key: 'normal', name: '보통',   hp: 1,    cap: 40, chips: [0, 0], color: '#5aa7ee', desc: '합성 · 강화를 알면' },
      { key: 'hard',   name: '어려움', hp: 1.18, cap: 40, chips: [1, 1], color: '#ae78ee', desc: '변수 칩 1개 · 확률 업 · 신화가 필요' },
      { key: 'hell',   name: '지옥',   hp: 1.25, cap: 30, chips: [1, 2], color: '#e8566b', desc: '변수 칩 1~2개 · 한도 30' },
    ],
    // 변수 칩 — 어려움·지옥에서 판마다 무작위로. 시작 화면과 멈춤 화면에 보임
    chips: {
      swift:  { name: '바쁜 들판', desc: '괴물 이동 속도 +25%', speed: 1.25 },
      heal:   { name: '약초 들판', desc: '모든 괴물 초당 체력 2% 회복 (화상·독이면 멈춤)', regen: 0.02 },
      poor:   { name: '빈 지갑',   desc: '시작 동전 −30%', start: 0.7 },
      rich:   { name: '살찐 괴물', desc: '괴물 체력 +30% · 동전 +30%', hp: 1.3, coin: 1.3 },
      crowd:  { name: '떼거리',   desc: '웨이브마다 괴물 +20%', count: 1.2 },
      bossy:  { name: '대왕의 밤', desc: '보스 체력 +40%', bossHp: 1.4 },
    },

    // ── 소환 확률 ── 동전으로 레벨 0~5. 표 한 줄 = (일반·희귀·영웅·전설·신화). 신화는 소환으로 안 나옴(레시피만)
    odds: {
      cost: [40, 80, 130, 190, 260],
      table: [
        [0.86, 0.12, 0.02, 0, 0],
        [0.80, 0.165, 0.032, 0.003, 0],
        [0.73, 0.215, 0.048, 0.007, 0],
        [0.65, 0.27, 0.068, 0.012, 0],
        [0.56, 0.32, 0.10, 0.02, 0],
        [0.46, 0.37, 0.14, 0.03, 0],
      ],
    },
    // ── 행운 소환(클로버) ── 클로버 1개로 그 등급 「확정」 을 노림. 실패할 때마다 그 칸 확률 +pity, 성공하면 처음으로
    // swap: 클로버 이만큼으로 「남는 전설」 하나를 신화 레시피에 빠진 친구로 바꿈
    luck: { start: 2, boss: 3, grades: [1, 2, 3], p: [0.6, 0.2, 0.1], pity: 0.05, swap: 1 },

    // ── 신화 ── 서로 다른 「전설」 셋을 모으면 그 레시피의 신화 하나로. 레시피는 이것뿐(합성으로는 안 나옴)
    // need[0] 이 결과 친구. myth: 고유 스킬 (every 번째 공격마다 · 아래 kind 별 숫자)
    recipes: [
      { need: ['chiikawa', 'hachiware', 'usagi'], myth: { kind: 'nova', every: 7, x: 2.2, name: '다 같이 힘내!', desc: '7번째마다 판 위 모든 괴물에게 2.2배' } },
      { need: ['usagi', 'shisa', 'momonga'], myth: { kind: 'stun', every: 8, x: 3, t: 1.4, r: 3.2, name: '야하하하!', desc: '8번째마다 주변 괴물을 1.4초 멈춤 + 3배 (보스는 짧게)' } },
      { need: ['rakko', 'pungdengi', 'chiikawa'], myth: { kind: 'meteor', every: 3, x: 7, name: '별똥 베기', desc: '3번째마다 체력이 가장 많은 괴물에게 7배 (보스 2배 더)' } },
      { need: ['kurimanju', 'hachiware', 'shisa'], myth: { kind: 'feast', haste: 0.3, dmg: 0.2, name: '들판 잔치', desc: '판 위 모든 친구 공속 +30% · 공격력 +20%' } },
    ],
    mergeTop: 3,        // 합성은 전설(3)까지 — 전설 둘을 겹쳐도 신화가 되지 않음

    // 같은 친구가 판에 2명 이상이면 그 친구 공격력 +10%, 4명 이상이면 +25%
    synergy: [[4, 0.25], [2, 0.1]],

    // ── 3택 보상 ── 보스를 잡으면 카드 셋(고정 2 + 도박 1) 중 하나. 값 v 는 웨이브에 따라 커짐
    cards: {
      fixed: [
        { key: 'coins', name: '동전 주머니', desc: '동전 +{v}', v: (w) => 80 + w * 10 },
        { key: 'clover', name: '네잎 클로버', desc: '클로버 +2', v: () => 2 },
        { key: 'epic', name: '영웅 초대장', desc: '빈칸에 무작위 영웅 하나', v: () => 1 },
        { key: 'power', name: '힘내기 응원', desc: '모든 친구 공격력 +12% (이번 판 내내)', v: () => 0.12 },
        { key: 'cheap', name: '소환 할인', desc: '소환 값 −{v}', v: (w) => 4 + Math.floor(w / 5) * 2 },
        { key: 'room', name: '울타리 보수', desc: '길 위 한도 +4', v: () => 4 },
      ],
      gamble: [
        { key: 'legend', name: '반짝 상자', desc: '50%: 무작위 전설 / 50%: 꽝', p: 0.5 },
        { key: 'double', name: '동전 뒤집기', desc: '50%: 동전 두 배 / 50%: 절반', p: 0.5 },
        { key: 'lift', name: '두근 강화', desc: '무작위 친구 하나 — 60%: 등급 +1 / 40%: 사라짐', p: 0.6 },
      ],
    },

    // 등급 — dmg·spd 는 친구 기본값에 곱함. stars 는 칸에 그리는 별 수
    grades: [
      { key: 'common', name: '일반', color: '#b9ab9c', glow: '#efe6db', dmg: 1,   spd: 1,    stars: 1 },
      { key: 'rare',   name: '희귀', color: '#5aa7ee', glow: '#cfe7ff', dmg: 3.2, spd: 1.08, stars: 2 },
      { key: 'epic',   name: '영웅', color: '#ae78ee', glow: '#ead9ff', dmg: 10,  spd: 1.16, stars: 3 },
      { key: 'legend', name: '전설', color: '#ffb428', glow: '#fff0b8', dmg: 32,  spd: 1.25, stars: 4 },
      // 신화 — 레시피로만. 강화는 전설과 같이 받음(upGroup)
      { key: 'myth',   name: '신화', color: '#ff5fa2', glow: '#ffe3f0', dmg: 220, spd: 1.4,  stars: 5 },
    ],
    upGroup: [0, 1, 2, 3, 3],   // 등급 → 강화 계열 (신화는 전설 강화를 같이 받음)

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
      hp: 70, hpGrow: 1.197, speed: 1.05,  // 칸/초 · 보통(×1) 기준. 새 기능(확률 업·클로버·신화·보상·이자)만큼 예전(48)보다 단단하게 — 초반은 그대로 두고 뒤로 갈수록 (tools/sim.js 로 맞춤)
      count: (w) => 10 + Math.floor(w * 1.2),
      gap: 0.75,                             // 나오는 간격 (초)
      kinds: {
        blob: { name: '꼬물이', hp: 1,   speed: 1,    from: 1 },
        tank: { name: '단단이', hp: 2.6, speed: 0.72, from: 7 },
        minion: { name: '졸개', hp: 0.45, speed: 1.15 },   // 소환 보스가 부름
        boss: { name: '대왕', hp: 16,  speed: 0.6 },
      },
    },
    // ── 괴물 특성 ── from 웨이브부터 섞임. 웨이브마다 1개(8웨이브부터 2개)를 골라 그 웨이브 괴물의 share 만큼에 붙임.
    // 다음 웨이브 특성은 미리 보여 줌. 상성: 장갑은 화상·독·관통에 안 막힘 / 재생은 화상·독이 붙어 있으면 멈춤
    traitShare: 0.55,
    traits: {
      fast:   { name: '고속', from: 2,  speed: 1.6, hp: 0.75, desc: '1.6배 빠름 · 체력 −25% — 하치와레 둔화로' },
      armor:  { name: '장갑', from: 4,  armor: 0.5, desc: '일반 공격 피해 절반 — 화상·독·관통은 그대로' },
      regen:  { name: '재생', from: 6,  regen: 0.02, desc: '초당 체력 2% 회복 — 화상·독이 붙으면 멈춤' },
      split:  { name: '분열', from: 8,  n: 2, hp: 0.35, desc: '쓰러지면 작은 젤리 둘 — 범위 공격으로' },
      revive: { name: '부활', from: 11, hp: 0.5, downT: 1.1, desc: '한 번 쓰러지면 체력 50%로 일어남' },
    },
    // ── 보스 기술 ── 5·10·15·20 웨이브 차례로, 무한 모드는 순환. first 초 뒤 첫 기술, 그 뒤 every 초마다.
    // warn 초 동안 「준비」(멈춰 서서 예고) → 쓰는 중 cast 초
    bosses: [
      { key: 'silence', name: '쉿쉿 대왕', skill: '침묵', first: 4, every: 9, warn: 2, cast: 0.8, n: 2, t: 3, desc: '친구 2칸을 3초 동안 봉인' },
      { key: 'summon',  name: '와글 대왕', skill: '소환', first: 4, every: 9, warn: 1.6, cast: 0.8, n: 5, desc: '졸개 5마리를 부름' },
      { key: 'heal',    name: '새싹 대왕', skill: '회복', first: 5, every: 10, warn: 2, cast: 0.9, x: 0.2, desc: '체력 20% 회복' },
      { key: 'shuffle', name: '빙글 대왕', skill: '셔플', first: 5, every: 11, warn: 2.2, cast: 0.9, desc: '칸 위 친구 자리를 마구 섞음' },
    ],

    // 화면 · 연출 (게임 규칙과는 무관)
    projSpeed: 9,       // 투사체 칸/초
    pierceSpeed: 7,     // 관통 바람 칸/초
    speeds: [1, 2, 3],  // 배속 버튼이 돌아가는 값
  };
  root.CD_TABLE = T;
  if (typeof module !== 'undefined') module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
