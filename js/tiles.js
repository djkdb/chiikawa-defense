/* 판 바닥 — 사람이 ChatGPT 로 만든 타일 · 소품 시트(tools/tiles_slice.py → assets/tiles/)로 굽습니다.
   가장자리 한 바퀴(괴물 길) = 흙길 타일(가로 · 세로 · 모서리는 한 장을 뒤집어 네 방향), 안쪽 친구 자리 = 풀밭 칸,
   괴물이 나오는 왼쪽 위 = 「괴물 굴」, 판 위 여백 띠 = 울타리 · 덤불 · 꽃.
   선택한 칸(노랑) · 봉인된 칸(보라)은 칸마다 따로 그려야 하므로 slotTile() 로 꺼내 씀.
   그림을 못 받으면 ready=false 로 남고 game.js 는 art.js 가 그린 예전 바닥을 씁니다. */
(function () {
  const CD = (window.CD = window.CD || {});
  const R = 3;   // 구운 바닥 해상도: 1 도트 = 3px (타일 PNG 와 같음)
  const TL = { ready: false, img: {} };

  TL.load = function (done) {
    const F = window.CD_TILE_FILES;
    if (!F) { done(); return; }
    TL.pad = F.pad || 1;
    const jobs = Object.keys(F.tiles).map((nm) => new Promise((ok) => {
      const im = new Image();
      im.onload = () => { TL.img[nm] = im; ok(); };
      im.onerror = () => ok();
      im.src = 'assets/tiles/' + F.tiles[nm].f;
    }));
    Promise.all(jobs).then(() => { TL.ready = ['grass', 'dirt_h', 'dirt_v', 'dirt_c1'].every((k) => TL.img[k]); done(); });
  };

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // 칸(i, j) 가운데에 타일 한 장 — 가장자리 풀 술(pad)만큼 크게, fx/fy 로 뒤집기
  function put(x, im, i, j, T, fx, fy) {
    const s = T * TL.pad * R, cx = (i + 0.5) * T * R, cy = (j + 0.5) * T * R;
    x.save(); x.translate(cx, cy); x.scale(fx ? -1 : 1, fy ? -1 : 1);
    x.drawImage(im, -s / 2, -s / 2, s, s);
    x.restore();
  }
  // 소품: 발(아래 가운데)을 (X, Y) 도트에, 높이 h 도트로
  function prop(x, nm, X, Y, h, flip) {
    const im = TL.img[nm];
    if (!im) return;
    const k = h / im.height, w = im.width * k;
    x.save(); x.translate(X * R, Y * R); if (flip) x.scale(-1, 1);
    x.drawImage(im, (-w / 2) * R, -h * R, w * R, h * R);
    x.restore();
  }

  // 바닥 한 장 (cols×rows 칸, 칸 = T 도트) — 고해상도 캔버스. 그릴 땐 도트 크기로 줄여 그림
  // G = 판(core.Game): pathCells(칸 → 이어지는 방향) · slots · 길 첫 칸으로 지형마다 굽기
  TL.floor = function (cols, rows, T, seed, G) {
    let s = seed || 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const c = cv(cols * T * R, rows * T * R), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.fillStyle = '#9fcf6a'; x.fillRect(0, 0, c.width, c.height);
    // 친구 자리: 보통 풀밭이 대부분, 가끔 꽃 칸 (돌 · 덤불 칸은 친구가 서기엔 어수선해서 뺌). 막힌 칸은 풀밭 위에 덤불 · 바위 · 그루터기
    const deco = ['grass_f1', 'grass_f2', 'grass_f3'], props = ['bush_b', 'rock_m', 'stump', 'bush_g', 'log_moss', 'mush_red', 'rocks', 'flowers_big'];
    const slot = new Set(G.slots.map((s) => Math.floor(s.x) + ',' + Math.floor(s.y)));
    let pk = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = i + ',' + j;
      if (G.pathCells.has(k)) continue;
      const r = rnd();
      put(x, TL.img[r < 0.7 || !slot.has(k) ? 'grass' : deco[Math.floor(rnd() * deco.length)]] || TL.img.grass, i, j, T);
      if (!slot.has(k)) prop(x, props[pk++ % props.length], (i + 0.5) * T, (j + 0.85) * T, T * 0.8, rnd() < 0.5);
    }
    // 괴물 길: 칸마다 이어지는 방향으로 직선(dirt_h · dirt_v) · 모서리(dirt_c1 = 오른쪽·아래로 이어짐을 뒤집어 네 방향)
    for (const c of G.pathCells.values()) {
      const top = c.j < rows / 2, left = c.i < cols / 2;
      if (c.e && c.w) put(x, TL.img.dirt_h, c.i, c.j, T, false, !top);
      else if (c.n && c.s) put(x, TL.img.dirt_v, c.i, c.j, T, !left);
      else put(x, TL.img.dirt_c1, c.i, c.j, T, !!c.w, !!c.n);
    }
    // 괴물 굴 (출발점) — 길 첫 칸
    const p0 = G.path.at(0);
    prop(x, 'cave', p0.x * T, (p0.y + 0.28) * T, T * 0.62);
    return c;
  };
  // 판 위 여백 띠: 풀 + 울타리 + 양 끝 덤불 · 꽃
  TL.top = function (W, H) {
    const c = cv(W * R, H * R), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.fillStyle = '#9fcf6a'; x.fillRect(0, 0, c.width, c.height);
    const fence = TL.img.fence_rail || TL.img.fence_long;
    if (fence) { const h = H * 0.62, w = fence.width * (h / fence.height); for (let X = -4; X < W; X += w * 0.92) x.drawImage(fence, X * R, (H - h - 1) * R, w * R, h * R); }
    prop(x, 'bush_b', 12, H + 3, H * 0.75);
    prop(x, 'flowers_mix', W * 0.42, H + 1, H * 0.45);
    prop(x, 'bush_g', W - 12, H + 3, H * 0.75, true);
    return c;
  };
  // 칸 하나에 덧그릴 상태 타일 (선택 = 노랑, 봉인 = 보라)
  TL.slotTile = function (kind) { return TL.img[kind === 'sel' ? 'grass_sel' : 'grass_seal'] || null; };
  CD.tiles = TL;
})();
