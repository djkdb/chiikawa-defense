/* pixelfx 효과 층 — js/pfx/ 에 옮겨 온 픽셀 효과(patch-gg/pixelfx, MIT)를 판 캔버스 위에 얹습니다.
   game.js 는 window.PFX 가 있을 때만 부르고, 없으면(못 받음 · 오래된 브라우저) 예전 효과만 그대로 씀.

   - 판 도트(art px)의 R 배 촘촘한 격자에 그림: pixelfx 효과는 100~250px 크기라 판(가로 192)에 그대로 놓으면
     괴물(약 26)보다 몇 배 큼. R=2 면 크기 절반 · 효과 점도 친구 도트의 절반이라 판 위에서 덜 튐.
   - 층 둘: 'under' = 친구 · 괴물 밑(회복 고리 · 소환 구멍), 'over' = 위(펑 · 치명 · 합성 빛 · 폭죽 · 침묵 마법진).
     그 층에 효과가 있을 때만 합성(composite)해서 아무 일 없을 땐 비용 0.
   - pixelfx 는 어두운 배경용이라(빛 = 더하기) 밝은 풀밭에선 빛이 흐려 안 보임 → 빛을 LIGHT 배로 세게 합성하고,
     판의 다른 그림처럼 잉크색 테두리(효과 점의 실루엣을 사방 1점씩 밀어 깐 것)를 깔아 또렷하게.
   - 같은 효과가 너무 많이 쌓이지 않게 이름마다 상한 — 넘치면 spawn 이 false 를 돌려주고 game.js 가 예전 효과로. */
import { createFrame, createFx, mix, hex, toHex } from './pfx/core/index.js';
import * as critHit from './pfx/fx/impacts/crit-hit.js';
import * as poof from './pfx/fx/spawn/poof.js';
import * as manaBurst from './pfx/fx/arcane/mana-burst.js';
import * as firework from './pfx/fx/explosions/firework-burst.js';
import * as snowflake from './pfx/fx/ice/snowflake-burst.js';
import * as healAoe from './pfx/fx/holy/heal-aoe.js';
import * as hexSigil from './pfx/fx/shadow/hex-sigil.js';
import * as portal from './pfx/fx/spawn/spawn-portal.js';
import * as confetti from './pfx/fx/ui/confetti.js';

// 이름 → 효과 · 기본 층 · 동시에 몇 개까지 · 기본 옵션
const FX = {
  crit: { mod: critHit, layer: 'over', max: 2, often: 1, o: { light: 0.7 } },
  poof: { mod: poof, layer: 'over', max: 3, often: 1, o: { light: 0.6 } },
  burst: { mod: manaBurst, layer: 'over', max: 2, often: 1, o: { light: 0.7 } },
  firework: { mod: firework, layer: 'over', max: 2, o: { light: 0.8 } },
  snow: { mod: snowflake, layer: 'over', max: 1, often: 1, o: { light: 0.6 } },
  heal: { mod: healAoe, layer: 'under', max: 1, o: { light: 0.7 } },
  sigil: { mod: hexSigil, layer: 'over', max: 4, o: { light: 0.7 } },   // 봉인된 친구 위에 — 밑에 깔면 봉인 칸 · 친구에 가려 안 보임
  portal: { mod: portal, layer: 'under', max: 1, o: { light: 0.7 } },
  confetti: { mod: confetti, layer: 'over', max: 3, o: {} },
};

let W = 0, H = 0, PAD = 0, R = 2, seed = 1;
// 효과 하나 그리기에 1.5~3ms(폰은 몇 배) — 자주 나는 것(often: 처치 · 치명 · 합성 · 물결)은 다 합쳐 OFTEN 개까지만.
// 보스 기술 · 신화 · 클리어는 드물어서 늘 띄움. 그리고 효과는 30fps 로만 다시 그림(pixelfx 그림도 30fps)
const OFTEN = 5;
const LIGHT = 1.6, INK = [74, 53, 48, 140], SOLID = 128;   // --ink (#4a3530) 반투명 · 이만큼 진한 점만 테두리를 가짐(흐린 빛 번짐엔 안 깔아 얼룩이 안 생김)
const L = {};   // 층마다 { frame, canvas, ctx, img, list[] }

