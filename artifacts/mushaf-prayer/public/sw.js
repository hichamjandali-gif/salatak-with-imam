// Cache Quran recitation recordings independently from the interface.
const SHELL_CACHE = 'mushaf-prayer-v1';
const AUDIO_CACHE = 'salatak-quran-audio-v1';
const APP_SHELL = ['./', './manifest.webmanifest', './favicon.svg'];
const AUDIO_HOSTS = new Set(['cdn.islamic.network','cdn.alquran.cloud','everyayah.com','audio.alquran.cloud']);
const isAudio = (url) => AUDIO_HOSTS.has(url.hostname) && /\.mp3($|\?)/i.test(url.pathname + url.search);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // Never clear the Quran-audio cache on a UI update.
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== SHELL_CACHE && key !== AUDIO_CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
async function cachedAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const saved = await cache.match(request.url);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request.url, response.clone()).catch(() => {});
  }
  return response;
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (isAudio(url)) {
    // Browser media range requests cannot be satisfied blindly with an ordinary cached 200 response.
    if (event.request.headers.has('range')) return;
    event.respondWith(cachedAudio(event.request));
    return;
  }
  event.respondWith(fetch(event.request)
    .then(response => {
      if (url.origin === self.location.origin && response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy)).catch(() => {}));
      }
      return response;
    })
    .catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./') : Response.error())));
});
// The Quran page may request preloading while the user is selecting their favorite surah.
self.addEventListener('message', event => {
  if (event.data?.type !== 'SALATAK_PREFETCH_AUDIO' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(value => {
    try { return typeof value === 'string' && isAudio(new URL(value)); } catch { return false; }
  }).slice(0, 300);
  event.waitUntil((async () => {
    for (const url of urls) {
      await cachedAudio(new Request(url, {mode: 'no-cors'})).catch(() => {});
    }
  })());
});
