const CACHE_NAME = 'mgis-ogd-v2';
const STATIC_CACHE = 'mgis-ogd-static-v2';
const API_CACHE = 'mgis-ogd-api-v2';
const MAP_TILES_CACHE = 'mgis-ogd-tiles-v2';
const LAYER_CACHE = 'mgis-ogd-layers-v2';

const staticResources = [
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
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Кэширование статических ресурсов');
        return cache.addAll(staticResources);
      })
      .catch(err => {
        console.error('Ошибка при кэшировании статических ресурсов:', err);
      })
  );
  
  // Принудительное применение нового service worker
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Список кэшей, которые нужно сохранить
  const cacheWhitelist = [STATIC_CACHE, API_CACHE, MAP_TILES_CACHE, LAYER_CACHE];
  
  event.waitUntil(
    // Очистка старых версий кэша
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Удаление устаревшего кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker активирован и готов обрабатывать запросы');
      return self.clients.claim();
    })
  );
});

// Функция для определения типа запроса
const getRequestType = (request) => {
  const url = new URL(request.url);
  
  // Проверка на OSM или другие тайлы карты
  if (url.href.includes('tile.openstreetmap.org') || 
      url.pathname.endsWith('.pbf') || 
      url.pathname.endsWith('.png') ||
      url.href.includes('a.tile.') ||
      url.href.includes('b.tile.') ||
      url.href.includes('c.tile.')) {
    return 'map-tile';
  }
  
  // Проверка на GeoJSON слои
  if (url.pathname.endsWith('.geojson') || 
      url.pathname.includes('/media/') ||
      url.pathname.includes('/api/maps/layers/')) {
    return 'layer';
  }
  
  // Проверка на API запросы
  if (url.pathname.startsWith('/api/')) {
    return 'api';
  }
  
  // Проверка на статические ресурсы
  if (staticResources.includes(url.pathname) || 
      url.pathname.startsWith('/static/')) {
    return 'static';
  }
  
  // По умолчанию - обычный запрос
  return 'normal';
};

// Функция для безопасного fetch с учетом CORS
const safeFetch = (request) => {
  // Создаем новый запрос с mode: 'cors', чтобы обойти проблемы с CORS
  const newRequest = new Request(request, {
    mode: 'cors',
    credentials: 'same-origin',
    cache: 'no-cache',
    redirect: 'follow'
  });

  return fetch(newRequest)
    .then(response => {
      // Проверяем статус ответа
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    });
};

