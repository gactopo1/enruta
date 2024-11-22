self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open('v1').then(async function (cache) {
            const resources = [
                './',
                './index.html',
                './ruta.css',
                './ruta.js',
                './map.js',
                './ruta.ico'
            ];

            for (const resource of resources) {
                try {
                    console.log(`Intentando agregar al caché: ${resource}`);
                    await cache.add(resource);
                } catch (error) {
                    console.error(`Error al agregar ${resource}:`, error);
                }
            }
        })
    );
});



self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    );
});
