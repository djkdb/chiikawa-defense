/* 효과음 — 파일 없이 Web Audio 로 그 자리에서 만듭니다.
   전부 음높이가 있는 소리(사각·삼각·사인파)만 씁니다. 잡음으로 만든 「쉭」 같은 바람 소리는 쓰지 않습니다.
   브라우저는 사람이 한 번 누르기 전엔 소리를 막으므로, 첫 입력 때 unlock() 으로 엽니다.
   같은 소리가 한 프레임에 수십 번 겹치지 않도록 종류마다 최소 간격(gap)을 둡니다. */
(function () {
  const CD = (window.CD = window.CD || {});
  let ac = null, bus = null, on = true;
  const last = {};

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      bus = ac.createGain(); bus.gain.value = 0.5; bus.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, dur, o) {
    o = o || {};
    const a = ctx(); if (!a) return;
    const t = a.currentTime + (o.at || 0);
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
    const v = o.vol != null ? o.vol : 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 → Hz

  const SOUNDS = {
    // 톡 — 맞힘 (치이카와 기본)
    hit: { gap: 0.05, f() { tone(N(84), 0.05, { type: 'triangle', vol: 0.05, to: N(76) }); } },
    crit: { gap: 0.08, f() { tone(N(91), 0.06, { type: 'square', vol: 0.05 }); tone(N(96), 0.09, { type: 'triangle', vol: 0.06, at: 0.04 }); } },
    splash: { gap: 0.12, f() { tone(N(72), 0.09, { type: 'sine', vol: 0.08, to: N(84) }); tone(N(79), 0.08, { type: 'sine', vol: 0.05, at: 0.05 }); } },
    zap: { gap: 0.1, f() { tone(N(88), 0.04, { type: 'square', vol: 0.035 }); tone(N(93), 0.04, { type: 'square', vol: 0.035, at: 0.035 }); tone(N(100), 0.05, { type: 'square', vol: 0.03, at: 0.07 }); } },
    thud: { gap: 0.1, f() { tone(N(50), 0.12, { type: 'triangle', vol: 0.14, to: N(38) }); } },
    fire: { gap: 0.12, f() { tone(N(67), 0.1, { type: 'sawtooth', vol: 0.025, to: N(74) }); } },
    // 독 — 낮은 보글 두 번 (사인파 음높이만 오르내림)
    psn: { gap: 0.18, f() { tone(N(55), 0.06, { type: 'sine', vol: 0.07, to: N(62) }); tone(N(58), 0.06, { type: 'sine', vol: 0.06, at: 0.07, to: N(65) }); } },
    // 스킬 — 반짝 올라가는 두 음
    skill: { gap: 0.12, f() { tone(N(84), 0.06, { type: 'square', vol: 0.05 }); tone(N(91), 0.12, { type: 'triangle', vol: 0.07, at: 0.05 }); } },
    // 큰 물결 — 아래로 퐁 떨어지는 사인 두 개
    water: { gap: 0.15, f() { tone(N(86), 0.14, { type: 'sine', vol: 0.09, to: N(67) }); tone(N(79), 0.16, { type: 'sine', vol: 0.06, at: 0.08, to: N(62) }); } },
    // 회오리 — 바람 소리 대신 음높이가 빙글 올라가는 삼각파 (잡음 아님)
    gust: { gap: 0.15, f() { [0, 0.06, 0.12].forEach((t, i) => tone(N(72 + i * 5), 0.09, { type: 'triangle', vol: 0.05, at: t, to: N(79 + i * 5) })); } },
    // 건배 — 짠! 높은 두 음 동시에
    cheers: { gap: 0.2, f() { tone(N(93), 0.12, { type: 'triangle', vol: 0.06 }); tone(N(97), 0.12, { type: 'triangle', vol: 0.05 }); tone(N(100), 0.16, { type: 'sine', vol: 0.05, at: 0.08 }); } },
    // 뿅 — 처치
    pop: { gap: 0.05, f() { tone(N(76), 0.07, { type: 'square', vol: 0.05, to: N(88) }); tone(N(91), 0.06, { type: 'triangle', vol: 0.05, at: 0.05 }); } },
    coin: { gap: 0.06, f() { tone(N(88), 0.05, { type: 'square', vol: 0.04 }); tone(N(95), 0.09, { type: 'square', vol: 0.04, at: 0.05 }); } },
    // 소환 — 올라가는 세 음
    summon: { gap: 0.05, f() { [72, 76, 79, 84].forEach((n, i) => tone(N(n), 0.08, { type: 'triangle', vol: 0.09, at: i * 0.045 })); } },
    // 합성 — 반짝이는 화음
    merge: { gap: 0.05, f() { [79, 83, 86, 91].forEach((n, i) => tone(N(n), 0.16, { type: 'triangle', vol: 0.07, at: i * 0.05 })); tone(N(98), 0.2, { type: 'sine', vol: 0.05, at: 0.22 }); } },
    rare: { gap: 0.05, f() { [76, 79, 84, 88].forEach((n, i) => tone(N(n), 0.14, { type: 'square', vol: 0.04, at: 0.25 + i * 0.06 })); } },
    legend: { gap: 0.05, f() { [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone(N(n), 0.22, { type: 'square', vol: 0.045, at: 0.2 + i * 0.07 })); tone(N(60), 0.6, { type: 'triangle', vol: 0.1, at: 0.2 }); } },
    up: { gap: 0.05, f() { tone(N(79), 0.07, { type: 'square', vol: 0.05 }); tone(N(86), 0.12, { type: 'square', vol: 0.05, at: 0.06 }); } },
    sell: { gap: 0.05, f() { tone(N(84), 0.06, { type: 'square', vol: 0.05 }); tone(N(79), 0.08, { type: 'square', vol: 0.05, at: 0.06 }); } },
    nope: { gap: 0.15, f() { tone(N(55), 0.09, { type: 'square', vol: 0.06 }); tone(N(52), 0.12, { type: 'square', vol: 0.06, at: 0.09 }); } },
    pick: { gap: 0.04, f() { tone(N(81), 0.04, { type: 'triangle', vol: 0.06 }); } },
    wave: { gap: 0.3, f() { tone(N(67), 0.1, { type: 'triangle', vol: 0.09 }); tone(N(72), 0.14, { type: 'triangle', vol: 0.09, at: 0.1 }); } },
    // 보스 — 낮은 두 번 쿵쿵
    boss: { gap: 0.5, f() { [0, 0.28, 0.56].forEach((t, i) => tone(N(i === 2 ? 43 : 40), 0.24, { type: 'square', vol: 0.09, at: t, to: N(34) })); } },
    // ── v2: 특성 · 보스 기술 · 신화 · 행운 (전부 음높이 있는 파형, 잡음 없음) ──
    tink: { gap: 0.12, f() { tone(N(98), 0.04, { type: 'square', vol: 0.03 }); tone(N(103), 0.05, { type: 'triangle', vol: 0.03, at: 0.03 }); } },   // 장갑에 막힘
    revive: { gap: 0.2, f() { [60, 64, 67, 72, 76].forEach((n, i) => tone(N(n), 0.1, { type: 'sine', vol: 0.06, at: i * 0.06 })); } },
    split: { gap: 0.12, f() { tone(N(79), 0.06, { type: 'sine', vol: 0.07, to: N(72) }); tone(N(84), 0.06, { type: 'sine', vol: 0.06, at: 0.06, to: N(77) }); } },
    // 보스 기술 예고 — 낮게 두 번 올라가는 경고음
    warn: { gap: 0.4, f() { [0, 0.22].forEach((t) => tone(N(57), 0.16, { type: 'square', vol: 0.06, at: t, to: N(64) })); } },
    silence: { gap: 0.4, f() { tone(N(76), 0.3, { type: 'triangle', vol: 0.08, to: N(52) }); tone(N(71), 0.3, { type: 'sine', vol: 0.05, at: 0.05, to: N(47) }); } },
    bsummon: { gap: 0.4, f() { [55, 59, 62, 67, 71].forEach((n, i) => tone(N(n), 0.07, { type: 'square', vol: 0.04, at: i * 0.05 })); } },
    bheal: { gap: 0.4, f() { [72, 76, 79, 84].forEach((n, i) => tone(N(n), 0.18, { type: 'sine', vol: 0.06, at: i * 0.08 })); } },
    shuffle: { gap: 0.4, f() { [79, 74, 81, 72, 83, 76].forEach((n, i) => tone(N(n), 0.05, { type: 'square', vol: 0.04, at: i * 0.045 })); } },
    luckwin: { gap: 0.1, f() { [84, 88, 91, 96].forEach((n, i) => tone(N(n), 0.12, { type: 'triangle', vol: 0.07, at: i * 0.06 })); } },
    lucklose: { gap: 0.1, f() { tone(N(67), 0.12, { type: 'triangle', vol: 0.07 }); tone(N(62), 0.18, { type: 'triangle', vol: 0.06, at: 0.12 }); } },
    stun: { gap: 0.2, f() { tone(N(88), 0.08, { type: 'square', vol: 0.04 }); tone(N(81), 0.14, { type: 'triangle', vol: 0.06, at: 0.06 }); } },
    nova: { gap: 0.3, f() { [72, 79, 84, 88, 91].forEach((n, i) => tone(N(n), 0.25, { type: 'triangle', vol: 0.05, at: i * 0.03 })); tone(N(48), 0.4, { type: 'sine', vol: 0.1 }); } },
    myth: { gap: 0.5, f() { [72, 76, 79, 83, 86, 91, 95, 98].forEach((n, i) => tone(N(n), 0.25, { type: i % 2 ? 'triangle' : 'square', vol: 0.045, at: 0.15 + i * 0.07 })); tone(N(48), 0.9, { type: 'triangle', vol: 0.1, at: 0.15 }); tone(N(55), 0.9, { type: 'sine', vol: 0.06, at: 0.15 }); } },
    win: { gap: 1, f() { [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => tone(N(n), 0.18, { type: 'square', vol: 0.06, at: i * 0.12 })); tone(N(48), 1.0, { type: 'triangle', vol: 0.1, at: 0.84 }); } },
    lose: { gap: 1, f() { [67, 64, 60, 55].forEach((n, i) => tone(N(n), 0.26, { type: 'triangle', vol: 0.1, at: i * 0.2 })); } },
  };

  CD.sfx = {
    play(name) {
      if (!on) return;
      const s = SOUNDS[name]; if (!s) return;
      const a = ctx(); if (!a) return;
      const now = a.currentTime;
      if (last[name] != null && now - last[name] < s.gap) return;
      last[name] = now;
      s.f();
    },
    unlock() { if (on) ctx(); },
    get on() { return on; },
    set on(v) { on = !!v; if (on) ctx(); },
    names: Object.keys(SOUNDS),
  };
})();
