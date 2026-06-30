const CACHE_NAME = 'railway-exam-cache-v6';

const CURRENT_VALID_ASSETS = [
    'index.html',
    'manifest.json',
    'sw.js',
    'icon.svg',
    'icon-192.png',
    'icon-512.png'
];

// 安装时预缓存核心资源，确保离线可用
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CURRENT_VALID_ASSETS).catch(() => {
                // 部分资源可能不存在（如子路径部署），不阻塞安装
            });
        })
    );
    self.skipWaiting();
});

// 激活时清理旧缓存 + 通知页面有新版本
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
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(client => {
                client.postMessage({ type: 'SW_UPDATED' });
            });
        })
    );
    e.waitUntil(clients.claim());
});

// 网络优先，成功则更新缓存，失败则从缓存加载
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') {
        return;
    }

    // 对 HTML 请求始终走网络（确保拿到最新版本）
    const isHTML = e.request.destination === 'document' ||
                   e.request.url.endsWith('/') ||
                   e.request.url.includes('index.html');

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const forCache = networkResponse.clone();
                    const forCompare = networkResponse.clone();

                    // HTML 请求：对比新旧内容，变了才通知
                    if (isHTML) {
                        caches.match(e.request).then((cachedResponse) => {
                            if (cachedResponse) {
                                Promise.all([
                                    cachedResponse.text(),
                                    forCompare.text()
                                ]).then(([oldText, newText]) => {
                                    if (oldText !== newText) {
                                        console.log('[SW] 检测到 HTML 内容更新');
                                        clients.matchAll({ type: 'window' }).then(clients => {
                                            clients.forEach(client => {
                                                client.postMessage({ type: 'SW_UPDATED' });
                                            });
                                        });
                                    }
                                });
                            }
                        });
                    }

                    // 存入缓存（只存一次）
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, forCache);

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
                                    cache.delete(storedRequest);
                                }
                            });
                        });
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});

// 接收页面发来的消息
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
