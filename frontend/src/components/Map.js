import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Form, Input, Select, Button, message, Spin } from 'antd';
import axios from 'axios';
import GMLLayerViewer from './GMLLayerViewer';
import LayerControl from './LayerControl';

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

const MapComponent = memo(({ mapContainer, onMapLoad }) => {
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

    map.current.on('load', () => {
      console.log('Карта загружена');
      onMapLoad(map.current);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapContainer, onMapLoad]);

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

// Добавляем localStorage для кэширования
const LOCAL_STORAGE_PREFIX = 'mgis_ogs_cache_';
const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 дней в миллисекундах

// Функция для сохранения данных в кэш
const saveToCache = (key, data) => {
  try {
    const cacheItem = {
      timestamp: Date.now(),
      data: data
    };
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(cacheItem));
    console.log(`Данные слоя ${key} кэшированы успешно`);
    return true;
  } catch (error) {
    console.warn(`Не удалось кэшировать данные слоя ${key}:`, error);
    return false;
  }
};

// Функция для получения данных из кэша
const getFromCache = (key) => {
  try {
    const cacheItemStr = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    if (!cacheItemStr) return null;
    
    const cacheItem = JSON.parse(cacheItemStr);
    
    // Проверяем срок годности кэша
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRATION) {
      console.log(`Кэш слоя ${key} устарел, удаляем`);
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + key);
      return null;
    }
    
    console.log(`Данные слоя ${key} загружены из кэша`);
    return cacheItem.data;
  } catch (error) {
    console.warn(`Ошибка при получении данных из кэша для слоя ${key}:`, error);
    return null;
  }
};

