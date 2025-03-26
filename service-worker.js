const CACHE_NAME = 'mgis-ogd-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/css/main.chunk.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Установка Service Worker и кэширование основных ресурсов
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Ошибка при кэшировании:', err);
      })
  );
});

// Стратегия обработки запросов: сначала сеть, затем кэш
self.addEventListener('fetch', event => {
  // Пропускаем запросы chrome-extension и другие не-HTTP/HTTPS запросы
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Проверяем валидность ответа
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        try {
          // Клонируем ответ для кэширования
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache)
                .catch(err => console.log('Ошибка кэширования:', err));
            })
            .catch(err => console.log('Ошибка открытия кэша:', err));
        } catch (error) {
          console.log('Ошибка при обработке ответа:', error);
        }
        
        return response;
      })
      .catch(() => {
        // При отсутствии сети, пытаемся получить из кэша
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            
            // Для HTML страниц возвращаем offline.html
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
            
            // Для остальных запросов возвращаем пустой ответ
            return Promise.resolve(new Response('', {
              status: 404,
              statusText: 'Not found'
            }));
          });
      })
  );
}); 