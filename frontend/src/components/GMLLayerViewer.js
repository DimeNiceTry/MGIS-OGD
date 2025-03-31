import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { message, Button, Spin, Progress, Radio } from 'antd';

// Делаем функцию конвертации статической
const convertGMLtoGeoJSON = (xmlDoc) => {
  console.log('Начало конвертации GML в GeoJSON');
  const featureCollection = {
    type: 'FeatureCollection',
    features: []
  };
  
  // Получаем все элементы category_39892
  const categoryElements = xmlDoc.getElementsByTagName('category_39892');
  console.log(`Найдено элементов category_39892: ${categoryElements.length}`);
  
  for (let i = 0; i < categoryElements.length; i++) {
    const el = categoryElements[i];
    const fid = el.getAttribute('fid');
    console.log(`Обработка элемента ${i + 1}, fid: ${fid}`);
    
    const typeEl = el.getElementsByTagName('type')[0];
    const geomType = typeEl ? typeEl.textContent : 'MultiPolygon';
    console.log(`Тип геометрии: ${geomType}`);
    
    const geolocEl = el.getElementsByTagName('geoloc')[0];
    if (!geolocEl) {
      console.log(`Элемент ${fid} не содержит geoloc`);
      continue;
    }
    
    // Получаем координаты из GML
    let coordinates = [];
    let geometry = null;
    
    if (geomType === 'MultiPolygon') {
      const multiPolygons = geolocEl.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'MultiPolygon');
      console.log(`Найдено MultiPolygon: ${multiPolygons.length}`);
      
      if (multiPolygons.length > 0) {
        const polygonMembers = multiPolygons[0].getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'polygonMember');
        console.log(`Найдено polygonMember: ${polygonMembers.length}`);
        
        coordinates = Array.from(polygonMembers).map((polygonMember, index) => {
          const polygon = polygonMember.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'Polygon')[0];
          if (!polygon) {
            console.log(`Полигон ${index} не найден`);
            return null;
          }
          
          const outerBoundary = polygon.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'outerBoundaryIs')[0];
          if (!outerBoundary) {
            console.log(`Внешняя граница полигона ${index} не найдена`);
            return null;
          }
          
          const linearRing = outerBoundary.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'LinearRing')[0];
          if (!linearRing) {
            console.log(`LinearRing полигона ${index} не найден`);
            return null;
          }
          
          const coords = linearRing.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'coordinates')[0];
          if (!coords) {
            console.log(`Координаты полигона ${index} не найдены`);
            return null;
          }
          
          const parsedCoords = [parseCoordinates(coords.textContent)];
          console.log(`Полигон ${index} содержит ${parsedCoords[0].length} точек`);
          return parsedCoords;
        }).filter(coord => coord !== null);
        
        if (coordinates.length > 0) {
          geometry = {
            type: 'MultiPolygon',
            coordinates: coordinates
          };
          console.log(`Создана геометрия MultiPolygon с ${coordinates.length} полигонами`);
        } else {
          console.log('Не удалось создать геометрию MultiPolygon: нет валидных полигонов');
        }
      } else {
        console.log('MultiPolygon не найден в элементе');
      }
    }
    
    if (geometry) {
      featureCollection.features.push({
        type: 'Feature',
        id: fid,
        geometry: geometry,
        properties: {
          fid: fid,
          type: geomType
        }
      });
      console.log(`Добавлен feature с id ${fid}`);
    } else {
      console.log(`Не удалось создать feature для элемента ${fid}`);
    }
  }
  
  console.log(`Всего создано features: ${featureCollection.features.length}`);
  return featureCollection;
};

// Делаем функцию парсинга координат статической
const parseCoordinates = (coordsString) => {
  console.log('Парсинг координат:', coordsString.substring(0, 100) + '...');
  const coords = coordsString.trim().split(' ').map(coord => {
    const [x, y] = coord.split(',');
    const parsedX = parseFloat(x);
    const parsedY = parseFloat(y);
    
    if (isNaN(parsedX) || isNaN(parsedY)) {
      console.log('Некорректные координаты:', coord);
      return null;
    }
    
    const transformed = transformWebMercatorToWGS84(parsedX, parsedY);
    console.log(`Координаты ${coord} преобразованы в ${transformed}`);
    return transformed;
  }).filter(coord => coord !== null);
  
  console.log(`Обработано ${coords.length} координат`);
  return coords;
};

