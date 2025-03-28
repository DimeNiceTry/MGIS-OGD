import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Form, Input, Select, Button, message } from 'antd';
import axios from 'axios';

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

const MapComponent = memo(({ mapContainer }) => {
  const map = useRef(null);

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
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
      zoom: 10
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Сохраняем ссылку на карту в DOM-элементе для доступа извне
    mapContainer.current._map = map.current;

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapContainer]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
});

// Добавляем функцию корректного преобразования из EPSG:3857 в EPSG:4326
const transformWebMercatorToWGS84 = (x, y) => {
  const lng = (x * 180) / 20037508.34;
  let lat = (y * 180) / 20037508.34;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lng, lat];
};

// Конфигурация API
const API_BASE_URL = 'https://mgis-ogd.onrender.com/api';

const Map = () => {
  const mapContainer = useRef(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onSearch = useCallback(async (values) => {
    setLoading(true);
    try {
      // Получаем ссылку на карту из сохраненного свойства
      const map = mapContainer.current?._map;
      if (!map) {
        console.error('Map reference not found');
        return;
      }

      // Получаем границы видимой области карты
      const bounds = map.getBounds();
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
          }
        });

        console.log('Полный ответ от API:', response);
        console.log('Ответ от API (data):', response.data);

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
              if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
              }
            });
            
            if (map.getSource('nspd-search')) {
              map.removeSource('nspd-search');
            }

            // Добавляем новый источник и слои
            map.addSource('nspd-search', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: transformedFeatures
              }
            });

            // Добавляем слой для земельных участков (полигоны)
            map.addLayer({
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
            map.addLayer({
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
            map.addLayer({
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
            map.addLayer({
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
            map.addLayer({
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
            map.addLayer({
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
              map.fitBounds(bounds, { padding: 50 });
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
        console.error('Error fetching data:', error);
        message.error('Ошибка при поиске объектов');
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error in search function:', error);
      message.error('Произошла ошибка');
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <MapComponent mapContainer={mapContainer} />
      <SearchPanel form={form} loading={loading} onSearch={onSearch} />
    </div>
  );
};

export default memo(Map); 