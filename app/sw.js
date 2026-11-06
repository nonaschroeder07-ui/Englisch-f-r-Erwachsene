// Service worker: сохраняет приложение и уроки на устройстве, чтобы всё работало без интернета.
// Стратегия: сначала отдаём сохранённую копию (быстро и офлайн), а в фоне скачиваем свежую —
// так новые уроки появляются при следующем открытии.
// При изменении кода приложения увеличить VERSION.
const VERSION = 'v1';
const CACHE = 'english-a1-' + VERSION;

const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/store.js', 'js/speech.js', 'js/review.js', 'js/lesson.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

// Список файлов курса берём из content/course.json, чтобы не дублировать его здесь
async function contentFiles() {
  const base = '../content/';
  const course = await fetch(base + 'course.json', { cache: 'no-store' }).then(r => r.json());
  const files = ['course.json', 'vocabulary-a1.json', 'placement-test.json'];
  course.topics.forEach(tp => {
    if (tp.test) files.push(tp.test);
    tp.lessons.filter(l => l.ready).forEach(l => files.push('lessons/' + l.id + '.json'));
  });
  return files.map(f => base + f);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await cache.addAll(await contentFiles());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('english-a1-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    // Нет сети и нет копии: для страниц отдаём главный экран
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});

// Сколько файлов курса сохранено (для экрана настроек)
self.addEventListener('message', async event => {
  if (event.data === 'status') {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    event.source.postMessage({ type: 'status', files: keys.length, version: VERSION });
  }
});
