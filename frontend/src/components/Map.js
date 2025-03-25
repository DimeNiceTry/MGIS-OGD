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

      // Удаляем предыдущий слой и источник, если они существуют
      if (map.getLayer('nspd-search-layer')) {
        map.removeLayer('nspd-search-layer');
      }
      if (map.getSource('nspd-search')) {
        map.removeSource('nspd-search');
      }

      try {
        const response = await axios.get('http://localhost:8000/api/nspd/thematic-search/', {
          params: {
            query: values.query,
            thematicSearch: values.thematicSearch
          }
        });

        if (response.data.features && response.data.features.length > 0) {
          map.addSource('nspd-search', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: response.data.features
            }
          });

          map.addLayer({
            id: 'nspd-search-layer',
            type: 'fill',
            source: 'nspd-search',
            paint: {
              'fill-color': '#088',
              'fill-opacity': 0.8
            }
          });

          // Приближаем карту к найденным объектам
          const bounds = new maplibregl.LngLatBounds();
          let hasValidCoordinates = false;
          
          response.data.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
              if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(coord => {
                  if (Array.isArray(coord[0])) {
                    coord.forEach(c => {
                      if (c && c.length >= 2) {
                        bounds.extend(c);
                        hasValidCoordinates = true;
                      }
                    });
                  } else if (coord && coord.length >= 2) {
                    bounds.extend(coord);
                    hasValidCoordinates = true;
                  }
                });
              }
            }
          });
          
          if (hasValidCoordinates) {
            map.fitBounds(bounds, { padding: 50 });
          }
          
          message.success(`Найдено объектов: ${response.data.features.length}`);
        } else {
          message.info('Объекты не найдены');
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        message.error('Ошибка при поиске объектов');
      }
    } catch (error) {
      console.error('Error in search function:', error);
      message.error('Произошла ошибка');
    } finally {
      setLoading(false);
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