function makeLayer() {
  const frame = createFrame(W * R, H * R, 0, -PAD * R);
  const canvas = document.createElement('canvas');
  canvas.width = W * R; canvas.height = H * R;
  const ctx = canvas.getContext('2d');
  const ink = document.createElement('canvas');
  ink.width = W * R; ink.height = H * R;
  const ictx = ink.getContext('2d');
  return { frame, canvas, ctx, ink, ictx, img: ctx.createImageData(W * R, H * R), inkImg: ictx.createImageData(W * R, H * R), list: [], prev: null };
}

// 효과가 그릴 수 있는 상자(frame 좌표) — meta.size · origin 기준, 뒤집혀도 들어가게 좌우는 넉넉히
function boxOf(f, fr) {
  const m = f.fx.meta, o = f.fx.options, sz = m.size || [64, 64], og = m.origin || [sz[0] / 2, sz[1]];
  const hw = Math.max(og[0], sz[0] - og[0]) + 2;
  return [o.x - hw - fr.ox, o.y - og[1] - 2 - fr.oy, o.x + hw - fr.ox, o.y - og[1] + sz[1] + 2 - fr.oy];
}
function union(a, b) { return !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
function clip(b, w, h) { const r = [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(w, Math.ceil(b[2])), Math.min(h, Math.ceil(b[3]))]; return r[2] > r[0] && r[3] > r[1] ? r : null; }
// 상자 안만: 색 + 빛을 투명 위 RGBA 로 (pixelfx core/fx.js 의 composite(bg = null) 를 상자 범위로 줄인 것)
// 그리고 진한 점(알파 SOLID 이상)만 잉크 실루엣으로
function compositeBox(fr, out, ink, b) {
  const C = fr.color, Lb = fr.light, w = fr.w;
  for (let y = b[1]; y < b[3]; y++) for (let i = y * w + b[0], e = y * w + b[2]; i < e; i++) {
    const c = C[i], l = Lb[i] & 0xffffff, j = i * 4;
    let r = c & 255, g = (c >>> 8) & 255, bl = (c >>> 16) & 255, a = c >>> 24;
    if (l) {
      const lr = (l & 255) * LIGHT, lg = ((l >>> 8) & 255) * LIGHT, lb = ((l >>> 16) & 255) * LIGHT;
      if (a < 255) {
        const pa = a / 255, na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
        if (na > 0) { r = Math.min(255, (r * pa + lr) / na); g = Math.min(255, (g * pa + lg) / na); bl = Math.min(255, (bl * pa + lb) / na); a = na * 255; }
      } else { r = Math.min(255, r + lr); g = Math.min(255, g + lg); bl = Math.min(255, bl + lb); }
    }
    out[j] = r; out[j + 1] = g; out[j + 2] = bl; out[j + 3] = a;
    if (a >= SOLID) { ink[j] = INK[0]; ink[j + 1] = INK[1]; ink[j + 2] = INK[2]; ink[j + 3] = INK[3]; } else ink[j + 3] = 0;
  }
}
function clearBox(fr, b) {
  for (let y = b[1]; y < b[3]; y++) { const s0 = y * fr.w + b[0], s1 = y * fr.w + b[2]; fr.color.fill(0, s0, s1); fr.light.fill(0, s0, s1); }
}

// 색 하나로 어두움 → 그 색 → 흰색 사다리 (합성 빛을 등급 색으로 칠할 때)
function rampOf(c) {
  const k = hex(c), black = hex('#1a1020'), white = hex('#ffffff');
  return [0.3, 0.55, 0.8].map((t) => toHex(mix(black, k, t))).concat([c], [0.35, 0.7].map((t) => toHex(mix(k, white, t))), ['#ffffff']);
}

const PFX = {
  ready: false,
  init(o) {
    W = o.w; H = o.h; PAD = o.pad; R = o.r || 2;
    L.under = makeLayer(); L.over = makeLayer();
    PFX.ready = true;
  },
  // x, y = 판 도트 좌표(game.js 와 같은 자리). 넘치면 false
  spawn(name, x, y, opts) {
    const D = FX[name];
    if (!PFX.ready || !D) return false;
    opts = opts || {};
    const layer = L[opts.layer || D.layer];
    if (layer.list.filter((f) => f.name === name).length >= D.max) return false;
    if (D.often && PFX.count((n) => FX[n].often) >= OFTEN) return false;
    const o = Object.assign({ seed: seed++ }, D.o, opts, { x: Math.round(x * R), y: Math.round(y * R) });
    if (opts.color) o.palette = rampOf(opts.color);
    layer.list.push({ name, fx: createFx(D.mod, o), delay: opts.delay || 0 });
    return true;
  },
  // name: 이름 하나 · 함수(이름 → 참/거짓) · 없으면 전부
  count(name) { let n = 0; for (const k in L) for (const f of L[k].list) if (!name || (typeof name === 'function' ? name(f.name) : f.name === name)) n++; return n; },
  clear() { for (const k in L) L[k].list.length = 0; },
  update(dt) {
    if (!PFX.ready || !dt) return;
    for (const k in L) {
      const ly = L[k];
      for (const f of ly.list) { if (f.delay > 0) { f.delay -= dt; continue; } f.fx.update(dt); }
      ly.list = ly.list.filter((f) => !f.fx.done());
    }
  },
  // 판 캔버스(이미 도트 좌표로 옮겨 놓은 ctx)에 그 층을 그림
  draw(ctx, k) {
    const ly = PFX.ready && L[k];
    if (!ly) return;
    const fr = ly.frame;
    ly.n = (ly.n || 0) + 1;
    if (ly.n % 2 && ly.last && ly.list.length) { blit(ctx, ly, ly.last); return; }   // 30fps: 홀수 프레임은 지난 그림 그대로
    // 판 전체(384×572)를 매 프레임 합성하면 13ms — 효과들이 차지하는 상자만 지우고 · 그리고 · 합성 (보통 1/10 넓이)
    let box = null;
    const live = ly.list.filter((f) => f.delay <= 0);
    for (const f of live) box = union(box, boxOf(f, fr));
    const cb = ly.prev && clip(ly.prev, fr.w, fr.h);
    if (cb) clearBox(fr, cb);   // 지난번 상자(끝난 효과 자국)까지 지움
    ly.prev = box;
    const b = box && clip(box, fr.w, fr.h);
    ly.last = b;
    if (!b) return;
    clearBox(fr, b);
    for (const f of live) f.fx.draw(fr);
    compositeBox(fr, ly.img.data, ly.inkImg.data, b);
    ly.ctx.putImageData(ly.img, 0, 0, b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ly.ictx.putImageData(ly.inkImg, 0, 0, b[0], b[1], b[2] - b[0], b[3] - b[1]);
    blit(ctx, ly, b);
  },
};
// 합성해 둔 층 그림의 상자 b 를 판에 (잉크 테두리 사방 → 그 위에 효과)
function blit(ctx, ly, b) {
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const d = 1 / R, X = b[0] / R, Y = b[1] / R - PAD, w = bw / R, h = bh / R;   // 효과 점 하나 = 판 도트 1/R
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d]]) ctx.drawImage(ly.ink, b[0], b[1], bw, bh, X + dx, Y + dy, w, h);
    ctx.drawImage(ly.canvas, b[0], b[1], bw, bh, X, Y, w, h);
    ctx.imageSmoothingEnabled = sm;
}
window.PFX = PFX;
window.dispatchEvent(new Event('pfx-ready'));
