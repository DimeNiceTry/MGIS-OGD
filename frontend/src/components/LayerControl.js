import React from 'react';
import { Checkbox, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const LayerControl = ({ 
  predefinedLayers, 
  onLayerToggle, 
  onFileUpload,
  visibleLayers 
}) => {
  const handleFileUpload = async (file) => {
    try {
      await onFileUpload(file);
      message.success('Файл успешно загружен');
      return false; // Предотвращаем автоматическую загрузку
    } catch (error) {
      message.error('Ошибка при загрузке файла');
      return false;
    }
  };

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
      
      <div style={{ marginBottom: '15px' }}>
        <Upload
          accept=".gml,.geojson"
          beforeUpload={handleFileUpload}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />}>Загрузить файл</Button>
        </Upload>
      </div>

      <div>
        <h4>Предустановленные слои</h4>
        {predefinedLayers.map(layer => (
          <div key={layer.id} style={{ marginBottom: '8px' }}>
            <Checkbox
              checked={visibleLayers.includes(layer.id)}
              onChange={(e) => onLayerToggle(layer.id, e.target.checked)}
            >
              {layer.name}
            </Checkbox>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayerControl; 