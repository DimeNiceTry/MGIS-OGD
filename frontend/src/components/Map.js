import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Form, Input, Select, Button, message, Spin, Alert } from 'antd';
import axios from 'axios';
import bbox from '@turf/bbox';
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
  const R_EARTH_PI = 20037508.34;
  
  // Преобразование долготы
  let lng = (x / R_EARTH_PI) * 180;
  
  // Ограничиваем долготу в диапазоне [-180, 180]
  lng = Math.max(-180, Math.min(180, lng));
  
  // Преобразование широты
  let lat = (y / R_EARTH_PI) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  
  // Ограничиваем широту в диапазоне [-90, 90]
  lat = Math.max(-90, Math.min(90, lat));
  
  return [lng, lat];
};

// Функция для преобразования всех координат в геометрии
const transformGeometry = (geometry) => {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    console.warn('Некорректная геометрия:', geometry);
    return null;
  }
  
  // Проверяем, нужно ли преобразование (координаты в EPSG:3857)
  const needsTransform = geometry.crs && 
                        geometry.crs.properties && 
                        geometry.crs.properties.name === 'EPSG:3857';
  
  // Также проверяем по величине координат
  const firstCoord = Array.isArray(geometry.coordinates) ? 
                    (geometry.type === 'Point' ? geometry.coordinates : 
                     (Array.isArray(geometry.coordinates[0]) ? 
                      (Array.isArray(geometry.coordinates[0][0]) ? 
                       geometry.coordinates[0][0] : geometry.coordinates[0]) : null)) : null;
  
  const isBigCoordinates = firstCoord && 
                         Array.isArray(firstCoord) && 
                         firstCoord.length >= 2 && 
                         (Math.abs(firstCoord[0]) > 180 || Math.abs(firstCoord[1]) > 90);
  
  // Если геометрия не требует преобразования, возвращаем как есть
  if (!needsTransform && !isBigCoordinates) {
    return geometry;
  }
  
  console.log('Преобразование координат из EPSG:3857 в WGS84:', geometry.type);
  
  // Создаем новую геометрию
  const newGeometry = {
    type: geometry.type,
    coordinates: []
  };
  
  // В зависимости от типа геометрии выполняем преобразование
  if (geometry.type === 'Point') {
    // Для точки просто преобразуем координаты
    const [x, y] = geometry.coordinates;
    newGeometry.coordinates = transformWebMercatorToWGS84(x, y);
  } 
  else if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
    // Для линии или множества точек преобразуем каждую точку
    newGeometry.coordinates = geometry.coordinates.map(point => {
      const [x, y] = point;
      return transformWebMercatorToWGS84(x, y);
    });
  } 
  else if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') {
    // Для полигона или множества линий преобразуем каждую вложенную линию
    newGeometry.coordinates = geometry.coordinates.map(line => {
      return line.map(point => {
        const [x, y] = point;
        return transformWebMercatorToWGS84(x, y);
      });
    });
  } 
  else if (geometry.type === 'MultiPolygon') {
    // Для множества полигонов - еще один уровень вложенности
    newGeometry.coordinates = geometry.coordinates.map(polygon => {
      return polygon.map(line => {
        return line.map(point => {
          const [x, y] = point;
          return transformWebMercatorToWGS84(x, y);
        });
      });
    });
  }
  
  return newGeometry;
};

