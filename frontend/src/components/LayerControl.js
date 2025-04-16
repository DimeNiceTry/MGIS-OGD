import React, { useEffect } from 'react';
import { Checkbox, Button, Tooltip, Alert } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';

const LayerControl = ({ 
  predefinedLayers, 
  onLayerToggle, 
  visibleLayers,
  onRefreshLayer = () => {},
  onClearLayerCache = () => {},
  isOffline = false
}) => {
  // Добавляем отладочный вывод при обновлении слоев
  useEffect(() => {
    console.log('LayerControl: доступные слои:', predefinedLayers);
    console.log('LayerControl: видимые слои:', visibleLayers);
  }, [predefinedLayers, visibleLayers]);

  // Проверяем, есть ли слои для отображения
  if (!predefinedLayers || predefinedLayers.length === 0) {
    return (
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'white',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        zIndex: 1,
        maxWidth: '300px'
      }}>
        <h3>Управление слоями</h3>
        <Alert
          message="Загрузка слоев..."
          description="Проверьте подключение к серверу или обновите страницу"
          type="info"
          showIcon
        />
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'white',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      zIndex: 1,
      maxWidth: '300px',
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      <h3>Управление слоями</h3>

      <div>
        <h4>Доступные слои ({predefinedLayers.length})</h4>
        {predefinedLayers.map(layer => (
          <div key={layer.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
            <Checkbox
              checked={visibleLayers.includes(layer.id)}
              onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
            >
              {layer.name}
            </Checkbox>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
              <Tooltip title="Обновить кэш слоя">
                <Button 
                  icon={<ReloadOutlined />} 
                  size="small" 
                  onClick={() => onRefreshLayer(layer.id)}
                  disabled={isOffline}
                />
              </Tooltip>
              <Tooltip title="Очистить кэш слоя">
                <Button 
                  icon={<DeleteOutlined />} 
                  size="small" 
                  onClick={() => onClearLayerCache(layer.id)}
                  danger
                />
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayerControl; 