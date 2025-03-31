import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Form, Input, Select, Button, message } from 'antd';
import axios from 'axios';
import GMLLayerViewer from './GMLLayerViewer';

// Защита от циклических перезагрузок
const MAX_RELOAD_COUNT = 3;
const RELOAD_TIMEOUT = 2000; // 2 секунды

// Проверяем, была ли страница перезагружена слишком много раз
const checkReloadCycles = () => {
  const now = new Date().getTime();
  const reloadTime = localStorage.getItem('lastReload');
  const reloadCount = parseInt(localStorage.getItem('reloadCount') || '0');
  
  if (reloadTime && now - parseInt(reloadTime) < RELOAD_TIMEOUT) {
    // Если перезагрузка произошла менее чем 2 секунды назад
    localStorage.setItem('reloadCount', (reloadCount + 1).toString());
    
    if (reloadCount >= MAX_RELOAD_COUNT) {
      // Слишком много перезагрузок - останавливаем цикл
      console.error('Обнаружен цикл перезагрузок, останавливаем...');
      localStorage.removeItem('reloadCount');
      return false;
    }
  } else {
    // Первая загрузка или прошло больше времени
    localStorage.setItem('reloadCount', '0');
  }
  
  localStorage.setItem('lastReload', now.toString());
  return true;
};

// Проверяем при загрузке страницы
if (!checkReloadCycles()) {
  // Если обнаружен цикл перезагрузок, не загружаем карту
  console.error('Загрузка карты отменена из-за цикла перезагрузок');
}

const { Option } = Select;

const thematicSearchOptions = [
  { value: 'objects', label: 'Объекты' },
  { value: 'cad_del', label: 'Кадастровые деления' },
  { value: 'admin_del', label: 'Административные деления' },
  { value: 'zouit', label: 'ЗОУИТ' },
  { value: 'ter_zone', label: 'Территориальные зоны' }
];