// Функция для проверки и исправления геометрии GeoJSON
const validateAndFixGeoJSON = (geojson) => {
  if (!geojson) return null;
  
  try {
    // Проверка базовой структуры GeoJSON
    if (!geojson.type) {
      console.error('GeoJSON не содержит поле type');
      return null;
    }
    
    // Если это не FeatureCollection, преобразуем его
    if (geojson.type !== 'FeatureCollection') {
      if (geojson.type === 'Feature') {
        // Одиночный объект, преобразуем в коллекцию
        return {
          type: 'FeatureCollection', 
          features: [geojson]
        };
      } else if (geojson.geometry) {
        // Объект с геометрией, но без оберток Feature
        return {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geojson,
            properties: {}
          }]
        };
      }
      
      console.error('Неподдерживаемый тип GeoJSON:', geojson.type);
      return null;
    }
    
    // Проверяем, есть ли features
    if (!geojson.features || !Array.isArray(geojson.features)) {
      console.error('GeoJSON не содержит массив features');
      return null;
    }
    
    // Проверяем и преобразуем координаты, если нужно
    let needsCoordinateTransform = false;
    
    // Проверяем CRS
    if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
      if (geojson.crs.properties.name.includes('3857')) {
        console.log('GeoJSON использует проекцию EPSG:3857, будет выполнено преобразование');
        needsCoordinateTransform = true;
      }
    }
    
    // Проверяем координаты первого объекта
    if (!needsCoordinateTransform && geojson.features.length > 0) {
      const firstFeature = geojson.features[0];
      if (firstFeature.geometry && firstFeature.geometry.coordinates) {
        // Для полигонов и линий
        let coordinates;
        if (firstFeature.geometry.type === 'Polygon' || firstFeature.geometry.type === 'MultiLineString') {
          coordinates = firstFeature.geometry.coordinates[0][0];
        } else if (firstFeature.geometry.type === 'LineString' || firstFeature.geometry.type === 'MultiPoint') {
          coordinates = firstFeature.geometry.coordinates[0];
        } else if (firstFeature.geometry.type === 'Point') {
          coordinates = firstFeature.geometry.coordinates;
        } else if (firstFeature.geometry.type === 'MultiPolygon') {
          coordinates = firstFeature.geometry.coordinates[0][0][0];
        }
        
        // Если есть координаты для проверки
        if (coordinates && Array.isArray(coordinates) && coordinates.length >= 2) {
          const [x, y] = coordinates;
          // Если координаты выходят за пределы WGS84, вероятно это другая проекция
          if (Math.abs(x) > 180 || Math.abs(y) > 90) {
            console.log(`Обнаружены координаты вне диапазона WGS84: [${x}, ${y}], предполагаем EPSG:3857`);
            needsCoordinateTransform = true;
          }
        }
      }
    }
    
    // Если нужно преобразование координат, трансформируем каждый объект
    if (needsCoordinateTransform) {
      console.log('Преобразование координат из EPSG:3857 в WGS84');
      const transformedFeatures = geojson.features.map(feature => {
        if (feature && feature.geometry) {
          const newGeometry = transformGeometry(feature.geometry);
          return {
            ...feature,
            geometry: newGeometry || feature.geometry
          };
        }
        return feature;
      });
      
      geojson = {
        ...geojson,
        features: transformedFeatures,
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
          }
        }
      };
    }
    
    // Проверяем каждый объект на корректность
    const validFeatures = geojson.features.filter(feature => {
      if (!feature || !feature.geometry || !feature.geometry.coordinates) {
        console.warn('Объект не содержит геометрию или координаты:', feature);
        return false;
      }
      return true;
    });
    
    console.log(`Проверка GeoJSON: из ${geojson.features.length} объектов валидны ${validFeatures.length}`);
    
    // Если есть хотя бы один валидный объект, возвращаем коллекцию
    if (validFeatures.length > 0) {
      return {
        ...geojson,
        features: validFeatures
      };
    } else {
      console.error('GeoJSON не содержит валидных объектов');
      return null;
    }
  } catch (error) {
    console.error('Ошибка при проверке GeoJSON:', error);
    return null;
  }
};

// Конфигурация API
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000/api';

// Эндпоинты API для работы со слоями
const API_ENDPOINTS = {
  AVAILABLE_LAYERS: `${API_BASE_URL}/maps/available-layers/`,
  LAYER_DATA: (layerId) => `${API_BASE_URL}/maps/layer-data/${layerId}`,
  THEMATIC_SEARCH: `${API_BASE_URL}/nspd/thematic-search/`
};

// Добавляем localStorage для кэширования
const LOCAL_STORAGE_PREFIX = 'mgis_ogs_cache_';
const CACHE_EXPIRATION = 30 * 24 * 60 * 60 * 1000; // 30 дней в миллисекундах

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
    
    console.log(`Использование кэшированных данных для слоя ${key}`);
    return cacheItem.data;
  } catch (error) {
    console.warn(`Ошибка при получении кэша для слоя ${key}:`, error);
    return null;
  }
};

// Получение списка кэшированных слоев
const getCachedLayerKeys = () => {
  try {
    const cachedLayers = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
        cachedLayers.push(key.replace(LOCAL_STORAGE_PREFIX, ''));
      }
    }
    return cachedLayers;
  } catch (error) {
    console.warn('Ошибка при получении списка кэшированных слоев:', error);
    return [];
  }
};

// Компонент индикатора оффлайн-режима
const OfflineIndicator = memo(({ isOffline }) => {
  if (!isOffline) return null;
  
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 10,
      maxWidth: '250px'
    }}>
      <Alert
        message="Оффлайн-режим"
        description="Вы работаете в оффлайн-режиме. Доступны только кэшированные данные."
        type="warning"
        showIcon
        banner
      />
    </div>
  );
});

// Функция для очистки всего кэша
const clearAllCache = () => {
  try {
    const cachedLayers = getCachedLayerKeys();
    cachedLayers.forEach(key => {
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + key);
    });
    localStorage.removeItem(LOCAL_STORAGE_PREFIX + 'available_layers');
    console.log('Весь кэш очищен');
    return true;
  } catch (error) {
    console.error('Ошибка при очистке кэша:', error);
    return false;
  }
};

// Функция для очистки кэша слоя
const clearLayerCache = (layerId) => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_PREFIX + layerId);
    console.log(`Кэш слоя ${layerId} очищен`);
    return true;
  } catch (error) {
    console.error(`Ошибка при очистке кэша слоя ${layerId}:`, error);
    return false;
  }
};