const Map = () => {
  const mapContainer = useRef(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [visibleLayers, setVisibleLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState({});

  const [predefinedLayers, setPredefinedLayers] = useState([
    { 
      id: 'category_39892', 
      name: 'Муниципальные образования РФ', 
      path: '/media/layer_category_39892.geojson' 
    }
  ]);

  const onMapLoad = useCallback(async (map) => {
    console.log('Карта загружена в Map компоненте');
    setMapInstance(map);

    // Проверка, размещено ли приложение на GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github.io');
    
    if (isGitHubPages) {
      message.info('Приложение размещено на GitHub Pages. Большие файлы данных недоступны, используйте локальную версию или загрузите свои данные.');
    }
    
    // Получаем текущий hostname для создания абсолютного пути
    // Это поможет обеспечить одинаковую работу и на localhost, и на 127.0.0.1
    const currentHostname = window.location.hostname;
    const currentPort = window.location.port ? `:${window.location.port}` : '';
    const currentProtocol = window.location.protocol;
    
    // Загружаем предустановленные слои
    for (const layer of predefinedLayers) {
      if (layer.path) {
        try {
          console.log(`Загрузка слоя: ${layer.name} (${layer.path})`);
          
          // Отмечаем слой как загружаемый
          setLayersLoading(prev => ({...prev, [layer.id]: true}));
          
          // Если это GitHub Pages, не пытаемся загрузить большие файлы
          if (isGitHubPages) {
            // Создаем тестовый слой с примером данных вместо реальных
            const testGeoJSON = {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "properties": { 
                    "name": layer.name,
                    "note": "Тестовые данные для GitHub Pages"
                  },
                  "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                      [
                        [37.5173, 55.6558],
                        [37.7273, 55.6558],
                        [37.7273, 55.8658],
                        [37.5173, 55.8658],
                        [37.5173, 55.6558]
                      ]
                    ]
                  }
                }
              ]
            };
            
            // Добавляем тестовый слой на карту
            map.addSource(layer.id, {
              type: 'geojson',
              data: testGeoJSON
            });
            
            map.addLayer({
              id: layer.id,
              type: 'fill',
              source: layer.id,
              paint: {
                'fill-color': '#FF9800',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              },
              layout: {
                visibility: 'visible'
              }
            });
            
            // Добавляем слой в список видимых слоев
            setVisibleLayers(prev => {
              const newLayers = [...prev, layer.id];
              return newLayers;
            });
            
            // Помечаем слой как загруженный
            setLayersLoading(prev => ({...prev, [layer.id]: false}));
            
            continue;
          }
          
          // Сначала проверяем кэш
          const cachedData = getFromCache(layer.id);
          if (cachedData) {
            console.log(`Используем кэшированные данные для слоя ${layer.name}`);
            
            // Добавляем кэшированный слой на карту
            map.addSource(layer.id, {
              type: 'geojson',
              data: cachedData
            });
            
            map.addLayer({
              id: layer.id,
              type: 'fill',
              source: layer.id,
              paint: {
                'fill-color': '#4CAF50',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              },
              layout: {
                visibility: 'visible'
              }
            });
            
            // Добавляем слой в список видимых слоев
            setVisibleLayers(prev => {
              const newLayers = [...prev, layer.id];
              return newLayers;
            });
            
            // Помечаем слой как загруженный
            setLayersLoading(prev => ({...prev, [layer.id]: false}));
            
            continue;
          }
          
          // Используем абсолютный и относительный пути для проверки
          const pathsToTry = [
            layer.path, // Относительный путь
            layer.path.startsWith('/') ? layer.path.substring(1) : `/${layer.path}`, // Альтернативный относительный путь
            `${currentProtocol}//${currentHostname}${currentPort}${layer.path.startsWith('/') ? layer.path : `/${layer.path}`}` // Абсолютный путь
          ];
          
          let response = null;
          let usedPath = '';
          
          // Проверяем пути
          for (const path of pathsToTry) {
            try {
              console.log(`Пробуем путь: ${path}`);
              
              // Добавляем случайный параметр для предотвращения кэширования браузером при необходимости
              const cacheBuster = path.includes('?') ? `&_=${new Date().getTime()}` : `?_=${new Date().getTime()}`;
              const url = `${path}${cacheBuster}`;
              
              // Используем axios для загрузки
              const tempResponse = await axios.get(url, {
                responseType: 'text',
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'Cache-Control': 'no-cache'
                },
                validateStatus: status => status < 400
              });
              
              if (tempResponse.status < 400) {
                response = tempResponse;
                usedPath = path;
                console.log(`Успешно загружен файл по пути: ${path}`);
                break;
              }
            } catch (e) {
              console.log(`Путь ${path} недоступен`);
            }
          }
          
          // Если файл не найден, используем тестовый полигон
          if (!response) {
            console.warn(`Файл не найден по указанным путям, используем тестовый полигон`);
            const testGeoJSON = {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "properties": { "source": "test-fallback" },
                  "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                      [
                        [37.6173, 55.7558],
                        [37.6273, 55.7558],
                        [37.6273, 55.7658],
                        [37.6173, 55.7658],
                        [37.6173, 55.7558]
                      ]
                    ]
                  }
                }
              ]
            };
            
            // Добавляем тестовый слой на карту
            map.addSource(layer.id, {
              type: 'geojson',
              data: testGeoJSON
            });
            
            map.addLayer({
              id: layer.id,
              type: 'fill',
              source: layer.id,
              paint: {
                'fill-color': '#FF9800',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              },
              layout: {
                visibility: 'visible'
              }
            });
            
            // Добавляем слой в список видимых слоев
            setVisibleLayers(prev => {
              const newLayers = [...prev, layer.id];
              console.log('Текущие видимые слои:', newLayers);
              return newLayers;
            });
            
            message.warning(`Не удалось загрузить слой ${layer.name}, отображен тестовый полигон`);
            
            // Помечаем слой как загруженный
            setLayersLoading(prev => ({...prev, [layer.id]: false}));
            
            continue;
          }
          
          let geoJSON = null;
          
          // Определяем формат файла
          const isGeoJSON = usedPath.toLowerCase().endsWith('.geojson');
          const isGML = usedPath.toLowerCase().endsWith('.gml');
          
          if (isGeoJSON) {
            // Загружаем GeoJSON
            try {
              const contentText = response.data;
              // Проверка, что это действительно JSON, а не HTML
              if (contentText.trim().startsWith('<!DOCTYPE') || contentText.trim().startsWith('<html')) {
                throw new Error('Получен HTML вместо JSON');
              }
              
              geoJSON = JSON.parse(contentText);
              console.log(`Файл GeoJSON загружен, количество features: ${geoJSON.features ? geoJSON.features.length : 0}`);
              
              // Кэшируем полученные данные
              saveToCache(layer.id, geoJSON);
              
              // Добавляем слой на карту
              map.addSource(layer.id, {
                type: 'geojson',
                data: geoJSON
              });
              
              map.addLayer({
                id: layer.id,
                type: 'fill',
                source: layer.id,
                paint: {
                  'fill-color': '#4CAF50',
                  'fill-opacity': 0.5,
                  'fill-outline-color': '#000'
                },
                layout: {
                  visibility: 'visible'
                }
              });
              
              // Добавляем слой в список видимых слоев
              setVisibleLayers(prev => {
                const newLayers = [...prev, layer.id];
                console.log('Текущие видимые слои:', newLayers);
                return newLayers;
              });
              
            } catch (jsonError) {
              console.error('Ошибка при разборе JSON', jsonError);
              
              // Создаем тестовый полигон
              geoJSON = {
                "type": "FeatureCollection",
                "features": [
                  {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                      "type": "Polygon",
                      "coordinates": [
                        [
                          [37.6173, 55.7558],
                          [37.6273, 55.7558],
                          [37.6273, 55.7658],
                          [37.6173, 55.7658],
                          [37.6173, 55.7558]
                        ]
                      ]
                    }
                  }
                ]
              };
              
              // Добавляем слой на карту
              map.addSource(layer.id, {
                type: 'geojson',
                data: geoJSON
              });
              
              map.addLayer({
                id: layer.id,
                type: 'fill',
                source: layer.id,
                paint: {
                  'fill-color': '#FF9800',
                  'fill-opacity': 0.5,
                  'fill-outline-color': '#000'
                },
                layout: {
                  visibility: 'visible'
                }
              });
              
              // Добавляем слой в список видимых слоев
              setVisibleLayers(prev => {
                const newLayers = [...prev, layer.id];
                console.log('Текущие видимые слои:', newLayers);
                return newLayers;
              });
              
              message.warning(`Ошибка при обработке GeoJSON файла для слоя ${layer.name}`);
            }
          } else if (isGML) {
            // Загружаем GML и конвертируем в GeoJSON
            const gmlText = response.data;
            
            // Проверка на HTML
            if (gmlText.trim().startsWith('<!DOCTYPE html') || gmlText.trim().startsWith('<html')) {
              console.warn('Получен HTML вместо XML');
              throw new Error('Неверный формат данных');
            }
            
            // Конвертируем GML в GeoJSON
            try {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(gmlText, 'text/xml');
              
              // Проверяем ошибки парсинга
              const parserError = xmlDoc.getElementsByTagName("parsererror");
              if (parserError.length > 0) {
                throw new Error('Ошибка парсинга XML');
              }
              
              geoJSON = GMLLayerViewer.convertGMLtoGeoJSON(xmlDoc);
              console.log(`GML конвертирован в GeoJSON`);
            } catch (xmlError) {
              console.error('Ошибка при обработке XML');
              throw new Error('Не удалось преобразовать GML в GeoJSON');
            }
          } else {
            throw new Error(`Неподдерживаемый формат файла`);
          }
          
          // Проверяем наличие features
          if (!geoJSON || !geoJSON.features || geoJSON.features.length === 0) {
            console.warn(`Файл не содержит геометрических объектов`);
            throw new Error('Файл не содержит геометрических объектов');
          }
          
          // Добавляем источник данных
          map.addSource(layer.id, {
            type: 'geojson',
            data: geoJSON
          });
          
          // Добавляем слой
          map.addLayer({
            id: layer.id,
            type: 'fill',
            source: layer.id,
            paint: {
              'fill-color': '#627BC1',
              'fill-opacity': 0.5,
              'fill-outline-color': '#000'
            },
            layout: {
              visibility: 'visible'
            }
          });
          
          // Добавляем слой в список видимых слоев
          setVisibleLayers(prev => {
            const newLayers = [...prev, layer.id];
            console.log('Текущие видимые слои:', newLayers);
            return newLayers;
          });

          // Центрируем карту на данных
          if (geoJSON.features && geoJSON.features.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            
            geoJSON.features.forEach(feature => {
              if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                const coords = feature.geometry.coordinates;
                
                if (feature.geometry.type === 'Polygon') {
                  coords[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                } else if (feature.geometry.type === 'MultiPolygon') {
                  coords.forEach(polygon => {
                    polygon[0].forEach(coord => {
                      bounds.extend(coord);
                    });
                  });
                }
              }
            });
            
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, {
                padding: 20
              });
            }
          }

          // Помечаем слой как загруженный
          setLayersLoading(prev => ({...prev, [layer.id]: false}));
          
        } catch (error) {
          console.error(`Ошибка при загрузке слоя ${layer.name}:`, error);
          message.error(`Не удалось загрузить слой ${layer.name}`);
          
          // Помечаем слой как загруженный (с ошибкой)
          setLayersLoading(prev => ({...prev, [layer.id]: false}));
        }
      }
    }
  }, [predefinedLayers]);

  const handleLayerToggle = useCallback((layerId, isVisible) => {
    if (!mapInstance) return;

    setVisibleLayers(prev => {
      const newVisibleLayers = isVisible 
        ? [...prev, layerId]
        : prev.filter(id => id !== layerId);

      // Обновляем видимость слоя на карте
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
      }

      return newVisibleLayers;
    });
  }, [mapInstance]);

  const handleFileUpload = useCallback(async (file) => {
    if (!mapInstance) return;

    // Проверяем тип файла
    const isGML = file.name.toLowerCase().endsWith('.gml');
    const isGeoJSON = file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json');
    
    if (!isGML && !isGeoJSON) {
      message.error('Поддерживаются только файлы GML и GeoJSON');
      return;
    }
    
    // Создаем уникальный ID для слоя
    const layerId = `user-layer-${Date.now()}`;
    
    try {
      message.loading({ content: 'Загрузка файла...', key: 'fileUpload' });
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          let geoJSON = null;
          
          if (isGeoJSON) {
            // Парсим GeoJSON
            try {
              geoJSON = JSON.parse(content);
              if (!geoJSON.type || !geoJSON.features) {
                throw new Error('Некорректный формат GeoJSON');
              }
            } catch (jsonError) {
              message.error('Ошибка при обработке файла GeoJSON');
              return;
            }
          } else {
            // Конвертируем GML в GeoJSON
            try {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(content, 'text/xml');
              
              // Проверяем наличие ошибок парсинга
              const parserError = xmlDoc.getElementsByTagName("parsererror");
              if (parserError.length > 0) {
                throw new Error('Ошибка парсинга XML');
              }
              
              geoJSON = GMLLayerViewer.convertGMLtoGeoJSON(xmlDoc);
              
              if (!geoJSON.features || geoJSON.features.length === 0) {
                throw new Error('GML файл не содержит геометрических объектов');
              }
            } catch (xmlError) {
              message.error('Ошибка при обработке файла GML');
              return;
            }
          }
          
          // Добавляем слой на карту
          mapInstance.addSource(layerId, {
            type: 'geojson',
            data: geoJSON
          });
          
          mapInstance.addLayer({
            id: layerId,
            type: 'fill',
            source: layerId,
            paint: {
              'fill-color': '#627BC1',
              'fill-opacity': 0.5,
              'fill-outline-color': '#000'
            }
          });
          
          // Добавляем слой в список видимых слоев
          setVisibleLayers(prev => [...prev, layerId]);
          
          // Добавляем слой в список предустановленных слоев
          setPredefinedLayers(prev => [...prev, {
            id: layerId,
            name: file.name,
            path: null // Для пользовательских файлов путь не нужен
          }]);
          
          // Центрируем карту на данных
          const bounds = new maplibregl.LngLatBounds();
          let featuresFound = false;
          
          geoJSON.features.forEach(feature => {
            if (feature.geometry) {
              if (feature.geometry.type === 'Point') {
                bounds.extend(feature.geometry.coordinates);
                featuresFound = true;
              } else if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates[0].forEach(coord => {
                  bounds.extend(coord);
                });
                featuresFound = true;
              } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(polygon => {
                  polygon[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                });
                featuresFound = true;
              }
            }
          });
          
          if (featuresFound && !bounds.isEmpty()) {
            mapInstance.fitBounds(bounds, {
              padding: 50
            });
          }
          
          message.success({ content: 'Слой успешно добавлен', key: 'fileUpload' });
        } catch (error) {
          console.error('Ошибка при обработке файла:', error);
          message.error({ content: 'Ошибка при обработке файла', key: 'fileUpload' });
        }
      };
      
      reader.onerror = () => {
        message.error({ content: 'Ошибка при чтении файла', key: 'fileUpload' });
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Ошибка при обработке файла:', error);
      message.error({ content: 'Ошибка при обработке файла', key: 'fileUpload' });
    }
  }, [mapInstance]);

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

            const sources = [
              'nspd-land-source',
              'nspd-buildings-source',
              'nspd-structures-source',
              'nspd-points-source',
              'nspd-special-zones-source',
              'nspd-cultural-heritage-source'
            ];
            
            sources.forEach(sourceId => {
              if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
              }
            });

            // Добавляем новый источник и слой
            map.addSource('nspd-search-results', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: transformedFeatures
              }
            });

            // Добавляем слой в зависимости от типа геометрии
            if (transformedFeatures[0].geometry.type === 'Point') {
              map.addLayer({
                id: 'nspd-points-layer',
                type: 'circle',
                source: 'nspd-search-results',
                paint: {
                  'circle-radius': 6,
                  'circle-color': '#FF0000',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#FFFFFF'
                }
              });
            } else {
              map.addLayer({
                id: 'nspd-polygons-layer',
                type: 'fill',
                source: 'nspd-search-results',
                paint: {
                  'fill-color': '#FF0000',
                  'fill-opacity': 0.2,
                  'fill-outline-color': '#FF0000'
                }
              });
            }

            // Центрируем карту на результатах поиска
            const bounds = new maplibregl.LngLatBounds();
            transformedFeatures.forEach(feature => {
              if (feature.geometry.type === 'Point') {
                bounds.extend(feature.geometry.coordinates);
              } else if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates[0].forEach(coord => {
                  bounds.extend(coord);
                });
              } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(polygon => {
                  polygon[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                });
              }
            });

            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15
              });
            }
          }
        }
      } catch (error) {
        console.error('Ошибка при запросе к API:', error);
        message.error('Ошибка при выполнении поиска');
      }
    } catch (error) {
      console.error('Ошибка при получении ссылки на карту:', error);
      message.error('Ошибка при инициализации карты');
    } finally {
      setLoading(false);
    }
  }, []);

  // Компонент индикатора загрузки слоев
  const LayerLoadingIndicator = () => {
    const anyLayerLoading = Object.values(layersLoading).some(status => status);
    
    if (!anyLayerLoading) return null;
    
    return (
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '10px',
        borderRadius: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        zIndex: 2
      }}>
        <Spin size="small" /> <span style={{ marginLeft: '10px' }}>Загрузка слоев...</span>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <MapComponent mapContainer={mapContainer} onMapLoad={onMapLoad} />
      <SearchPanel form={form} loading={loading} onSearch={onSearch} />
      <LayerControl
        predefinedLayers={predefinedLayers}
        visibleLayers={visibleLayers}
        onLayerToggle={handleLayerToggle}
        onFileUpload={handleFileUpload}
      />
      <LayerLoadingIndicator />
    </div>
  );
};

export default memo(Map); 