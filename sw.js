const versionNumber = 'v5';

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(versionNumber).then(cache => {
			return cache.addAll([
				'/',
				'/index.html',
				'/static/assets/flag.svg',
				'/static/assets/mine.svg',
				'/static/logo/128.png',
				'/static/logo/192.png',
				'/static/logo/192m.png',
				'/static/logo/512.png',
				'/static/logo/1337.png',
				'/static/roboto/300.ttf',
				'/static/roboto/400.ttf',
				'/static/main.css',
				'/static/main.js',
				'/static/manifest.json',
			]);
		})
	);
});

self.addEventListener('fetch', event => {
	event.respondWith(caches.match(event.request).then(response => {
		if (response !== undefined) {
			return response;
		} else {
			return fetch(event.request).then(response => {
				let responseClone = response.clone();
				
				caches.open(versionNumber).then(cache => {
					cache.put(event.request, responseClone);
				});
				return response;
			}).catch(() => {
				return caches.match('/static/logo/1337.png');
			});
		}
	}));
});

self.addEventListener('activate', event => {
	const cacheKeeplist = [ versionNumber ];

	event.waitUntil(
		caches.keys().then(keyList => {
			return Promise.all(keyList.map(key => {
				if (cacheKeeplist.indexOf(key) === -1)
					return caches.delete(key);
			}));
		})
	);
});