const SearchForm = memo(({ form, loading, onSearch }) => (
  <Form
    form={form}
    onFinish={onSearch}
    layout="vertical"
  >
    <Form.Item
      name="query"
      label="Поисковый запрос"
      rules={[{ required: true, message: 'Введите поисковый запрос' }]}
    >
      <Input placeholder="Введите запрос" />
    </Form.Item>

    <Form.Item
      name="thematicSearch"
      label="Тематический поиск"
      rules={[{ required: true, message: 'Выберите тип поиска' }]}
    >
      <Select placeholder="Выберите тип поиска">
        {thematicSearchOptions.map(option => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
      </Select>
    </Form.Item>

    <Form.Item>
      <Button type="primary" htmlType="submit" loading={loading} block>
        Поиск
      </Button>
    </Form.Item>
  </Form>
));

const SearchPanel = memo(({ form, loading, onSearch }) => (
  <div style={{ 
    position: 'absolute', 
    top: '10px', 
    left: '10px', 
    background: 'white', 
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    zIndex: 1,
    maxWidth: '300px'
  }}>
    <SearchForm form={form} loading={loading} onSearch={onSearch} />
  </div>
));

// Добавляем функцию корректного преобразования из EPSG:3857 в EPSG:4326
const transformWebMercatorToWGS84 = (x, y) => {
  const lng = (x * 180) / 20037508.34;
  let lat = (y * 180) / 20037508.34;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lng, lat];
};

// Конфигурация API
const API_BASE_URL = 'https://mgis-ogd.onrender.com/api';

// Проверяем загрузку стилей
const checkStylesLoaded = () => {
  console.log('Проверка загрузки стилей MapLibre GL...');
  
  // Проверяем наличие стилей в head
  const styleSheet = document.querySelector('link[href*="maplibre-gl.css"]');
  if (styleSheet) {
    console.log('Стили MapLibre GL найдены в head');
    return true;
  }

  // Проверяем наличие стилей в body
  const styleSheetInBody = document.querySelector('body link[href*="maplibre-gl.css"]');
  if (styleSheetInBody) {
    console.log('Стили MapLibre GL найдены в body');
    return true;
  }

  console.log('Стили не найдены, добавляем программно...');
  
  // Пробуем добавить стили программно
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
  link.onload = () => {
    console.log('Стили MapLibre GL успешно загружены');
    // Проверяем, что стили действительно применились
    const checkStyle = document.createElement('div');
    checkStyle.className = 'maplibregl-map';
    document.body.appendChild(checkStyle);
    const computedStyle = window.getComputedStyle(checkStyle);
    console.log('Проверка стилей maplibregl-map:', computedStyle);
    document.body.removeChild(checkStyle);
  };
  link.onerror = (e) => console.error('Ошибка загрузки стилей MapLibre GL:', e);
  document.head.appendChild(link);
  
  return true;
};

const Map = () => {
  const mapContainer = useRef(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [error, setError] = useState(null);

  // Инициализация карты
  useEffect(() => {
    console.log('Начало инициализации карты');
    console.log('mapContainer.current:', mapContainer.current);
    
    if (mapInstance) {
      console.log('Карта уже инициализирована');
      return;
    }

    // Проверяем загрузку стилей
    if (!checkStylesLoaded()) {
      console.error('Стили не загружены');
      setError('Ошибка загрузки стилей карты');
      return;
    }

    try {
      console.log('Создание экземпляра карты...');
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm',
              minzoom: 0,
              maxzoom: 19
            }
          ]
        },
        center: [37.6173, 55.7558], // Москва
        zoom: 10,
        preserveDrawingBuffer: true,
        fadeDuration: 0,
        trackResize: true
      });

      console.log('Карта создана, добавляем обработчики событий...');

      map.on('error', (e) => {
        console.error('Ошибка карты:', e);
        setError('Ошибка инициализации карты');
      });

      map.on('load', () => {
        console.log('Карта успешно загружена');
        setMapInstance(map);
        setError(null);
        
        // Принудительно обновляем размер карты
        map.resize();
      });

      map.on('style.load', () => {
        console.log('Стиль карты загружен');
        // Принудительно обновляем размер карты после загрузки стиля
        map.resize();
      });

      map.on('render', () => {
        if (map.loaded() && !map.isMoving()) {
          console.log('Карта отрендерена');
        }
      });

      map.on('tile.load', () => {
        console.log('Тайл загружен');
      });

      map.on('tile.error', (e) => {
        console.error('Ошибка загрузки тайла:', e);
      });

      console.log('Добавляем элементы управления...');
      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      return () => {
        console.log('Очистка карты...');
        if (map) {
          map.remove();
        }
      };
    } catch (err) {
      console.error('Ошибка при создании карты:', err);
      setError('Ошибка при создании карты');
    }
  }, [mapInstance]);

  const onSearch = useCallback(async (values) => {
    setLoading(true);
    try {
      // Заменяем получение ссылки на карту
      if (!mapInstance) {
        console.error('Map reference not found');
        return;
      }

      // Получаем границы видимой области карты
      const bounds = mapInstance.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      console.log('Отправляем запрос на:', `${API_BASE_URL}/nspd/thematic-search/`);
      console.log('Параметры запроса:', {
        query: values.query,
        thematicSearch: values.thematicSearch,
        north: ne.lat,
        east: ne.lng,
        south: sw.lat,
        west: sw.lng
      });

      try {
        const response = await axios.get(`${API_BASE_URL}/nspd/thematic-search/`, {
          params: {
            query: values.query,
            thematicSearch: values.thematicSearch,
            north: ne.lat,
            east: ne.lng,
            south: sw.lat,
            west: sw.lng,
            _v: Date.now()
          },
          timeout: 15000 // 15 секунд таймаут
        });

        console.log('Полный ответ от API:', response);
        console.log('Ответ от API (data):', response.data);
        
        // Проверяем наличие сообщения об ошибке от бэкенда
        if (response.data && response.data.error) {
          console.error('Ошибка API:', response.data.error);
          message.error(`Ошибка: ${response.data.error}`);
          
          // Пробуем использовать fallback API
          console.log('Пробуем использовать fallback API...');
          try {
            const fallbackResponse = await axios.get(`${API_BASE_URL}/nspd/fallback/`);
            if (fallbackResponse.data && fallbackResponse.data.message) {
              message.warning(fallbackResponse.data.message);
            }
            response.data = fallbackResponse.data;
          } catch (fallbackError) {
            console.error('Ошибка при запросе к fallback API:', fallbackError);
            setLoading(false);
            return;
          }
        }

        // Получаем features из ответа, проверяя разные структуры данных
        let features = null;
        
        // Пробуем различные структуры данных
        if (response.data && response.data.features) {
          console.log('Используем структуру: response.data.features');
          features = response.data.features;
        } else if (response.data && response.data.data && response.data.data.features) {
          console.log('Используем структуру: response.data.data.features');
          features = response.data.data.features;
        } else if (response.data && response.data.data && response.data.data.data && response.data.data.data.features) {
          console.log('Используем структуру: response.data.data.data.features');
          features = response.data.data.data.features;
        } else if (response.data && response.data.type === 'FeatureCollection' && response.data.features) {
          console.log('Используем структуру: response.data.features (FeatureCollection)');
          features = response.data.features;
        }
        
        if (!features) {
          console.error('Структура данных не соответствует ожидаемым форматам:', response.data);
          message.error('Неизвестная структура ответа от API');
          setLoading(false);
          return;
        }
        
        if (features && features.length > 0) {
          console.log('Найдено features:', features.length);

          // Преобразуем координаты из EPSG:3857 в EPSG:4326
          const transformedFeatures = features.map(feature => {
            console.log('Исходная геометрия:', feature.geometry);
            if (feature.geometry && feature.geometry.coordinates) {
              const transformedGeometry = { ...feature.geometry };
              
              if (feature.geometry.type === 'Point') {
                const [x, y] = feature.geometry.coordinates;
                // Проверяем, что координаты являются числами
                if (typeof x === 'number' && typeof y === 'number') {
                  transformedGeometry.coordinates = transformWebMercatorToWGS84(x, y);
                  console.log('Преобразованные координаты точки:', transformedGeometry.coordinates);
                } else {
                  console.error('Некорректные координаты точки:', feature.geometry.coordinates);
                  return null;
                }
              } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                try {
                  transformedGeometry.coordinates = feature.geometry.coordinates.map(ring => {
                    if (Array.isArray(ring)) {
                      return ring.map(coord => {
                        if (Array.isArray(coord) && coord.length >= 2 && 
                            typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                          return transformWebMercatorToWGS84(coord[0], coord[1]);
                        }
                        return null;
                      }).filter(coord => coord !== null);
                    }
                    return null;
                  }).filter(ring => ring !== null && ring.length > 0);
                  
                  console.log('Преобразованные координаты полигона:', transformedGeometry.coordinates);
                } catch (error) {
                  console.error('Ошибка при обработке полигона:', error);
                  return null;
                }
              }
              
              return {
                ...feature,
                geometry: transformedGeometry
              };
            }
            return null;
          }).filter(feature => feature !== null);

          console.log('Преобразовано features:', transformedFeatures.length);

          if (transformedFeatures.length > 0) {
            // Удаляем предыдущие слои и источник, если они существуют
            const layers = [
              'nspd-land-layer',
              'nspd-buildings-layer',
              'nspd-structures-layer',
              'nspd-points-layer',
              'nspd-special-zones-layer',
              'nspd-cultural-heritage-layer'
            ];
            
            layers.forEach(layerId => {
              if (mapInstance.getLayer(layerId)) {
                mapInstance.removeLayer(layerId);
              }
            });
            
            if (mapInstance.getSource('nspd-search')) {
              mapInstance.removeSource('nspd-search');
            }

            // Добавляем новый источник и слои
            mapInstance.addSource('nspd-search', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: transformedFeatures
              }
            });

            // Добавляем слой для земельных участков (полигоны)
            mapInstance.addLayer({
              id: 'nspd-land-layer',
              type: 'fill',
              source: 'nspd-search',
              filter: ['all',
                ['any', 
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'categoryName'], 'Земельные участки ЕГРН']
              ],
              paint: {
                'fill-color': '#088',
                'fill-opacity': 0.8,
                'fill-outline-color': '#000'
              }
            });

            // Добавляем слой для зданий (полигоны)
            mapInstance.addLayer({
              id: 'nspd-buildings-layer',
              type: 'fill',
              source: 'nspd-search',
              filter: ['all',
                ['any', 
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'categoryName'], 'Здания']
              ],
              paint: {
                'fill-color': '#f00',
                'fill-opacity': 0.8,
                'fill-outline-color': '#000'
              }
            });

            // Добавляем слой для сооружений (полигоны)
            mapInstance.addLayer({
              id: 'nspd-structures-layer',
              type: 'fill',
              source: 'nspd-search',
              filter: ['all',
                ['any', 
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'categoryName'], 'Сооружения']
              ],
              paint: {
                'fill-color': '#0f0',
                'fill-opacity': 0.8,
                'fill-outline-color': '#000'
              }
            });

            // Добавляем слой для зон с особыми условиями (полигоны)
            mapInstance.addLayer({
              id: 'nspd-special-zones-layer',
              type: 'fill',
              source: 'nspd-search',
              filter: ['all',
                ['any', 
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'categoryName'], 'Зоны с особыми условиями использования территории']
              ],
              paint: {
                'fill-color': '#ff0',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              }
            });

            // Добавляем слой для объектов культурного наследия (полигоны)
            mapInstance.addLayer({
              id: 'nspd-cultural-heritage-layer',
              type: 'fill',
              source: 'nspd-search',
              filter: ['all',
                ['any', 
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'categoryName'], 'Территории объектов культурного наследия, включенных в единый государственный реестр объектов культурного наследия (памятников истории и культуры) народов Российской Федерации']
              ],
              paint: {
                'fill-color': '#f0f',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              }
            });

            // Добавляем слой для точек (все типы)
            mapInstance.addLayer({
              id: 'nspd-points-layer',
              type: 'circle',
              source: 'nspd-search',
              filter: ['==', ['geometry-type'], 'Point'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#000',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
              }
            });

            // Приближаем карту к найденным объектам
            const bounds = new maplibregl.LngLatBounds();
            let hasValidCoordinates = false;
            
            transformedFeatures.forEach(feature => {
              if (feature.geometry && feature.geometry.coordinates) {
                if (feature.geometry.type === 'Point') {
                  bounds.extend(feature.geometry.coordinates);
                  hasValidCoordinates = true;
                } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                  feature.geometry.coordinates.forEach(ring => {
                    if (Array.isArray(ring[0])) {
                      ring.forEach(coord => {
                        if (coord && coord.length >= 2) {
                          bounds.extend(coord);
                          hasValidCoordinates = true;
                        }
                      });
                    } else if (ring && ring.length >= 2) {
                      bounds.extend(ring);
                      hasValidCoordinates = true;
                    }
                  });
                }
              }
            });
            
            if (hasValidCoordinates) {
              mapInstance.fitBounds(bounds, { padding: 50 });
            }
            
            message.success(`Найдено объектов: ${transformedFeatures.length}`);
          } else {
            message.info('Объекты не найдены');
          }
        } else {
          console.error('Некорректная структура ответа:', response.data);
          message.error('Ошибка при обработке данных');
        }
      } catch (error) {
        console.error('Ошибка при запросе к API:', error);
        
        // Пробуем использовать fallback API
        console.log('Произошла ошибка, пробуем использовать fallback API...');
        try {
          const fallbackResponse = await axios.get(`${API_BASE_URL}/nspd/fallback/`);
          if (fallbackResponse.data && fallbackResponse.data.message) {
            message.warning(fallbackResponse.data.message);
          }
        } catch (fallbackError) {
          console.error('Ошибка при запросе к fallback API:', fallbackError);
          message.error('Не удалось получить данные от API');
        }
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      message.error('Произошла неожиданная ошибка');
      setLoading(false);
    }
  }, [mapInstance]);

  if (error) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        background: '#f0f2f5'
      }}>
        <div style={{ 
          padding: '20px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <h2 style={{ color: '#ff4d4f', marginBottom: '10px' }}>Ошибка загрузки карты</h2>
          <p>{error}</p>
          <Button type="primary" onClick={() => window.location.reload()}>
            Перезагрузить страницу
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#f0f2f5'
    }}>
      <SearchPanel form={form} loading={loading} onSearch={onSearch} />
      {mapInstance && <GMLLayerViewer map={mapInstance} gmlFilePath="layer_category_39892.gml" />}
      <div 
        ref={mapContainer} 
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          display: 'block'
        }} 
      />
    </div>
  );
};

export default memo(Map); 