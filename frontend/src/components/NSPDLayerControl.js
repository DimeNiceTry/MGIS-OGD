import React, { useState } from 'react';
import { Form, Checkbox, Input, Select, Button, message } from 'antd';
import axios from 'axios';

const { Option } = Select;

const NSPDLayerControl = ({ map }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);

  const thematicSearchOptions = [
    { value: 'objects', label: 'Объекты' },
    { value: 'cad_del', label: 'Кадастровые деления' },
    { value: 'admin_del', label: 'Административные деления' },
    { value: 'zouit', label: 'ЗОУИТ' },
    { value: 'ter_zone', label: 'Территориальные зоны' }
  ];

  const onSearch = async (values) => {
    if (!map || !map.current || !map.current._map) {
      message.error('Карта не найдена');
      return;
    }
    
    const mapInstance = map.current._map;
    setLoading(true);
    
    try {
      // Удаляем предыдущий слой и источник, если они существуют
      if (mapInstance.getLayer('nspd-search-layer')) {
        mapInstance.removeLayer('nspd-search-layer');
      }
      if (mapInstance.getSource('nspd-search')) {
        mapInstance.removeSource('nspd-search');
      }
      
      const response = await axios.get('https://mgis-ogd.onrender.com/api/nspd/thematic-search/', {
        params: {
          query: values.query,
          thematicSearch: values.thematicSearch
        },
        timeout: 15000 // 15 секунд таймаут
      });
      
      // Проверяем наличие сообщения об ошибке от бэкенда
      if (response.data && response.data.error) {
        console.error('Ошибка API:', response.data.error);
        message.error(`Ошибка: ${response.data.error}`);
        
        // Пробуем использовать fallback API
        console.log('Пробуем использовать fallback API...');
        try {
          const fallbackResponse = await axios.get('https://mgis-ogd.onrender.com/api/nspd/fallback/');
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
      
      setSearchResults(response.data);
      
      // Добавляем результаты на карту
      if (response.data.features && response.data.features.length > 0) {
        mapInstance.addSource('nspd-search', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: response.data.features
          }
        });

        mapInstance.addLayer({
          id: 'nspd-search-layer',
          type: 'fill',
          source: 'nspd-search',
          paint: {
            'fill-color': '#088',
            'fill-opacity': 0.8
          }
        });
        
        message.success(`Найдено объектов: ${response.data.features.length}`);
      } else {
        message.info('Объекты не найдены');
      }
    } catch (error) {
      console.error('Ошибка при запросе к API:', error);
      
      // Пробуем использовать fallback API
      console.log('Произошла ошибка, пробуем использовать fallback API...');
      try {
        const fallbackResponse = await axios.get('https://mgis-ogd.onrender.com/api/nspd/fallback/');
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
  };

  return (
    <div style={{ 
      position: 'absolute', 
      top: '10px', 
      left: '10px', 
      background: 'white', 
      padding: '10px',
      borderRadius: '4px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      zIndex: 1
    }}>
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
          <Button type="primary" htmlType="submit" loading={loading}>
            Поиск
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default NSPDLayerControl; 