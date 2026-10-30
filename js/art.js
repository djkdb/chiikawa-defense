/* 그림 — 괴물 · 길 · 바닥 · 투사체 · 아이콘을 여기서 직접 그립니다 (공식 그림 파일 없음).
   방법: 작은 캔버스(1칸 = 32 도트)에 둥근 도형을 그린 뒤 → 반투명 가장자리를 없애고 팔레트 색으로 맞춰(양자화)
   또렷한 도트로 만듭니다. 손으로 도트 배열을 적으면 곡선이 울퉁불퉁해지기 때문.
   캐릭터만은 그리지 않습니다 — 사람이 준 팬 도트 시트를 자른 `assets/chars/<id>/*.png` (목록은 chars.js) 를 그대로 씁니다.
   (직접 그린 캐릭터는 「치이카와가 아니야」 라는 말을 들었음. 파일을 못 불러온 경우에만 이름 첫 글자 동그라미) */
(function () {
  const CD = (window.CD = window.CD || {});
  const TILE = 32;               // 한 칸 = 32 도트
  const INK = '#4a3530';         // 외곽선 — 검정보다 짙은 갈색이 따뜻한 결에 맞음

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

  // 반투명 가장자리 → 투명/불투명, 색 → 팔레트에서 가장 가까운 색
  function quantize(c, pal) {
    const x = c.getContext('2d'), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    const P = pal.map(hex);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      let best = 0, bd = 1e9;
      for (let k = 0; k < P.length; k++) {
        const dr = d[i] - P[k][0], dg = d[i + 1] - P[k][1], db = d[i + 2] - P[k][2];
        const dd = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      d[i] = P[best][0]; d[i + 1] = P[best][1]; d[i + 2] = P[best][2]; d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  // 한 장 그리기: fn(ctx) 로 그리고 양자화
  function paint(w, h, pal, fn) {
    const c = cv(w, h), x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, w, h);
    return quantize(c, pal.concat([INK]));
  }
  // 도형: 외곽선(굵게) 먼저, 속 칠 나중 — 그래서 겹친 부품 사이 안쪽 선이 저절로 생김
  function blob(x, path, fill, lw) {
    x.save(); path(x); x.lineWidth = lw == null ? 3.2 : lw; x.strokeStyle = INK; x.stroke(); x.fillStyle = fill; x.fill(); x.restore();
  }
  function ell(cx, cy, rx, ry, rot) { return (x) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2); }; }
  function poly(pts) { return (x) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); }; }
  // 아래가 넓은 찹쌀떡 몸
  function mochi(cx, cy, rx, ry, n) {
    return (x) => {
      x.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const px = cx + rx * (s > 0 ? 1.06 : 0.96) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        const py = cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath();
    };
  }
  // 속 그늘: 도형 안쪽 오른쪽 아래를 그늘색으로 (둥근 느낌)
  function shade(x, path, col, dx, dy, base) {
    x.save(); path(x); x.clip();
    x.fillStyle = col; x.fillRect(-999, -999, 9999, 9999);
    x.translate(dx, dy); path(x); x.fillStyle = base; x.fill();
    x.restore();
  }
  function px(x, X, Y, rows, map) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = map[r[i]]; if (col) { x.fillStyle = col; x.fillRect(X + i, Y + j, 1, 1); } } });
  }

  // ── 괴물 ────────────────────────────────────────────────
  // 다 같은 「작은 괴물」 족속: 짙은 자두색 몸 · 뿔 · 이빨 웃음. 웨이브가 깊어질수록 무늬만 달라짐
  const MON = { body: '#7a68a6', light: '#9d8cc6', dark: '#5b4b84', tooth: '#fffaf0', mouth: '#3a2540', eye: '#fffaf0', pupil: '#2a1d2c', blush: '#e99ab5', horn: '#f3d9a0', hornD: '#d4ae6a' };
  function face(x, cx, cy, s, o) {
    o = o || {};
    // 눈: 흰자 + 동공 (위를 보는 장난스러운 눈)
    const E = { w: MON.eye, k: MON.pupil };
    const eye = o.one ? null : ['.ww.', 'wkkw', 'wkkw', '.ww.'];
    if (o.one) px(x, cx - 3, cy - 4, ['.www.', 'wwkkw', 'wkkkw', 'wwkkw', '.www.'], E);
    else { px(x, cx - 7 * s, cy - 3, eye, E); px(x, cx + 3 * s, cy - 3, eye, E); }
    // 입: 지그재그 이빨
    const M = { m: MON.mouth, t: MON.tooth };
    const w = o.mouthW || 8;
    const top = '.' + 't'.repeat(w - 2) + '.', mid = [...Array(w)].map((_, i) => (i % 2 ? 'm' : 't')).join(''), bot = '.' + 'm'.repeat(w - 2) + '.';
    px(x, Math.round(cx - w / 2), cy + 2, [top.replace(/t/g, 'm'), mid, bot], M);
  }

  function enemyBlob(f) {
    return paint(26, 26, Object.values(MON), (x) => {
      const sq = f ? 1 : 0;
      // 뿔 둘
      blob(x, poly([[7, 9 + sq], [5, 2 + sq], [11, 7 + sq]]), MON.horn, 2.6);
      blob(x, poly([[19, 9 + sq], [21, 2 + sq], [15, 7 + sq]]), MON.horn, 2.6);
      // 발
      blob(x, ell(8, 22.5, 3, 2), MON.dark, 2.6);
      blob(x, ell(18, 22.5, 3, 2), MON.dark, 2.6);
      const body = mochi(13, 14 + sq * 0.5, 10.2 + sq * 0.6, 8.6 - sq * 0.6, 2.3);
      blob(x, body, MON.body, 3);
      shade(x, body, MON.dark, -1.6, -1.6, MON.body);
      x.fillStyle = MON.light; x.fillRect(7, 8 + sq, 3, 1); x.fillRect(6, 9 + sq, 1, 2);
    });
  }
  function enemyBlobFace(c, f) {
    const x = c.getContext('2d');
    face(x, 13, 14 + (f ? 1 : 0), 1, { mouthW: 8 });
    px(x, 4, 16 + (f ? 1 : 0), ['bb'], { b: MON.blush });
    px(x, 20, 16 + (f ? 1 : 0), ['bb'], { b: MON.blush });
    return c;
  }
  function enemyFast(f) {
    const C = { body: '#5f9ba3', light: '#86c1c4', dark: '#3f6f7a', wing: '#4d5f86', wingL: '#7184b3' };
    const c = paint(26, 24, Object.values(C).concat([MON.eye, MON.pupil, MON.mouth, MON.tooth, MON.blush]), (x) => {
      const up = f ? -4 : 2;
      // 박쥐 날개 (펄럭 두 장)
      blob(x, poly([[8, 12], [1, 6 + up], [2, 10 + up], [0, 14 + up * 0.4], [5, 15]]), C.wing, 2.4);
      blob(x, poly([[18, 12], [25, 6 + up], [24, 10 + up], [26, 14 + up * 0.4], [21, 15]]), C.wing, 2.4);
      const body = ell(13, 13, 7.6, 7.4);
      blob(x, body, C.body, 3);
      shade(x, body, C.dark, -1.4, -1.4, C.body);
      // 꼬리 털
      blob(x, poly([[11, 6], [13, 1], [15, 6]]), C.body, 2.2);
    });
    const x = c.getContext('2d');
    face(x, 13, 13, 1, { one: true, mouthW: 6 });
    x.fillStyle = C.light; x.fillRect(9, 8, 2, 1);
    return c;
  }
  function enemyTank(f) {
    const C = { body: '#8a5f7e', light: '#ad80a0', dark: '#664360', pot: '#b9bdc6', potD: '#868b96', potL: '#e3e6ec', rivet: '#6b6f78' };
    const c = paint(28, 28, Object.values(C).concat([MON.eye, MON.pupil, MON.mouth, MON.tooth]), (x) => {
      const sq = f ? 1 : 0;
      blob(x, ell(8, 24.5, 3.4, 2.2), C.dark, 2.6);
      blob(x, ell(20, 24.5, 3.4, 2.2), C.dark, 2.6);
      const body = mochi(14, 17 + sq * 0.5, 11.4 + sq * 0.5, 8.6 - sq * 0.5, 2.6);
      blob(x, body, C.body, 3);
      shade(x, body, C.dark, -1.6, -1.6, C.body);
      // 냄비 투구
      const pot = (y) => { y.beginPath(); y.moveTo(3, 13 + sq); y.lineTo(25, 13 + sq); y.lineTo(23, 5 + sq); y.quadraticCurveTo(14, 1 + sq, 5, 5 + sq); y.closePath(); };
      blob(x, pot, C.pot, 3);
      shade(x, pot, C.potD, -1.4, -1.6, C.pot);
      x.fillStyle = C.potL; x.fillRect(7, 6 + sq, 4, 1); x.fillRect(6, 7 + sq, 1, 2);
      blob(x, ell(14, 3 + sq, 2.2, 1.6), C.potD, 2);   // 손잡이
      x.fillStyle = C.rivet; x.fillRect(8, 11 + sq, 1, 1); x.fillRect(14, 11 + sq, 1, 1); x.fillRect(20, 11 + sq, 1, 1);
    });
    const x = c.getContext('2d');
    const sq = f ? 1 : 0;
    // 화난 눈썹 + 눈
    px(x, 7, 15 + sq, ['k...', '.ww.', 'wkkw', '.ww.'], { k: INK, w: MON.eye });
    px(x, 17, 15 + sq, ['...k', '.ww.', 'wkkw', '.ww.'], { k: INK, w: MON.eye });
    px(x, 10, 20 + sq, ['.mmmmmm.', 'mtmtmtmt', '.mmmmmm.'], { m: MON.mouth, t: MON.tooth });
    return c;
  }
  // 보스 「키메라」: 짝짝이 뿔(양뿔 + 사슴뿔) · 한쪽 박쥐 날개 · 뱀 꼬리 · 세 눈. tint 로 보스마다 몸 색이 다름
  const BOSS_TINTS = [
    { body: '#7a5aa0', light: '#a184c4', dark: '#563c7a' },
    { body: '#a0566a', light: '#c97e8f', dark: '#7a3a4e' },
    { body: '#4f7f8f', light: '#78a9b5', dark: '#365c6a' },
    { body: '#5c4a6e', light: '#86729a', dark: '#3c2e4c' },
  ];
  function enemyBoss(f, tint) {
    const C = BOSS_TINTS[tint % BOSS_TINTS.length];
    const X = { horn: '#f3d9a0', hornD: '#c9a061', ant: '#b98a5c', wing: '#4d4466', wingL: '#7a6f99', tail: '#6f9a5c', tailD: '#4d7342', eye: '#fff3b0', pupil: '#2a1d2c', mouth: '#3a2540', tooth: '#fffaf0', blush: '#f0a0bb' };
    const c = paint(56, 52, Object.values(C).concat(Object.values(X)), (x) => {
      const sq = f ? 1 : 0, up = f ? -3 : 0;
      // 뱀 꼬리 (뒤)
      const tail = (y) => { y.beginPath(); y.moveTo(40, 38); y.quadraticCurveTo(54, 40, 51, 28 + up * 0.3); y.quadraticCurveTo(49, 22, 53, 19); y.lineTo(55, 22); y.quadraticCurveTo(52, 26, 54, 30); y.quadraticCurveTo(57, 44, 40, 43); y.closePath(); };
      blob(x, tail, X.tail, 3);
      x.fillStyle = X.tailD; [[50, 33], [52, 27], [47, 39]].forEach(([a, b]) => x.fillRect(a, b, 2, 1));
      // 박쥐 날개 (왼쪽 하나)
      blob(x, poly([[14, 22], [2, 10 + up], [4, 17 + up], [0, 22 + up], [5, 25 + up * 0.5], [3, 31], [12, 31]]), X.wing, 3);
      x.fillStyle = X.wingL; x.fillRect(5, 17 + up, 1, 6); x.fillRect(8, 20 + up, 1, 6);
      // 발
      blob(x, ell(17, 47.5, 5, 3), C.dark, 3);
      blob(x, ell(35, 47.5, 5, 3), C.dark, 3);
      // 몸
      const body = mochi(26, 31 + sq * 0.6, 18 + sq * 0.7, 15 - sq * 0.6, 2.4);
      blob(x, body, C.body, 3.4);
      shade(x, body, C.dark, -2.2, -2.2, C.body);
      x.fillStyle = C.light; x.fillRect(14, 20 + sq, 5, 1); x.fillRect(12, 21 + sq, 2, 3); x.fillRect(11, 24 + sq, 1, 2);
      // 배 무늬
      blob(x, ell(26, 39 + sq, 8, 5), C.light, 0);
      // 양뿔 (왼쪽, 말린)
      const ram = (y) => { y.beginPath(); y.moveTo(15, 19 + sq); y.quadraticCurveTo(6, 16, 9, 8); y.quadraticCurveTo(13, 3, 18, 7); y.quadraticCurveTo(14, 8, 14, 12); y.quadraticCurveTo(15, 15, 20, 16); y.closePath(); };
      blob(x, ram, X.horn, 3);
      x.fillStyle = X.hornD; x.fillRect(11, 10, 1, 3); x.fillRect(13, 14, 2, 1);
      // 사슴뿔 (오른쪽, 갈래)
      x.save(); x.lineWidth = 6; x.strokeStyle = INK; x.lineCap = 'round';
      const ant = (y, lw, col) => { y.lineWidth = lw; y.strokeStyle = col; y.beginPath(); y.moveTo(34, 18 + sq); y.lineTo(39, 6); y.moveTo(37, 11); y.lineTo(44, 8); y.moveTo(39, 6); y.lineTo(37, 1); y.moveTo(39, 6); y.lineTo(43, 2); y.stroke(); };
      ant(x, 5.2, INK); ant(x, 2.2, X.ant); x.restore();
      // 왕관 같은 작은 가시
      blob(x, poly([[23, 17 + sq], [26, 11 + sq], [29, 17 + sq]]), X.horn, 2.4);
    });
    const x = c.getContext('2d');
    const sq = f ? 1 : 0;
    const E = { w: X.eye, k: X.pupil };
    px(x, 15, 25 + sq, ['.www.', 'wwkkw', 'wkkkw', '.www.'], E);
    px(x, 32, 25 + sq, ['.www.', 'wkkww', 'wkkkw', '.www.'], E);
    px(x, 24, 21 + sq, ['.ww.', 'wkkw', '.ww.'], E);
    // 큰 입 + 이빨
    px(x, 17, 32 + sq, [
      '.mmmmmmmmmmmmmmmmm.',
      'mtmtmtmtmtmtmtmtmtm',
      'mmmmmmmmmmmmmmmmmmm',
      '.mmmtmtmtmtmtmtmmm.',
      '..mmmmmmmmmmmmmmm..',
    ], { m: X.mouth, t: X.tooth });
    px(x, 11, 31 + sq, ['bbb'], { b: X.blush });
    px(x, 38, 31 + sq, ['bbb'], { b: X.blush });
    return c;
  }
  // 맞은 순간 하얗게 번쩍이는 판
  function flashOf(c) {
    const o = cv(c.width, c.height), x = o.getContext('2d');
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, o.width, o.height);
    return o;
  }

  // ── 판 바닥 ─────────────────────────────────────────────
  // 가장자리 한 바퀴 = 모래 길, 안쪽 = 연두 풀밭 + 크림색 받침(아군 자리). 한 번 구워 두고 매 프레임 drawImage
  const FLOOR = {
    grassA: '#d4ecb4', grassB: '#c9e5a6', grassD: '#b4d68e', flowerP: '#f7b6c8', flowerW: '#fffaf0', flowerY: '#ffe08a',
    sand: '#f4ddb2', sandL: '#f9ead0', sandD: '#e3c48f', pebble: '#d6b480', edge: '#d9b787',
    pad: '#fff6e3', padD: '#efdcbc', padL: '#ffffff',
    cave: '#5b4b84', caveD: '#3a2d50', caveL: '#7a68a6',
  };
  function floor(cols, rows, seed) {
    let s = seed || 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const W = cols * TILE, H = rows * TILE;
    const c = cv(W, H), x = c.getContext('2d');
    // 풀 바둑판
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      x.fillStyle = (i + j) % 2 ? FLOOR.grassA : FLOOR.grassB; x.fillRect(i * TILE, j * TILE, TILE, TILE);
    }
    // 풀잎 점
    for (let k = 0; k < cols * rows * 3; k++) {
      const X = Math.floor(r() * W), Y = Math.floor(r() * H);
      x.fillStyle = FLOOR.grassD; x.fillRect(X, Y, 1, 2); x.fillRect(X + 2, Y + 1, 1, 1);
    }
    // 길 (가장자리 링) — 칸 가운데 줄을 따라 굵은 모래 띠
    const band = 26, o = (TILE - band) / 2;
    const ring = (inset, col) => {
      x.fillStyle = col;
      x.fillRect(o + inset, o + inset, W - 2 * (o + inset), band - 2 * inset);
      x.fillRect(o + inset, H - o - band + inset, W - 2 * (o + inset), band - 2 * inset);
      x.fillRect(o + inset, o + inset, band - 2 * inset, H - 2 * (o + inset));
      x.fillRect(W - o - band + inset, o + inset, band - 2 * inset, H - 2 * (o + inset));
    };
    ring(-2, FLOOR.edge);
    ring(0, FLOOR.sand);
    // 길 가운데 밝은 바퀴 자국
    x.fillStyle = FLOOR.sandL;
    for (let i = TILE / 2; i < W - TILE / 2; i += 6) { x.fillRect(i, TILE / 2 - 1, 3, 2); x.fillRect(i, H - TILE / 2 - 1, 3, 2); }
    for (let j = TILE / 2; j < H - TILE / 2; j += 6) { x.fillRect(TILE / 2 - 1, j, 2, 3); x.fillRect(W - TILE / 2 - 1, j, 2, 3); }
    // 안쪽 모서리를 둥글게 (풀 색으로 깎기)
    const innerR = (cx, cy) => { x.fillStyle = FLOOR.grassA; x.fillRect(cx, cy, 2, 2); };
    // 자갈
    for (let k = 0; k < 40; k++) {
      const t = r() * 2 * (cols + rows - 2) * TILE;
      let X, Y;
      const per = [W - TILE, H - TILE, W - TILE, H - TILE];
      let d = t, side = 0;
      while (d > per[side]) { d -= per[side]; side = (side + 1) % 4; }
      const off = (r() - 0.5) * (band - 8);
      if (side === 0) { X = TILE / 2 + d; Y = TILE / 2 + off; }
      else if (side === 1) { X = W - TILE / 2 + off; Y = TILE / 2 + d; }
      else if (side === 2) { X = W - TILE / 2 - d; Y = H - TILE / 2 + off; }
      else { X = TILE / 2 + off; Y = H - TILE / 2 - d; }
      x.fillStyle = FLOOR.pebble; x.fillRect(Math.round(X), Math.round(Y), 2, 1);
      x.fillStyle = FLOOR.sandD; x.fillRect(Math.round(X), Math.round(Y) + 1, 2, 1);
    }
    innerR(0, 0);
    // 안쪽 풀밭의 작은 꽃
    for (let k = 0; k < 10; k++) {
      const X = TILE + 3 + Math.floor(r() * (W - 2 * TILE - 8)), Y = TILE + 3 + Math.floor(r() * (H - 2 * TILE - 8));
      const col = [FLOOR.flowerP, FLOOR.flowerW, FLOOR.flowerY][k % 3];
      px(x, X, Y, ['.c.', 'cyc', '.c.'], { c: col, y: col === FLOOR.flowerY ? FLOOR.flowerW : FLOOR.flowerY });
    }
    // 받침(아군 자리) — 둥근 크림 방석
    for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) {
      const X = i * TILE + 3, Y = j * TILE + 4, w = TILE - 6, h = TILE - 7;
      x.fillStyle = FLOOR.padD; roundRect(x, X, Y + 1, w, h, 6); x.fill();
      x.fillStyle = FLOOR.pad; roundRect(x, X, Y, w, h - 1, 6); x.fill();
      x.fillStyle = FLOOR.padL; x.fillRect(X + 5, Y + 2, w - 10, 1);
    }
    // 괴물 굴 (출발점, 왼쪽 위)
    const cx = TILE / 2, cy = TILE / 2;
    x.fillStyle = INK; roundRect(x, cx - 11, cy - 10, 22, 16, 8); x.fill();
    x.fillStyle = FLOOR.caveL; roundRect(x, cx - 9, cy - 8, 18, 13, 7); x.fill();
    x.fillStyle = FLOOR.caveD; roundRect(x, cx - 7, cy - 5, 14, 10, 6); x.fill();
    px(x, cx - 4, cy - 2, ['w...w'], { w: '#fff3b0' });
    // 반투명 쓰지 않도록 정리
    return c;
  }
  // 판 위 여백 띠: 풀밭 + 나무 울타리 (보스가 윗길에 서도 머리가 들어갈 자리)
  function topStrip(W, H) {
    const c = cv(W, H), x = c.getContext('2d');
    x.fillStyle = FLOOR.grassB; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 4) { x.fillStyle = FLOOR.grassD; x.fillRect(i + ((i * 7) % 3), 3 + ((i * 5) % 7), 1, 2); }
    // 울타리 말뚝 · 가로대
    const y0 = H - 13;
    x.fillStyle = INK; x.fillRect(0, y0 + 3, W, 4); x.fillRect(0, y0 + 9, W, 3);
    x.fillStyle = '#e8c48e'; x.fillRect(0, y0 + 4, W, 2); x.fillStyle = '#d9b07a'; x.fillRect(0, y0 + 10, W, 1);
    for (let X = 4; X < W; X += 14) {
      x.fillStyle = INK; roundRect(x, X - 1, y0 - 1, 7, 14, 2); x.fill();
      x.fillStyle = '#f2d39c'; x.fillRect(X, y0, 5, 12); x.fillStyle = '#fff1d0'; x.fillRect(X + 1, y0 + 1, 1, 9);
    }
    for (const [X, col] of [[30, FLOOR.flowerP], [92, FLOOR.flowerY], [150, FLOOR.flowerW]]) px(x, X, 2, ['.c.', 'cyc', '.c.'], { c: col, y: col === FLOOR.flowerY ? FLOOR.flowerW : FLOOR.flowerY });
    return c;
  }
  function roundRect(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.lineTo(X + w - r, Y); x.quadraticCurveTo(X + w, Y, X + w, Y + r);
    x.lineTo(X + w, Y + h - r); x.quadraticCurveTo(X + w, Y + h, X + w - r, Y + h); x.lineTo(X + r, Y + h);
    x.quadraticCurveTo(X, Y + h, X, Y + h - r); x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y); x.closePath();
  }

  // ── 투사체 (캐릭터마다) ──────────────────────────────────
  const SHOT = {};
  SHOT.chiikawa = () => paint(9, 9, ['#ffffff', '#ffd6e0'], (x) => { blob(x, star(4.5, 4.5, 3.6, 1.7, 5), '#ffffff', 2); });
  SHOT.hachiware = () => paint(9, 10, ['#8fc2f2', '#d8eeff', '#5c95d6'], (x) => {
    blob(x, (y) => { y.beginPath(); y.moveTo(4.5, 1); y.quadraticCurveTo(8.4, 6, 4.5, 8.6); y.quadraticCurveTo(0.6, 6, 4.5, 1); y.closePath(); }, '#8fc2f2', 2);
    x.fillStyle = '#d8eeff'; x.fillRect(3, 5, 1, 2);
  });
  SHOT.usagi = () => paint(10, 10, ['#ffe27a', '#fff6c8'], (x) => {
    x.lineWidth = 4; x.strokeStyle = INK; x.beginPath(); x.moveTo(2, 8); x.lineTo(8, 2); x.stroke();
    x.lineWidth = 2; x.strokeStyle = '#ffe27a'; x.beginPath(); x.moveTo(2, 8); x.lineTo(8, 2); x.stroke();
  });
  SHOT.rakko = () => paint(10, 9, ['#a9a39b', '#d4cfc6', '#7d776f'], (x) => {
    const p = ell(5, 4.6, 3.6, 3);
    blob(x, p, '#a9a39b', 2.2); shade(x, p, '#7d776f', -1, -1, '#a9a39b');
    x.fillStyle = '#d4cfc6'; x.fillRect(3, 3, 2, 1);
  });
  SHOT.momonga = () => paint(11, 11, ['#bfe2ff', '#ffffff', '#7fb8ea'], (x) => { blob(x, star(5.5, 5.5, 4.6, 1.6, 4), '#bfe2ff', 2); x.fillStyle = '#ffffff'; x.fillRect(5, 5, 1, 1); });
  SHOT.pungdengi = () => paint(10, 10, ['#7cc46a', '#bfe8a4', '#4f8f45'], (x) => {
    blob(x, (y) => { y.beginPath(); y.moveTo(5, 1); y.quadraticCurveTo(9.5, 5, 5, 9); y.quadraticCurveTo(0.5, 5, 5, 1); y.closePath(); }, '#7cc46a', 2);
    x.fillStyle = '#4f8f45'; x.fillRect(5, 3, 1, 5);
  });
  SHOT.kurimanju = () => paint(10, 10, ['#9a5c37', '#f2d39c', '#c88957'], (x) => {
    blob(x, (y) => { y.beginPath(); y.moveTo(5, 1.5); y.quadraticCurveTo(9, 5, 8, 8); y.lineTo(2, 8); y.quadraticCurveTo(1, 5, 5, 1.5); y.closePath(); }, '#9a5c37', 2);
    x.fillStyle = '#f2d39c'; x.fillRect(2, 7, 6, 1); x.fillStyle = '#c88957'; x.fillRect(4, 3, 1, 2);
  });
  SHOT.shisa = () => paint(11, 11, ['#ff8a3d', '#ffd36a', '#e2522b'], (x) => {
    blob(x, (y) => { y.beginPath(); y.moveTo(5.5, 1); y.quadraticCurveTo(9.5, 5, 8.5, 7.5); y.quadraticCurveTo(7, 10, 5.5, 10); y.quadraticCurveTo(2, 10, 2, 7); y.quadraticCurveTo(2, 4, 5.5, 1); y.closePath(); }, '#ff8a3d', 2);
    blob(x, ell(5.5, 7, 2, 2), '#ffd36a', 0);
  });
  function star(cx, cy, R, r, n) {
    return (x) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r : R; i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); };
  }
  // 동전 (토벌 보상)
  const coin = () => paint(12, 12, ['#ffd54a', '#fff1a8', '#e0a420'], (x) => {
    const p = ell(6, 6, 4.4, 4.4);
    blob(x, p, '#ffd54a', 2.2); shade(x, p, '#e0a420', -1, -1, '#ffd54a');
    x.fillStyle = '#e0a420'; x.fillRect(5, 4, 2, 4);
    x.fillStyle = '#fff1a8'; x.fillRect(4, 3, 1, 1);
  });
  // 빛 조각 (터짐·소환) — 네 갈래 반짝이
  const sparkle = (col) => paint(7, 7, [col, '#ffffff'], (x) => { x.fillStyle = col; x.fillRect(3, 0, 1, 7); x.fillRect(0, 3, 7, 1); x.fillStyle = '#ffffff'; x.fillRect(3, 3, 1, 1); x.fillRect(2, 2, 3, 3); x.fillStyle = col; x.fillRect(2, 2, 1, 1); x.fillRect(4, 2, 1, 1); x.fillRect(2, 4, 1, 1); x.fillRect(4, 4, 1, 1); });

  // ── 캐릭터 (사람이 준 시트에서 자른 PNG) ───────────────────
  // CHAR[id] = { portrait, idle[], attack[], skill[], shot, fx, joy, real } — 프레임 = { img, w, h, ax, ay(발 기준점, 도트), k }
  // 빠진 동작은 idle 로 대신합니다(chars_manifest.py 가 잘리거나 깨진 프레임을 뺀 자리).
  const CHAR = {};
  function loadChars(list, done) {
    const files = window.CD_CHAR_FILES || {};
    const jobs = [];
    list.forEach((c) => {
      const m = files[c.id];
      if (!m) { CHAR[c.id] = placeholder(c); return; }
      const C = (CHAR[c.id] = { real: true, idle: [], attack: [], skill: [], portrait: null, shot: null, fx: null, joy: null });
      const one = (e, put) => jobs.push(new Promise((ok) => {
        const im = new Image();
        // k: 그림 1px 이 몇 도트인지(치이카와 고해상도만 1 이 아님) — 크기·기준점을 도트로 바꿔 두면 그리는 쪽은 친구마다 같음
        const k = e.k || 1;
        im.onload = () => { put({ img: im, w: e.w * k, h: e.h * k, ax: e.ax * k, ay: e.ay * k, k }); ok(); };
        im.onerror = () => ok();   // 한 장 못 불러오면 그 프레임만 빠짐
        im.src = 'assets/chars/' + e.f;
      }));
      ['idle', 'attack', 'skill'].forEach((k) => m[k].forEach((e, i) => one(e, (f) => (C[k][i] = f))));
      one(m.portrait, (f) => (C.portrait = f));
      if (m.shot) one(m.shot, (f) => (C.shot = f));
      if (m.fx) one(m.fx, (f) => (C.fx = f));
      if (m.joy) one(m.joy, (f) => (C.joy = f));
    });
    Promise.all(jobs).then(() => {
      list.forEach((c) => {
        const C = CHAR[c.id];
        if (!C.real) return;
        ['idle', 'attack', 'skill'].forEach((k) => (C[k] = C[k].filter(Boolean)));
        if (!C.idle.length) { CHAR[c.id] = placeholder(c); return; }
        if (!C.attack.length) C.attack = [C.idle[0]];
        if (!C.skill.length) C.skill = [C.idle[0]];
        if (!C.portrait) C.portrait = C.idle[0];
      });
      if (done) done();
    });
  }
  function placeholder(c) {
    const img = paint(28, 28, ['#fffaf0', '#2a2120', '#ffb3c1'], (x) => {
      blob(x, ell(14, 15, 11.4, 11), '#fffaf0', 3);
    });
    const f = { img, w: 28, h: 28, ax: 14, ay: 27 };
    return { real: false, label: c.name[0], idle: [f], attack: [f], skill: [f], portrait: f, shot: null, fx: null };
  }
  // 정수 배로 키운 판을 캐시 (작게 그릴 때 부드럽게 줄여도 도트 폭이 고르게 보이도록)
  const bigCache = new Map();
  function big(img, k) {
    const key = img; let m = bigCache.get(key);
    if (!m) { m = {}; bigCache.set(key, m); }
    if (!m[k]) {
      const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      const o = cv(w * k, h * k), x = o.getContext('2d');
      x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, w * k, h * k);
      m[k] = o;
    }
    return m[k];
  }
  // 단색 실루엣 (흰 번쩍임 · 등급 빛 테두리용)
  const silCache = new Map();
  function silhouette(img, col) {
    const key = col; let m = silCache.get(img);
    if (!m) { m = {}; silCache.set(img, m); }
    if (!m[key]) {
      const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      const o = cv(w, h), x = o.getContext('2d');
      x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w, h);
      m[key] = o;
    }
    return m[key];
  }

  // ── 한 번에 굽기 ─────────────────────────────────────────
  function build(T) {
    const A = { TILE, INK, FLOOR };
    A.enemy = {
      blob: [enemyBlobFace(enemyBlob(0), 0), enemyBlobFace(enemyBlob(1), 1)],
      fast: [enemyFast(0), enemyFast(1)],
      tank: [enemyTank(0), enemyTank(1)],
      boss: [0, 1, 2, 3].map((t) => [enemyBoss(0, t), enemyBoss(1, t)]),
    };
    A.flash = new Map();
    A.flashOf = (c) => { let f = A.flash.get(c); if (!f) { f = flashOf(c); A.flash.set(c, f); } return f; };
    A.floor = floor(T.board.cols, T.board.rows, 11);
    A.top = topStrip(T.board.cols * TILE, 22);
    A.shot = {};
    for (const k in SHOT) A.shot[k] = SHOT[k]();
    A.coin = coin();
    A.spark = {};
    T.grades.forEach((g) => (A.spark[g.key] = sparkle(g.color)));
    A.spark.white = sparkle('#ffe7f0');
    A.char = CHAR;
    A.big = big;
    A.silhouette = silhouette;
    A.loadChars = loadChars;
    A.roundRect = roundRect;
    return A;
  }
  CD.art = { build, TILE, INK, paint, quantize };
})();