// Функция для обновления кэша слоя (принудительная перезагрузка)
const refreshLayerCache = async (layerId) => {
  try {
    if (!navigator.onLine) {
      message.warning('Невозможно обновить кэш в оффлайн-режиме');
      return false;
    }
    
    // Получаем актуальные данные с сервера
    const response = await axios.get(API_ENDPOINTS.LAYER_DATA(layerId));
    
    if (response.data) {
      // Обновляем кэш
      saveToCache(layerId, response.data);
      message.success(`Кэш слоя успешно обновлен`);
      return true;
    }
  } catch (error) {
    console.error(`Ошибка при обновлении кэша слоя ${layerId}:`, error);
    message.error(`Не удалось обновить кэш слоя`);
  }
  return false;
};

// Основной компонент Map
const Map = () => {
  const mapContainer = useRef(null);
  const [map, setMap] = useState(null);
  const [searchForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [availableLayers, setAvailableLayers] = useState([]);
  const [loadingLayers, setLoadingLayers] = useState({});
  const [visibleLayers, setVisibleLayers] = useState([]);
  
  // Обработчики онлайн/оффлайн статуса
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Загрузка доступных слоев при инициализации
  useEffect(() => {
    const fetchLayers = async () => {
      try {
        // Сначала проверяем кэш
        const cachedLayers = getFromCache('available_layers');
        
        if (cachedLayers) {
          console.log('Использую кэшированные слои:', cachedLayers);
          // Фильтруем слои, оставляя только Layer Category 39892
          let filteredLayers = cachedLayers.filter(layer => 
            layer.id === 'static_layer_category_39892'
          );
          
          // Если нужный слой не найден, создаем его вручную
          if (filteredLayers.length === 0) {
            const defaultLayer = {
              id: 'static_layer_category_39892',
              name: 'Муниципальные образования РФ',
              description: 'Муниципальные образования Российской Федерации',
              source_type: 'static',
              source_url: '/static/layers/layer_category_39892.geojson',
              style: {"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
            };
            filteredLayers = [defaultLayer];
            console.log('Слой категории 39892 не найден в кэше, добавлен вручную');
          } else {
            // Изменяем название слоя
            filteredLayers[0].name = 'Муниципальные образования РФ';
          }
          
          setAvailableLayers(filteredLayers);
          
          // Проверяем валидность списка видимых слоев
          const cachedVisibleLayers = getFromCache('visible_layers');
          if (cachedVisibleLayers) {
            // Убедимся, что все видимые слои существуют в списке доступных
            const validVisibleLayers = cachedVisibleLayers.filter(
              layerId => filteredLayers.some(layer => layer.id === layerId)
            );
            setVisibleLayers(validVisibleLayers);
          } else {
            // Если нет кэшированных видимых слоев, автоматически добавляем статический слой
            const defaultVisibleLayers = ['static_layer_category_39892'];
            setVisibleLayers(defaultVisibleLayers);
            saveToCache('visible_layers', defaultVisibleLayers);
            console.log('Автоматически включен слой Муниципальные образования РФ');
          }
        }
        
        // Если онлайн, запрашиваем с сервера
        if (navigator.onLine) {
          console.log('Запрашиваю слои с сервера по URL:', API_ENDPOINTS.AVAILABLE_LAYERS);
          
          const response = await axios.get(API_ENDPOINTS.AVAILABLE_LAYERS);
          
          console.log('Получен ответ от сервера со статусом:', response.status);
          console.log('Заголовки ответа:', response.headers);
          console.log('Получен ответ от сервера:', response.data);
          
          if (response.data) {
            if (Array.isArray(response.data)) {
              console.log(`Получено ${response.data.length} слоев`);
              
              // Фильтруем слои, оставляя только Layer Category 39892
              let filteredLayers = response.data.filter(layer => 
                layer.id === 'static_layer_category_39892'
              );
              
              // Если нужный слой не найден, создаем его вручную
              if (filteredLayers.length === 0) {
                const defaultLayer = {
                  id: 'static_layer_category_39892',
                  name: 'Муниципальные образования РФ',
                  description: 'Муниципальные образования Российской Федерации',
                  source_type: 'static',
                  source_url: '/static/layers/layer_category_39892.geojson',
                  style: {"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
                };
                filteredLayers = [defaultLayer];
                console.log('Слой категории 39892 не найден в ответе сервера, добавлен вручную');
              } else {
                // Изменяем название слоя
                filteredLayers[0].name = 'Муниципальные образования РФ';
              }
              
              setAvailableLayers(filteredLayers);
              saveToCache('available_layers', filteredLayers);
              
              // Проверяем валидность списка видимых слоев после получения новых данных
              const validVisibleLayers = visibleLayers.filter(
                layerId => filteredLayers.some(layer => layer.id === layerId)
              );
              
              // Если видимых слоев нет или они невалидны, включаем слой по умолчанию
              if (validVisibleLayers.length === 0) {
                const defaultVisibleLayers = ['static_layer_category_39892'];
                setVisibleLayers(defaultVisibleLayers);
                saveToCache('visible_layers', defaultVisibleLayers);
                console.log('Автоматически включен слой Муниципальные образования РФ');
              } 
              // Обновляем видимые слои, если есть изменения
              else if (validVisibleLayers.length !== visibleLayers.length) {
                setVisibleLayers(validVisibleLayers);
                saveToCache('visible_layers', validVisibleLayers);
              }
            } else {
              console.error('Ответ не является массивом:', response.data);
              message.error('Ответ с данными слоев имеет неверный формат');
            }
          } else {
            console.error('Пустой ответ от сервера');
            message.warning('Сервер вернул пустой ответ при запросе слоев');
          }
        } else if (!cachedLayers) {
          // Если оффлайн и нет кэша, показываем сообщение
          message.warn('Невозможно загрузить список слоев в оффлайн-режиме');
        }
      } catch (error) {
        console.error('Ошибка при загрузке слоев:', error);
        console.error('Детали ошибки:', error.response ? error.response.data : 'Нет данных');
        
        // Если ошибка, проверяем кэш
        const cachedLayers = getFromCache('available_layers');
        if (cachedLayers) {
          // Фильтруем кэшированные слои
          let filteredLayers = cachedLayers.filter(layer => 
            layer.id === 'static_layer_category_39892'
          );
          
          // Если нужный слой не найден, создаем его вручную
          if (filteredLayers.length === 0) {
            const defaultLayer = {
              id: 'static_layer_category_39892',
              name: 'Муниципальные образования РФ',
              description: 'Муниципальные образования Российской Федерации',
              source_type: 'static',
              source_url: '/static/layers/layer_category_39892.geojson',
              style: {"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
            };
            filteredLayers = [defaultLayer];
            console.log('Слой категории 39892 не найден в кэше при ошибке, добавлен вручную');
          } else {
            // Изменяем название слоя
            filteredLayers[0].name = 'Муниципальные образования РФ';
          }
          
          setAvailableLayers(filteredLayers);
          message.info('Используются кэшированные слои из-за ошибки сети');
        } else {
          // Если нет кэша, создаем слой вручную
          const defaultLayer = {
            id: 'static_layer_category_39892',
            name: 'Муниципальные образования РФ',
            description: 'Муниципальные образования Российской Федерации',
            source_type: 'static',
            source_url: '/static/layers/layer_category_39892.geojson',
            style: {"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
          };
          setAvailableLayers([defaultLayer]);
          message.info('Используется стандартный слой, так как не удалось загрузить данные с сервера');
        }
      }
    };
    
    fetchLayers();
  }, []);
  
  const handleMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
    
    // Для отладки можно оставить сообщение
    console.log('Карта успешно загружена');
    
    // Добавляем обработчик клика на слои результатов поиска
    mapInstance.on('click', 'search-results-layer', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const properties = feature.properties;
        
        // Собираем информацию о свойствах объекта для отображения
        const propertiesHtml = Object.entries(properties)
          .filter(([key]) => !key.startsWith('_') && key !== 'id') // Исключаем служебные поля
          .map(([key, value]) => `<strong>${key}</strong>: ${value}`)
          .join('<br/>');
        
        // Создаем всплывающее окно
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<div style="max-width: 300px; max-height: 300px; overflow: auto;">${propertiesHtml}</div>`)
          .addTo(mapInstance);
      }
    });
    
    // Добавляем обработчик клика для точечных объектов
    mapInstance.on('click', 'search-results-points', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const properties = feature.properties;
        
        // Собираем информацию о свойствах объекта для отображения
        const propertiesHtml = Object.entries(properties)
          .filter(([key]) => !key.startsWith('_') && key !== 'id') // Исключаем служебные поля
          .map(([key, value]) => `<strong>${key}</strong>: ${value}`)
          .join('<br/>');
        
        // Создаем всплывающее окно
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<div style="max-width: 300px; max-height: 300px; overflow: auto;">${propertiesHtml}</div>`)
          .addTo(mapInstance);
      }
    });
    
    // Добавляем эффект наведения курсора на объекты
    mapInstance.on('mouseenter', 'search-results-layer', () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    });
    
    mapInstance.on('mouseleave', 'search-results-layer', () => {
      mapInstance.getCanvas().style.cursor = '';
    });
    
    mapInstance.on('mouseenter', 'search-results-points', () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    });
    
    mapInstance.on('mouseleave', 'search-results-points', () => {
      mapInstance.getCanvas().style.cursor = '';
    });
  }, []);
  
  const handleSearch = useCallback(async (values) => {
    if (!map) return;
    
    const { query, thematicSearch } = values;
    
    setLoading(true);
    try {
      // Формируем кэш-ключ для этого запроса
      const cacheKey = `search_${thematicSearch}_${query}`;
      
      // Проверяем кэш
      const cachedResult = getFromCache(cacheKey);
      let searchResult;
      
      if (cachedResult && isOffline) {
        // Используем кэш в оффлайн-режиме
        searchResult = cachedResult;
        message.info('Используются кэшированные результаты поиска');
      } else {
        // Делаем запрос к API
        try {
          const bounds = map.getBounds();
          console.log(`Поиск НСПД: "${query}", тип: ${thematicSearch}, границы:`, bounds.toString());
          
          const response = await axios.get(API_ENDPOINTS.THEMATIC_SEARCH, {
            params: {
              query,
              thematic_search: thematicSearch,
              north: bounds.getNorth(),
              east: bounds.getEast(),
              south: bounds.getSouth(),
              west: bounds.getWest()
            }
          });
          
          console.log('Ответ от API:', response.status, response.statusText);
          
          // Проверяем структуру ответа
          if (response.data && typeof response.data === 'object') {
            searchResult = response.data;
            console.log(`Получены данные от API. Тип: ${searchResult.type}, количество объектов: ${searchResult.features?.length || 0}`);
            
            // Проверяем, есть ли сообщение об ошибке в ответе
            if (searchResult.message && searchResult.features && searchResult.features.length === 0) {
              console.warn('Сообщение от сервера:', searchResult.message);
            }
            
            // Кэшируем результаты, даже если они пустые
            saveToCache(cacheKey, searchResult);
          } else {
            console.error('Неверный формат ответа от API:', response.data);
            throw new Error('Неверный формат ответа от API');
          }
        } catch (error) {
          console.error('Ошибка при запросе к API:', error);
          
          if (cachedResult) {
            // Если есть кэш и произошла ошибка, используем кэш
            searchResult = cachedResult;
            message.warning('Ошибка при поиске. Используются кэшированные результаты.');
          } else {
            // Если нет кэша, создаем пустой результат
            searchResult = {
              type: "FeatureCollection",
              features: [],
              message: `Ошибка при поиске: ${error.message}`
            };
            throw error;
          }
        }
      }
      
      // Всегда пытаемся отобразить результаты на карте, даже если features пустой
      if (searchResult && searchResult.type === 'FeatureCollection') {
        // Удаляем предыдущие результаты
        if (map.getSource('search-results')) {
          map.removeLayer('search-results-layer');
          map.removeSource('search-results');
        }
        
        // Проверка наличия объектов
        const hasFeatures = searchResult.features && Array.isArray(searchResult.features) && searchResult.features.length > 0;
        console.log(`Количество объектов для отображения: ${hasFeatures ? searchResult.features.length : 0}`);
        
        if (hasFeatures) {
          // Валидируем и преобразуем геометрию каждого объекта
          const validFeatures = searchResult.features.map(feature => {
            // Создаем копию объекта
            const newFeature = { ...feature };
            
            if (feature.geometry) {
              // Преобразуем координаты, если нужно
              newFeature.geometry = transformGeometry(feature.geometry);
              
              // Если не удалось преобразовать геометрию, создаем точку по умолчанию
              if (!newFeature.geometry) {
                console.warn('Не удалось преобразовать геометрию, создаем точку по умолчанию');
                newFeature.geometry = {
                  type: 'Point',
                  coordinates: [37.6173, 55.7558] // Москва
                };
                newFeature.properties = { 
                  ...newFeature.properties,
                  invalid_geometry: true
                };
              }
            } else {
              console.warn('Объект без геометрии:', feature);
              return null; // Пропускаем объекты без геометрии
            }
            
            return newFeature;
          }).filter(Boolean); // Отфильтровываем null
          
          console.log(`Преобразованных объектов: ${validFeatures.length} из ${searchResult.features.length}`);
          
          // Дополнительная проверка на валидность геометрии
          const finalFeatures = validFeatures.filter(feature => {
            const geometry = feature.geometry;
            const isValid = geometry && 
                         geometry.type && 
                         geometry.coordinates && 
                         Array.isArray(geometry.coordinates);
            
            if (!isValid) {
              console.warn('Исключен объект с невалидной геометрией после преобразования:', feature);
            }
            
            return isValid;
          });
          
          console.log(`Итоговых объектов для отображения: ${finalFeatures.length}`);
          
          if (finalFeatures.length > 0) {
            // Создаём копию с валидными объектами
            const validResult = {
              ...searchResult,
              features: finalFeatures
            };
            
            // Добавляем новые результаты
            map.addSource('search-results', {
              type: 'geojson',
              data: validResult
            });
            
            map.addLayer({
              id: 'search-results-layer',
              type: 'fill',
              source: 'search-results',
              paint: {
                'fill-color': '#FF5733',
                'fill-opacity': 0.5,
                'fill-outline-color': '#000'
              },
              filter: ['==', '$type', 'Polygon']
            });
            
            // Добавляем слой для точечных объектов
            map.addLayer({
              id: 'search-results-points',
              type: 'circle',
              source: 'search-results',
              paint: {
                'circle-radius': 6,
                'circle-color': '#FF5733',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#000'
              },
              filter: ['==', '$type', 'Point']
            });
            
            // Приближаем карту к результатам
            try {
              const boundingBox = bbox(validResult);
              map.fitBounds(boundingBox, { padding: 50 });
            } catch (e) {
              console.error('Ошибка при приближении к объектам:', e);
              // Если не удалось приблизиться, оставляем текущий вид
            }
            
            message.success(`Найдено ${finalFeatures.length} объектов`);
          } else {
            message.info('Объекты найдены, но нет корректных геометрий для отображения');
          }
        } else {
          message.info(searchResult.message || 'Результаты поиска не найдены');
        }
      } else {
        console.error('Неверный формат результатов поиска:', searchResult);
        message.error('Ошибка при получении результатов поиска');
      }
    } catch (error) {
      console.error('Ошибка при поиске:', error);
      message.error('Произошла ошибка при поиске. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
    }
  }, [map, isOffline]);
  
  // Индикатор загрузки слоя
  const LayerLoadingIndicator = () => {
    const loadingLayerCount = Object.values(loadingLayers).filter(Boolean).length;
    
    if (loadingLayerCount === 0) return null;
    
    return (
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'white',
        padding: '10px',
        borderRadius: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        zIndex: 10
      }}>
        <Spin /> Загрузка слоев: {loadingLayerCount}
      </div>
    );
  };
  
  // Функция для переключения видимости слоя
  const handleLayerToggle = useCallback((layerId, isVisible) => {
    if (!map) return;
    
    // Находим данные слоя
    const layer = availableLayers.find(l => l.id === layerId || l.id === String(layerId));
    if (!layer) {
      console.error(`Слой с ID ${layerId} не найден`);
      return;
    }
    
    console.log(`Переключение слоя ${layerId}, тип: ${layer.source_type}, видимость: ${isVisible}`);
    
    if (isVisible) {
      // Добавляем слой в список видимых
      const newVisibleLayers = [...visibleLayers, layerId];
      setVisibleLayers(newVisibleLayers);
      saveToCache('visible_layers', newVisibleLayers);
      
      // Проверяем, есть ли источник и слой уже на карте
      if (!map.getSource(layerId)) {
        // Устанавливаем флаг загрузки
        setLoadingLayers(prev => ({ ...prev, [layerId]: true }));
        
        // Для статических слоев используем прямой URL вместо загрузки данных
        if (layer.source_type === 'static') {
          console.log(`Добавляем статический слой ${layerId} напрямую через URL`);
          
          try {
            // Добавляем источник напрямую по URL без загрузки данных
            map.addSource(layerId, {
              type: 'geojson',
              data: layer.source_url
            });
            
            // Добавляем слои для разных типов геометрии
            addLayerToMap(map, layerId, layer, null); // null означает что данные уже добавлены через источник
            message.success(`Слой "${layer.name}" добавлен`);
            
            // Приближаем к границам слоя, когда данные загрузятся
            map.once('sourcedata', (e) => {
              if (e.sourceId === layerId && map.isSourceLoaded(layerId)) {
                try {
                  // Получаем границы слоя
                  const features = map.querySourceFeatures(layerId);
                  if (features && features.length > 0) {
                    console.log(`Слой ${layerId} загружен, содержит ${features.length} объектов`);
                    
                    const bounds = map.getBounds();
                    map.fitBounds(bounds, {
                      padding: 50,
                      maxZoom: 10
                    });
                  }
                } catch (error) {
                  console.error(`Ошибка при приближении к границам: ${error}`);
                }
              }
            });
          } catch (error) {
            console.error(`Ошибка при добавлении слоя напрямую: ${error}`);
            message.error(`Ошибка при загрузке слоя "${layer.name}"`);
            setVisibleLayers(prev => prev.filter(id => id !== layerId));
          } finally {
            setLoadingLayers(prev => ({ ...prev, [layerId]: false }));
          }
        } else {
          // Для не-статических слоев используем старый подход с загрузкой через API
          // Сначала проверяем кэш
          const cachedLayer = getFromCache(layerId);
          
          if (cachedLayer && (isOffline || layer.source_type === 'static')) {
            // Используем кэшированные данные
            console.log(`Загружаем слой ${layerId} из кэша:`, cachedLayer);
            addLayerToMap(map, layerId, layer, cachedLayer);
            message.success(`Слой "${layer.name}" загружен из кэша`);
            setLoadingLayers(prev => ({ ...prev, [layerId]: false }));
          } else if (navigator.onLine) {
            // Формируем URL для запроса данных слоя
            const url = API_ENDPOINTS.LAYER_DATA(layerId);
            console.log(`Загружаем слой ${layerId} с сервера по URL:`, url);

            // Запрашиваем данные с увеличенным таймаутом
            axios.get(url, { timeout: 120000 }) // увеличиваем таймаут до 2 минут
              .then(response => {
                console.log(`Успешно загрузили слой ${layerId}:`, response.status);
                
                // Сохраняем данные в кэш и добавляем на карту
                saveToCache(layerId, response.data);
                addLayerToMap(map, layerId, layer, response.data);
                message.success(`Слой "${layer.name}" загружен`);
              })
              .catch(error => {
                console.error(`Ошибка при загрузке слоя ${layerId}:`, error);
                console.error(`Детали ошибки:`, error.response?.data || error.message);
                
                // Пробуем альтернативные пути
                // ... существующий код с попытками альтернативных путей ...
              });
          }
        }
      } else if (!map.getLayer(layerId)) {
        // Если источник есть, но слой был скрыт, показываем слой снова
        console.log(`Источник ${layerId} существует, добавляем слой обратно на карту`);
        addLayerToMap(map, layerId, layer);
      } else {
        console.log(`Слой ${layerId} уже добавлен и виден на карте`);
      }
    } else {
      // Убираем слой из списка видимых
      const newVisibleLayers = visibleLayers.filter(id => id !== layerId);
      setVisibleLayers(newVisibleLayers);
      saveToCache('visible_layers', newVisibleLayers);
      
      // Скрываем все связанные слои на карте, но оставляем источник
      const relatedLayers = [
        layerId,                // основной слой полигонов
        `${layerId}-lines`,     // слой линий
        `${layerId}-points`,    // слой точек
        `${layerId}-outline`,   // слой обводки
        `${layerId}-labels`     // слой меток
      ];
      
      // Удаляем все слои, которые существуют
      relatedLayers.forEach(id => {
        if (map.getLayer(id)) {
          console.log(`Удаляем слой ${id} с карты`);
          map.removeLayer(id);
        }
      });
    }
  }, [map, availableLayers, isOffline, visibleLayers]);
  
  // Вспомогательная функция для добавления слоя на карту
  const addLayerToMap = useCallback((map, layerId, layerConfig, data = null) => {
    try {
      // Объявляем validatedData в начале функции
      let validatedData = null;
      
      // Если есть данные, добавляем источник
      if (data && !map.getSource(layerId)) {
        console.log(`Добавляем источник ${layerId} на карту с данными`);
        try {
          // Проверяем и исправляем GeoJSON перед добавлением
          validatedData = validateAndFixGeoJSON(data);
          
          if (!validatedData) {
            console.error(`Невозможно добавить источник ${layerId}: GeoJSON невалиден`);
            return;
          }
          
          map.addSource(layerId, {
            type: 'geojson',
            data: validatedData
          });
          console.log(`Источник ${layerId} успешно добавлен`);
          
          // Проверяем наличие фич в данных для отладки
          if (validatedData.features && validatedData.features.length > 0) {
            console.log(`Источник ${layerId} содержит ${validatedData.features.length} объектов`);
            // Выводим координаты первого объекта для проверки
            if (validatedData.features[0].geometry && validatedData.features[0].geometry.coordinates) {
              console.log(`Координаты первого объекта:`, validatedData.features[0].geometry.coordinates[0][0]);
            }
          } else {
            console.warn(`Источник ${layerId} не содержит объектов или имеет неверный формат`);
          }
        } catch (error) {
          console.error(`Ошибка при добавлении источника ${layerId}:`, error);
          return;  // Прерываем выполнение, если не удалось добавить источник
        }
      } else if (map.getSource(layerId)) {
        // Если источник уже существует, получаем его данные
        try {
          console.log(`Источник ${layerId} уже существует, используем его`);
          const sourceData = map.getSource(layerId)._data;
          if (sourceData) {
            validatedData = sourceData;
          }
        } catch (error) {
          console.warn(`Не удалось получить данные из существующего источника ${layerId}:`, error);
        }
      } else if (layerConfig && layerConfig.source_url && !data) {
        // Если источник был добавлен через прямой URL, это нормально
        console.log(`Предполагается, что источник ${layerId} уже добавлен через URL`);
      } else {
        console.error(`Нет данных или существующего источника для слоя ${layerId}`);
        return;
      }
      
      // Проверяем наличие источника перед добавлением слоя
      if (!map.getSource(layerId)) {
        console.error(`Невозможно добавить слой ${layerId}: источник не существует`);
        return;
      }
      
      // Если слой еще не существует, добавляем его
      if (!map.getLayer(layerId)) {
        console.log(`Добавляем слой ${layerId} на карту`);
        try {
          // Добавляем слой для полигонов
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: layerId,
            paint: {
              'fill-color': layerConfig.style?.fillColor || '#0080ff',
              'fill-opacity': layerConfig.style?.fillOpacity || 0.5,
              'fill-outline-color': layerConfig.style?.outlineColor || '#000'
            },
            filter: ['==', '$type', 'Polygon']
          });
          console.log(`Слой полигонов ${layerId} успешно добавлен`);
          
          // Добавляем слой для линий
          const lineLayerId = `${layerId}-lines`;
          if (!map.getLayer(lineLayerId)) {
            map.addLayer({
              id: lineLayerId,
              type: 'line',
              source: layerId,
              paint: {
                'line-color': layerConfig.style?.outlineColor || '#000',
                'line-width': 2
              },
              filter: ['==', '$type', 'LineString']
            });
            console.log(`Слой линий ${lineLayerId} добавлен`);
          }
          
          // Добавляем слой для точек
          const pointLayerId = `${layerId}-points`;
          if (!map.getLayer(pointLayerId)) {
            map.addLayer({
              id: pointLayerId,
              type: 'circle',
              source: layerId,
              paint: {
                'circle-radius': 5,
                'circle-color': layerConfig.style?.fillColor || '#0080ff',
                'circle-stroke-width': 1,
                'circle-stroke-color': layerConfig.style?.outlineColor || '#000'
              },
              filter: ['==', '$type', 'Point']
            });
            console.log(`Слой точек ${pointLayerId} добавлен`);
          }
          
          // Добавляем слой обводки полигонов для лучшей видимости границ
          const outlineLayerId = `${layerId}-outline`;
          if (!map.getLayer(outlineLayerId)) {
            map.addLayer({
              id: outlineLayerId,
              type: 'line',
              source: layerId,
              paint: {
                'line-color': layerConfig.style?.outlineColor || '#000',
                'line-width': 1
              },
              filter: ['==', '$type', 'Polygon']
            });
            console.log(`Слой обводки ${outlineLayerId} добавлен`);
          }
          
          // Добавляем текстовые метки для полигонов
          const labelLayerId = `${layerId}-labels`;
          if (!map.getLayer(labelLayerId)) {
            map.addLayer({
              id: labelLayerId,
              type: 'symbol',
              source: layerId,
              layout: {
                'text-field': ['get', 'name'], // используем поле name из properties
                'text-font': ['Open Sans Regular'],
                'text-size': 12,
                'text-offset': [0, 0.6],
                'text-anchor': 'top',
                'text-allow-overlap': false,
                'text-ignore-placement': false
              },
              paint: {
                'text-color': '#000',
                'text-halo-color': '#fff',
                'text-halo-width': 2
              }
            });
            console.log(`Слой меток ${labelLayerId} добавлен`);
          }
          
          // Приближаем карту к границам слоя
          try {
            // Пытаемся использовать библиотеку turf для определения границ
            if (validatedData && validatedData.features && validatedData.features.length > 0) {
              const bounds = bbox(validatedData);
              console.log(`Границы слоя ${layerId}:`, bounds);
              if (bounds && bounds.length === 4) {
                map.fitBounds(bounds, { 
                  padding: 50,
                  animate: true,
                  maxZoom: 10  // Ограничиваем максимальный зум для больших территорий
                });
                console.log(`Карта приближена к границам слоя ${layerId}`);
              }
            } else if (map.getSource(layerId)) {
              // Альтернативный способ: получаем данные из источника, если не было validatedData
              const sourceData = map.getSource(layerId)._data;
              if (sourceData && sourceData.features && sourceData.features.length > 0) {
                const bounds = bbox(sourceData);
                if (bounds && bounds.length === 4) {
                  map.fitBounds(bounds, { 
                    padding: 50,
                    animate: true,
                    maxZoom: 10
                  });
                  console.log(`Карта приближена к границам источника ${layerId}`);
                }
              }
            }
          } catch (bboxError) {
            console.error(`Ошибка при приближении к границам слоя ${layerId}:`, bboxError);
          }
        } catch (error) {
          console.error(`Ошибка при добавлении слоя ${layerId} на карту:`, error);
        }
      }
    } catch (error) {
      console.error(`Непредвиденная ошибка при работе со слоем ${layerId}:`, error);
    }
  }, []);

  // Добавляем эффект для загрузки слоев при инициализации карты
  useEffect(() => {
    // Проверяем, есть ли карта и слои для добавления
    if (!map || !visibleLayers.length || !availableLayers.length) {
      return;
    }

    console.log('Автоматически добавляем видимые слои на карту:', visibleLayers);
    
    // Для каждого видимого слоя вызываем функцию переключения
    visibleLayers.forEach(layerId => {
      // Проверяем, есть ли слой уже на карте
      if (!map.getLayer(layerId)) {
        console.log(`Автоматически добавляем слой ${layerId} на карту`);
        handleLayerToggle(layerId, true);
      }
    });
  }, [map, visibleLayers, availableLayers, handleLayerToggle]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <OfflineIndicator isOffline={isOffline} />
      <SearchPanel form={searchForm} loading={loading} onSearch={handleSearch} />
      <LayerLoadingIndicator />
      <LayerControl 
        predefinedLayers={availableLayers} 
        onLayerToggle={handleLayerToggle}
        visibleLayers={visibleLayers}
        onRefreshLayer={refreshLayerCache}
        onClearLayerCache={clearLayerCache}
        isOffline={isOffline}
      />
      <MapComponent mapContainer={mapContainer} onMapLoad={handleMapLoad} />
    </div>
  );
};

export default Map; 