// Обработка запросов с разными стратегиями кэширования
self.addEventListener('fetch', event => {
  // Пропускаем запросы chrome-extension и другие не-HTTP/HTTPS запросы
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  const requestType = getRequestType(event.request);
  
  switch (requestType) {
    case 'map-tile':
      // Стратегия для тайлов карты: cache-first
      event.respondWith(
        caches.open(MAP_TILES_CACHE).then(cache => {
          return cache.match(event.request).then(response => {
            if (response) {
              // Возвращаем из кэша, но обновляем кэш в фоне
              const fetchPromise = fetch(event.request).then(networkResponse => {
                // Создаем клон для кэширования
                const responseToCache = networkResponse.clone();
                cache.put(event.request, responseToCache);
                return networkResponse;
              }).catch(() => {
                console.log('Не удалось обновить тайл в кэше, используем существующий');
              });
              
              return response;
            }
            
            // Если нет в кэше, получаем из сети и кэшируем
            return fetch(event.request).then(networkResponse => {
              // Создаем два клона ответа - для возврата и для кэширования
              const responseToReturn = networkResponse.clone();
              const responseToCache = networkResponse.clone();
              cache.put(event.request, responseToCache);
              return responseToReturn;
            }).catch(error => {
              console.error('Не удалось загрузить тайл карты:', error);
              return new Response('Тайл недоступен', { status: 404 });
            });
          });
        })
      );
      break;
      
    case 'layer':
      // Стратегия для слоев: cache-first с более надежной обработкой ошибок
      event.respondWith(
        caches.open(LAYER_CACHE)
          .then(cache => {
            return cache.match(event.request)
              .then(response => {
                // Если есть в кэше, возвращаем его и обновляем кэш в фоне
                if (response) {
                  // Фоновое обновление кэша без влияния на текущий ответ
                  safeFetch(event.request)
                    .then(networkResponse => {
                      try {
                        // Клонируем ответ перед сохранением в кэш
                        const responseToCache = networkResponse.clone();
                        cache.put(event.request, responseToCache);
                      } catch (error) {
                        console.error('Ошибка при обновлении кэша слоя:', error);
                      }
                    })
                    .catch(error => {
                      console.log('Не удалось обновить слой, используем кэшированный:', error.message);
                    });
                  
                  return response;
                }
                
                // Если в кэше нет, пробуем загрузить из сети
                return safeFetch(event.request)
                  .then(networkResponse => {
                    try {
                      // Клонируем ответ перед любыми операциями
                      const responseToReturn = networkResponse.clone();
                      // Отдельный клон для кэширования
                      const responseToCache = networkResponse.clone();
                      cache.put(event.request, responseToCache);
                      return responseToReturn;
                    } catch (error) {
                      console.error('Ошибка при обработке ответа слоя:', error);
                      return networkResponse;
                    }
                  })
                  .catch(error => {
                    console.log('Слой недоступен в сети и в кэше:', error.message);
                    // Возвращаем пустой GeoJSON если не удалось получить данные
                    return new Response(JSON.stringify({
                      type: "FeatureCollection",
                      features: [],
                      cached: false,
                      error: "Слой недоступен в оффлайн-режиме"
                    }), {
                      headers: { 'Content-Type': 'application/json' }
                    });
                  });
              })
              .catch(error => {
                console.error('Ошибка при проверке кэша для слоя:', error);
                // Пробуем получить из сети напрямую, если была ошибка с кэшем
                return safeFetch(event.request)
                  .catch(() => {
                    return new Response(JSON.stringify({
                      type: "FeatureCollection",
                      features: [],
                      error: "Ошибка при работе с кэшем слоев"
                    }), {
                      headers: { 'Content-Type': 'application/json' }
                    });
                  });
              });
          })
          .catch(error => {
            console.error('Ошибка при открытии кэша слоев:', error);
            // Если не удалось открыть кэш, пробуем получить из сети напрямую
            return safeFetch(event.request)
              .catch(error => {
                console.error('Полная ошибка при получении слоя:', error);
                return new Response(JSON.stringify({
                  type: "FeatureCollection",
                  features: [],
                  error: "Критическая ошибка при получении слоя"
                }), {
                  headers: { 'Content-Type': 'application/json' }
                });
              });
          })
      );
      break;
      
    case 'api':
      // Стратегия для API: network-first с более надежной обработкой ошибок
      event.respondWith(
        safeFetch(event.request)
          .then(response => {
            try {
              // Клонируем ответ перед чтением
              const responseToReturn = response.clone();
              
              // Отдельный клон для кэширования
              const responseToCache = response.clone();
              
              caches.open(API_CACHE)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                })
                .catch(err => console.error('Ошибка кэширования API ответа:', err));
              
              return responseToReturn;
            } catch (error) {
              console.error('Ошибка при обработке ответа API:', error);
              return response;
            }
          })
          .catch((error) => {
            console.log('Не удалось загрузить API:', event.request.method, `(${event.request.url}).`, error.message);
            // При отсутствии сети пытаемся получить из кэша
            return caches.match(event.request)
              .then(cachedResponse => {
                if (cachedResponse) {
                  console.log('Используем кэшированный ответ API для:', event.request.url);
                  return cachedResponse;
                }
                
                // Если нет в кэше, возвращаем заглушку
                console.log('Возвращаем заглушку для API:', event.request.url);
                return new Response(JSON.stringify({
                  error: 'Сервер недоступен, а данные отсутствуют в кэше',
                  offline: true
                }), {
                  headers: { 'Content-Type': 'application/json' }
                });
              })
              .catch(cacheError => {
                console.error('Ошибка при доступе к кэшу API:', cacheError);
                return new Response(JSON.stringify({
                  error: 'Критическая ошибка при работе с API',
                  offline: true
                }), {
                  headers: { 'Content-Type': 'application/json' }
                });
              });
          })
      );
      break;
      
    case 'static':
      // Стратегия для статических ресурсов: cache-first
      event.respondWith(
        caches.match(event.request)
          .then(response => {
            return response || fetch(event.request)
              .then(fetchResponse => {
                // Создаем клон для возврата и отдельный для кэширования
                const responseToReturn = fetchResponse.clone();
                
                caches.open(STATIC_CACHE)
                  .then(cache => {
                    // Клонируем ответ для кэширования
                    const responseToCache = fetchResponse.clone();
                    cache.put(event.request, responseToCache);
                  });
                  
                return responseToReturn;
              })
              .catch(() => {
                // Для HTML запросов показываем страницу оффлайн
                if (event.request.headers.get('accept').includes('text/html')) {
                  return caches.match('/offline.html');
                }
                
                // Для других ресурсов возвращаем ошибку
                return new Response('Ресурс недоступен в оффлайн-режиме', { 
                  status: 404, 
                  statusText: 'Not Found' 
                });
              });
          })
      );
      break;
      
    default:
      // Стратегия по умолчанию: network-first
      event.respondWith(
        fetch(event.request)
          .catch(() => {
            return caches.match(event.request)
              .then(cachedResponse => {
                if (cachedResponse) {
                  return cachedResponse;
                }
                
                // Для HTML запросов показываем страницу оффлайн
                if (event.request.headers.get('accept').includes('text/html')) {
                  return caches.match('/offline.html');
                }
                
                return new Response('Контент недоступен в оффлайн-режиме', { 
                  status: 404, 
                  statusText: 'Not Found' 
                });
              });
          })
      );
      break;
  }
}); 