// Делаем функцию трансформации координат статической
const transformWebMercatorToWGS84 = (x, y) => {
  const lng = (x * 180) / 20037508.34;
  let lat = (y * 180) / 20037508.34;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lng, lat];
};

const GMLLayerViewer = ({ map, gmlFilePath }) => {
  const [loading, setLoading] = useState(false);
  const [layerAdded, setLayerAdded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileType, setFileType] = useState('geojson'); // 'gml' или 'geojson'

  // Функция для обработки фрагментов данных
  const processChunk = (reader, file, processedChunks, totalChunks, resolve) => {
    if (reader.result) {
      processedChunks.push(reader.result);
      setProgress(Math.floor((processedChunks.length / totalChunks) * 100));
    }

    if (processedChunks.length === totalChunks) {
      // Все фрагменты обработаны
      const gmlText = processedChunks.join('');
      resolve(gmlText);
    }
  };

  // Функция для загрузки GML-файла по частям (используется для больших файлов)
  const loadLargeGmlFile = (file) => {
    return new Promise((resolve, reject) => {
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB на чанк
      const fileSize = file.size;
      const chunks = Math.ceil(fileSize / CHUNK_SIZE);
      const processedChunks = [];

      message.info(`Большой GML-файл (${Math.round(fileSize / (1024 * 1024))}MB) разбит на ${chunks} частей для обработки`);

      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(fileSize, start + CHUNK_SIZE);
        
        const slice = file.slice(start, end);
        const reader = new FileReader();
        
        reader.onload = () => processChunk(reader, file, processedChunks, chunks, resolve);
        reader.onerror = reject;
        
        reader.readAsText(slice);
      }
    });
  };

  // Функция для загрузки GML-файла и его конвертации в GeoJSON
  const loadGMLFile = async () => {
    if (!map || !gmlFilePath) return;
    
    setLoading(true);
    setProgress(0);
    
    try {
      // Создаем временный источник данных для GML файла
      const sourceId = 'gml-source';
      const layerId = 'gml-layer';
      
      // Удаляем существующий слой и источник, если они есть
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      
      // Загружаем GML-файл
      let gmlText;
      
      // Проверяем, является ли путь URL-адресом или локальным путем
      if (gmlFilePath.startsWith('http') || gmlFilePath.startsWith('https')) {
        // Загружаем файл через HTTP
        const response = await axios.get(gmlFilePath, {
          onDownloadProgress: (progressEvent) => {
            const total = progressEvent.total;
            const loaded = progressEvent.loaded;
            const percentage = Math.floor((loaded / total) * 100);
            setProgress(percentage);
          }
        });
        gmlText = response.data;
      } else {
        // Загружаем локальный файл
        try {
          const fetchResponse = await fetch(gmlFilePath);
          const blob = await fetchResponse.blob();
          
          if (blob.size > 10 * 1024 * 1024) { // 10MB
            // Для больших файлов используем чтение по частям
            gmlText = await loadLargeGmlFile(blob);
          } else {
            gmlText = await blob.text();
          }
        } catch (fetchError) {
          console.error('Ошибка при загрузке локального файла:', fetchError);
          message.error('Не удалось загрузить локальный GML-файл');
          setLoading(false);
          return;
        }
      }
      
      // Используем DOMParser для разбора XML
      const parser = new DOMParser();
      message.info('Разбор XML документа...');
      
      // Используем setTimeout, чтобы дать UI возможность обновиться перед тяжелой операцией
      setTimeout(() => {
        try {
          const xmlDoc = parser.parseFromString(gmlText, 'text/xml');
          
          message.info('Конвертация GML в GeoJSON...');
          
          // Еще одна отложенная операция для конвертации в GeoJSON
          setTimeout(() => {
            try {
              // Конвертируем GML в GeoJSON
              const geoJSON = convertGMLtoGeoJSON(xmlDoc);
              
              // Добавляем источник данных
              map.addSource(sourceId, {
                type: 'geojson',
                data: geoJSON
              });
              
              // Добавляем слой полигонов
              map.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                  'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    '#3388ff',
                    '#627BC1'
                  ],
                  'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.7,
                    0.5
                  ],
                  'fill-outline-color': '#000'
                }
              });
              
              // Добавляем обработчики событий для интерактивности
              // Переменная для отслеживания ID объекта под курсором
              let hoveredStateId = null;
              
              map.on('mousemove', layerId, (e) => {
                if (e.features.length > 0) {
                  if (hoveredStateId !== null) {
                    map.setFeatureState(
                      { source: sourceId, id: hoveredStateId },
                      { hover: false }
                    );
                  }
                  hoveredStateId = e.features[0].id;
                  map.setFeatureState(
                    { source: sourceId, id: hoveredStateId },
                    { hover: true }
                  );
                }
              });
              
              map.on('mouseleave', layerId, () => {
                if (hoveredStateId !== null) {
                  map.setFeatureState(
                    { source: sourceId, id: hoveredStateId },
                    { hover: false }
                  );
                }
                hoveredStateId = null;
              });
              
              // Центрируем карту на данных
              const bounds = getBoundsFromGeoJSON(geoJSON);
              if (bounds) {
                map.fitBounds(bounds, { padding: 50 });
              }
              
              setLayerAdded(true);
              message.success('GML-файл успешно загружен на карту');
              setLoading(false);
            } catch (geoJSONError) {
              console.error('Ошибка при конвертации в GeoJSON:', geoJSONError);
              message.error('Ошибка при конвертации GML в GeoJSON');
              setLoading(false);
            }
          }, 100);
        } catch (parseError) {
          console.error('Ошибка при разборе XML:', parseError);
          message.error('Ошибка при разборе GML-файла');
          setLoading(false);
        }
      }, 100);
    } catch (error) {
      console.error('Ошибка при загрузке GML-файла:', error);
      message.error('Ошибка при загрузке GML-файла');
      setLoading(false);
    }
  };

  // Функция для получения границ данных
  const getBoundsFromGeoJSON = (geoJSON) => {
    if (!geoJSON || !geoJSON.features || geoJSON.features.length === 0) {
      return null;
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    geoJSON.features.forEach(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates.forEach(polygon => {
            polygon.forEach(ring => {
              ring.forEach(coord => {
                minX = Math.min(minX, coord[0]);
                minY = Math.min(minY, coord[1]);
                maxX = Math.max(maxX, coord[0]);
                maxY = Math.max(maxY, coord[1]);
              });
            });
          });
        }
      }
    });
    
    return [[minX, minY], [maxX, maxY]];
  };

  // Функция для загрузки GeoJSON файла напрямую
  const loadGeoJSONFile = async () => {
    if (!map) return;
    
    const geojsonFilePath = gmlFilePath.replace('.gml', '.geojson');
    
    setLoading(true);
    setProgress(0);
    
    try {
      // Создаем временный источник данных для GeoJSON файла
      const sourceId = 'gml-source';
      const layerId = 'gml-layer';
      
      // Удаляем существующий слой и источник, если они есть
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
      
      // Загружаем GeoJSON-файл
      let geoJSONData;
      
      // Проверяем, является ли путь URL-адресом или локальным путем
      if (geojsonFilePath.startsWith('http') || geojsonFilePath.startsWith('https')) {
        // Загружаем файл через HTTP
        const response = await axios.get(geojsonFilePath, {
          onDownloadProgress: (progressEvent) => {
            const total = progressEvent.total;
            const loaded = progressEvent.loaded;
            const percentage = Math.floor((loaded / total) * 100);
            setProgress(percentage);
          }
        });
        geoJSONData = response.data;
      } else {
        // Загружаем локальный файл
        try {
          const fetchResponse = await fetch(geojsonFilePath);
          if (!fetchResponse.ok) {
            throw new Error(`HTTP error! status: ${fetchResponse.status}`);
          }
          geoJSONData = await fetchResponse.json();
        } catch (fetchError) {
          console.error('Ошибка при загрузке локального GeoJSON-файла:', fetchError);
          message.error('Не удалось загрузить локальный GeoJSON-файл. Попробуйте использовать GML');
          setLoading(false);
          return;
        }
      }
      
      message.info('GeoJSON-файл загружен, добавление на карту...');
      
      // Добавляем источник данных
      map.addSource(sourceId, {
        type: 'geojson',
        data: geoJSONData
      });
      
      // Добавляем слой полигонов
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#3388ff',
            '#627BC1'
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.7,
            0.5
          ],
          'fill-outline-color': '#000'
        }
      });
      
      // Добавляем обработчики событий для интерактивности
      // Переменная для отслеживания ID объекта под курсором
      let hoveredStateId = null;
      
      map.on('mousemove', layerId, (e) => {
        if (e.features.length > 0) {
          if (hoveredStateId !== null) {
            map.setFeatureState(
              { source: sourceId, id: hoveredStateId },
              { hover: false }
            );
          }
          hoveredStateId = e.features[0].id;
          map.setFeatureState(
            { source: sourceId, id: hoveredStateId },
            { hover: true }
          );
        }
      });
      
      map.on('mouseleave', layerId, () => {
        if (hoveredStateId !== null) {
          map.setFeatureState(
            { source: sourceId, id: hoveredStateId },
            { hover: false }
          );
        }
        hoveredStateId = null;
      });
      
      // Центрируем карту на данных
      const bounds = getBoundsFromGeoJSON(geoJSONData);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50 });
      }
      
      setLayerAdded(true);
      message.success('GeoJSON-файл успешно загружен на карту');
    } catch (error) {
      console.error('Ошибка при загрузке GeoJSON-файла:', error);
      message.error('Ошибка при загрузке GeoJSON-файла. Попробуйте использовать GML');
    } finally {
      setLoading(false);
    }
  };

  // Функция для выбора и загрузки файла в зависимости от выбранного типа
  const loadFileByType = () => {
    if (fileType === 'geojson') {
      loadGeoJSONFile();
    } else {
      loadGMLFile();
    }
  };

  useEffect(() => {
    if (map && gmlFilePath) {
      loadGMLFile();
    }
  }, [map, gmlFilePath]);

  return (
    <div style={{ position: 'absolute', top: '70px', right: '10px', zIndex: 2, background: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 0 10px rgba(0,0,0,0.2)', width: '250px' }}>
      {loading ? (
        <div>
          <Spin tip="Загрузка..." />
          <Progress percent={progress} status="active" />
        </div>
      ) : (
        !layerAdded && (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <p style={{ marginBottom: '5px' }}>Выберите формат файла:</p>
              <Radio.Group 
                value={fileType} 
                onChange={(e) => setFileType(e.target.value)}
                style={{ marginBottom: '10px' }}
              >
                <Radio value="geojson">GeoJSON</Radio>
                <Radio value="gml">GML</Radio>
              </Radio.Group>
            </div>
            <Button type="primary" onClick={loadFileByType} style={{ width: '100%' }}>
              Загрузить файл на карту
            </Button>
          </div>
        )
      )}
      {layerAdded && (
        <div>
          <p style={{ marginBottom: '5px' }}>{fileType === 'geojson' ? 'GeoJSON' : 'GML'}-слой отображается на карте</p>
          <Button type="primary" danger onClick={() => window.location.reload()} style={{ width: '100%', marginTop: '10px' }}>
            Перезагрузить страницу
          </Button>
        </div>
      )}
    </div>
  );
};

// Экспортируем статические функции
GMLLayerViewer.convertGMLtoGeoJSON = convertGMLtoGeoJSON;
GMLLayerViewer.parseCoordinates = parseCoordinates;
GMLLayerViewer.transformWebMercatorToWGS84 = transformWebMercatorToWGS84;

export default GMLLayerViewer; 