const CACHE_NAME = 'railway-exam-cache-v2';

const CURRENT_VALID_ASSETS = [
    'index.html',
    'manifest.json',
    'sw.js',
    'icon.svg',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] 清理旧缓存桶:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') {
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);

                        // 自动清理不在白名单中的旧缓存
                        cache.keys().then((requests) => {
                            requests.forEach((storedRequest) => {
                                const url = new URL(storedRequest.url);
                                const relativePath = url.pathname + url.search;
                                const cleanPath = relativePath.replace(/^\/[^\/]+\//, '');

                                if (
                                    CURRENT_VALID_ASSETS.indexOf(relativePath) === -1 &&
                                    CURRENT_VALID_ASSETS.indexOf(cleanPath) === -1 &&
                                    relativePath !== '/'
                                ) {
                                    console.log('[SW 自动大扫除] 清理过期缓存:', relativePath);
                                    cache.delete(storedRequest);
                                }
                            });
                        });
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // 网络不可用 → 从缓存加载
                return caches.match(e.request);
            })
    );
});
