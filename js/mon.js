/* 괴물 특성 5종 · 보스 4종 그림 — 사람이 만든 초록 바탕 시트를 tools/monsters_slice.py 로 자른 PNG.
   목록은 assets/monsters/monsters.js (window.CD_MON_FILES). 특성 없는 일반 괴물(꼬물이·단단이)은 art.js 가 그린 그대로.
   프레임 = { img, w, h, ax, ay } — 전부 「도트」 단위(그림 1px = k 도트)라 그리는 쪽은 drawImage 크기만 맞추면 됩니다.
   시트 괴물 · 보스 걷기 모두 왼쪽을 봅니다 — 길 방향에 따라 좌우 반전은 game.js 가. */
(function () {
  const CD = (window.CD = window.CD || {});
  const M = { ready: false, mon: {}, boss: {} };

  M.load = function (done) {
    const F = window.CD_MON_FILES;
    if (!F) { done(); return; }
    const k = F.k || 1, jobs = [];
    const one = (e, put) => jobs.push(new Promise((ok) => {
      const im = new Image();
      im.onload = () => { put({ img: im, w: e.w * k, h: e.h * k, ax: e.ax * k, ay: e.ay * k }); ok(); };
      im.onerror = () => ok();   // 한 장 못 불러오면 그 프레임만 빠짐 (일반 괴물 그림으로 대신)
      im.src = 'assets/monsters/' + e.f;
    }));
    for (const grp of ['mon', 'boss']) {
      for (const name in F[grp]) {
        const dst = (M[grp][name] = {});
        for (const act in F[grp][name]) { dst[act] = []; F[grp][name][act].forEach((e, i) => one(e, (f) => (dst[act][i] = f))); }
      }
    }
    Promise.all(jobs).then(() => {
      for (const grp of ['mon', 'boss']) for (const name in M[grp]) for (const act in M[grp][name]) M[grp][name][act] = M[grp][name][act].filter(Boolean);
      M.ready = true;
      done();
    });
  };
  // 이름 있는 동작의 i 번째(돌아가며). 없으면 걷기로
  M.frame = function (grp, name, act, i) {
    const S = M[grp][name];
    if (!S) return null;
    const L = (S[act] && S[act].length ? S[act] : S.walk) || [];
    return L.length ? L[((i % L.length) + L.length) % L.length] : null;
  };
  CD.mon = M;
})();
