/* 서비스워커 — 설치한 앱(과 브라우저)이 인터넷 없이도 열리게. 게임과 무관한 독립 파일 (js/inapp.js 가 등록).
   다른 정적 웹앱에 그대로 복사해 쓰려면 아래 「바꿀 곳」 셋만 봅니다.

   길:
   - 페이지(HTML) · 코드(js · css · json · webmanifest) = network-first
     새 배포가 바로 보이고, HTML 과 JS 가 서로 다른 판이 섞이지 않게(섞이면 화면이 깨짐). 인터넷이 없을 때만 캐시.
   - 그림 · 소리 · 글꼴 = stale-while-revalidate — 캐시로 바로 보이고 뒤에서 새로 받아 둠
   - CDN 글꼴(갈무리 — 주소에 판 번호가 박혀 안 바뀜) = cache-first
   - 페이지가 다 뜬 뒤 inapp.js 가 「지금까지 받은 파일 목록」 을 보내면(warm) 아직 캐시에 없는 것만 담음
     → 첫 방문 한 번이면 그림 수백 장을 손으로 목록에 적지 않아도 오프라인에서 열림 */

// ── 바꿀 곳 ──────────────────────────────────────────────
// 1) 판 번호: 캐시 이름에 붙음. 올리면 activate 때 옛 캐시를 지움 (코드는 어차피 network-first 라 그림을 크게 바꿨을 때만 올리면 됨)
const VERSION = 'v1';
const PREFIX = 'ck-defense-';
// 2) 설치하자마자 담아 둘 뼈대 (나머지는 warm · 쓰면서 담김). 하나가 404 여도 설치는 계속됨
const CORE = ['./', './index.html', './manifest.webmanifest', './inapp.css', './js/inapp.js'];
// 3) 캐시해도 되는 다른 도메인 (CDN 글꼴)
const CDN = ['https://cdn.jsdelivr.net/npm/galmuri@'];
// ─────────────────────────────────────────────────────────

const CACHE = PREFIX + VERSION;
const CODE = /\.(?:html?|js|mjs|css|json|webmanifest)$/i;
const MEDIA = /\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav|m4a)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function put(req, res) {
  // 206(부분) · 오류는 담지 않음. 다른 도메인의 불투명 응답(status 0)은 CDN 허용 목록일 때만 여기 옴
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

async function networkFirst(req, isPage) {
  try {
    return put(req, await fetch(req));
  } catch (err) {
    const c = await caches.open(CACHE);
    // ?src=pwa · ?seed= 같은 쿼리가 붙어도 같은 페이지로
    const hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) || (isPage ? (await c.match('./index.html')) || (await c.match('./')) : null);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(e, req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => put(req, res)).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return put(req, await fetch(req));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (CDN.some((p) => req.url.startsWith(p))) e.respondWith(cacheFirst(req));
    return;   // 그 밖의 다른 도메인은 손대지 않음
  }
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, true)); return; }
  if (CODE.test(url.pathname)) { e.respondWith(networkFirst(req, false)); return; }
  if (MEDIA.test(url.pathname)) { e.respondWith(staleWhileRevalidate(e, req)); return; }
});

// 페이지가 보낸 「받은 파일 목록」 중 캐시에 없는 것만 담음. 다 담으면 그 페이지에 알려 줌(확인 도구가 기다림)
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'warm' || !Array.isArray(d.urls)) return;
  const port = e.ports && e.ports[0];
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let added = 0;
    for (const u of d.urls.slice(0, 3000)) {
      try {
        const url = new URL(u, self.location.href);
        const same = url.origin === self.location.origin;
        if (!same && !CDN.some((p) => url.href.startsWith(p))) continue;
        if (same && !(CODE.test(url.pathname) || MEDIA.test(url.pathname) || url.pathname.endsWith('/'))) continue;
        if (url.pathname.endsWith('/sw.js')) continue;
        if (await c.match(url.href, { ignoreSearch: same })) continue;
        // CDN 은 cors 로 받아 둠 — 글꼴은 브라우저가 cors 로 요청하므로 불투명 응답을 주면 글꼴이 안 뜸 (jsdelivr 는 CORS 허용)
        const res = await fetch(url.href, same ? {} : { mode: 'cors', credentials: 'omit' });
        if (res.ok || res.type === 'opaque') { await c.put(url.href, res); added++; }
      } catch (err) { /* 한 장 못 받아도 계속 */ }
    }
    if (port) port.postMessage({ type: 'warmed', added });
  })());
});
