#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
import xml.etree.ElementTree as ET
import time
import logging
from pathlib import Path

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Настройка для обработки XML-пространств имён
namespaces = {
    'gml': 'http://www.opengis.net/gml/3.2',
    'default': 'http://www.opengis.net/gml/3.2'
}

def transform_mercator_to_wgs84(x, y):
    """Преобразует координаты из EPSG:3857 (Web Mercator) в EPSG:4326 (WGS84)"""
    import math
    
    lng = (x * 180) / 20037508.34
    lat = (y * 180) / 20037508.34
    lat = (180 / math.pi) * (2 * math.atan(math.exp(lat * math.pi / 180)) - math.pi / 2)
    
    return [lng, lat]

def parse_coordinates(coords_text):
    """Разбирает строку координат из GML"""
    coords = []
    for point in coords_text.strip().split():
        try:
            x, y = map(float, point.split(','))
            # Преобразуем координаты из EPSG:3857 в EPSG:4326
            coords.append(transform_mercator_to_wgs84(x, y))
        except Exception as e:
            logger.error(f"Ошибка при разборе координат '{point}': {e}")
    
    return coords

def convert_gml_to_geojson(gml_file, output_file=None, category_tag='category_39892'):
    """Конвертирует GML-файл в формат GeoJSON"""
    start_time = time.time()
    
    if not os.path.exists(gml_file):
        logger.error(f"Файл не найден: {gml_file}")
        return None
    
    if not output_file:
        # Если выходной файл не указан, создаем его с тем же именем, но с расширением .geojson
        output_file = os.path.splitext(gml_file)[0] + '.geojson'
    
    # Проверяем размер файла
    file_size = os.path.getsize(gml_file)
    logger.info(f"Размер файла: {file_size / (1024 * 1024):.2f} MB")
    
    # Создаем структуру для GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "features": []
    }
    
    # Итеративно разбираем большой XML-файл
    context = ET.iterparse(gml_file, events=('start', 'end'))
    
    # Очищаем пространство имен из тегов
    for event, elem in context:
        if '}' in elem.tag:
            elem.tag = elem.tag.split('}', 1)[1]
    
    # Перезапускаем парсинг
    context = ET.iterparse(gml_file, events=('start', 'end'))
    
    # Инициализируем переменные для отслеживания текущего элемента и его состояния
    current_element = None
    in_category = False
    count = 0
    
    try:
        for event, elem in context:
            tag = elem.tag.split('}')[-1]  # Убираем пространство имен, если оно есть
            
            if event == 'start' and tag == category_tag:
                in_category = True
                current_element = {
                    "type": "Feature",
                    "properties": {},
                    "geometry": None
                }
                
                # Получаем id из атрибута fid
                if 'fid' in elem.attrib:
                    current_element["id"] = int(elem.attrib['fid'])
                    current_element["properties"]["fid"] = elem.attrib['fid']
            
            elif event == 'end' and in_category and tag == 'type':
                # Получаем тип геометрии
                geom_type = elem.text
                current_element["properties"]["type"] = geom_type
            
            elif event == 'end' and in_category and tag == 'geoloc':
                # Обрабатываем геометрию
                for child in elem:
                    child_tag = child.tag.split('}')[-1]
                    
                    if child_tag == 'MultiPolygon':
                        geometry = {"type": "MultiPolygon", "coordinates": []}
                        
                        # Получаем все элементы polygonMember
                        for polygon_member in child.findall('.//{http://www.opengis.net/gml/3.2}polygonMember'):
                            polygon = polygon_member.find('.//{http://www.opengis.net/gml/3.2}Polygon')
                            if polygon is not None:
                                outer_boundary = polygon.find('.//{http://www.opengis.net/gml/3.2}outerBoundaryIs')
                                if outer_boundary is not None:
                                    linear_ring = outer_boundary.find('.//{http://www.opengis.net/gml/3.2}LinearRing')
                                    if linear_ring is not None:
                                        coords_elem = linear_ring.find('.//{http://www.opengis.net/gml/3.2}coordinates')
                                        if coords_elem is not None and coords_elem.text:
                                            coords = parse_coordinates(coords_elem.text)
                                            geometry["coordinates"].append([coords])
                        
                        current_element["geometry"] = geometry
            
            elif event == 'end' and tag == category_tag and in_category:
                # Завершаем обработку текущего элемента
                if current_element["geometry"]:
                    geojson["features"].append(current_element)
                    count += 1
                    
                    if count % 1000 == 0:
                        logger.info(f"Обработано {count} объектов")
                
                in_category = False
                current_element = None
                
                # Очищаем элемент из памяти
                elem.clear()
    
    except Exception as e:
        logger.error(f"Ошибка при обработке XML: {e}")
        return None
    
    # Записываем результат в файл
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(geojson, f)
        
        elapsed_time = time.time() - start_time
        logger.info(f"Конвертация завершена за {elapsed_time:.2f} секунд")
        logger.info(f"Всего обработано {count} объектов")
        logger.info(f"Результат сохранен в файл: {output_file}")
        
        return output_file
    
    except Exception as e:
        logger.error(f"Ошибка при записи в файл: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python gml_to_geojson.py <input_gml_file> [output_geojson_file]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = convert_gml_to_geojson(input_file, output_file)
    if result:
        print(f"Файл GeoJSON создан: {result}")
    else:
        print("Ошибка при конвертации файла")
        sys.exit(1) 