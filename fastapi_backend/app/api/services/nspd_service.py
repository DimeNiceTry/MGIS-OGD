import requests
import logging
import urllib3
import time
import hashlib
import json
import math
from typing import Dict, Any, Optional, List, Tuple
from fastapi import HTTPException

# Отключаем предупреждения о небезопасном SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Настраиваем логирование
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Заголовки для запросов к NSPD API
NSPD_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://nspd.gov.ru',
    'Referer': 'https://nspd.gov.ru/',
    'Connection': 'keep-alive'
}

# Словарь соответствий для тематического поиска
THEMATIC_SEARCH_MAPPING = {
    "objects": 1,
    "cad_del": 2,
    "admin_del": 4,
    "zouit": 5,
    "ter_zone": 7
}

# Простой in-memory кэш
cache = {}

def transform_web_mercator_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    """
    Преобразует координаты из EPSG:3857 (Web Mercator) в EPSG:4326 (WGS84)
    """
    # Константа для преобразования: радиус Земли * π
    R_EARTH_PI = 20037508.34
    
    # Логируем исходные координаты для отладки
    logger.debug(f"Преобразование координат: EPSG:3857 [{x}, {y}] -> EPSG:4326")
    
    # Преобразование долготы
    lng = (x / R_EARTH_PI) * 180
    
    # Ограничиваем долготу в диапазоне [-180, 180]
    lng = max(-180, min(180, lng))
    
    # Преобразование широты
    lat = (y / R_EARTH_PI) * 180
    lat = (180 / math.pi) * (2 * math.atan(math.exp(lat * math.pi / 180)) - math.pi / 2)
    
    # Ограничиваем широту в диапазоне [-90, 90]
    lat = max(-90, min(90, lat))
    
    logger.debug(f"Результат преобразования: WGS84 [{lng}, {lat}]")
    
    return (lng, lat)

def transform_geometry_coordinates(geometry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Преобразует координаты геометрии из EPSG:3857 в EPSG:4326
    Поддерживает типы Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon
    """
    if not geometry or "type" not in geometry or "coordinates" not in geometry:
        logger.warning(f"Невозможно преобразовать геометрию - некорректная структура: {geometry}")
        return geometry
    
    # Признаки того, что координаты в EPSG:3857:
    # 1. Явное указание в crs
    explicit_3857 = geometry.get("crs", {}).get("properties", {}).get("name") == "EPSG:3857"
    
    # 2. Проверка диапазона координат
    coords = geometry["coordinates"]
    sample_coords = None
    
    # Получаем образец координат в зависимости от типа геометрии
    if geometry["type"] == "Point":
        sample_coords = coords if len(coords) >= 2 else None
    elif geometry["type"] in ["LineString", "MultiPoint"] and len(coords) > 0:
        sample_coords = coords[0] if len(coords[0]) >= 2 else None
    elif geometry["type"] in ["Polygon", "MultiLineString"] and len(coords) > 0 and len(coords[0]) > 0:
        sample_coords = coords[0][0] if len(coords[0][0]) >= 2 else None
    elif geometry["type"] == "MultiPolygon" and len(coords) > 0 and len(coords[0]) > 0 and len(coords[0][0]) > 0:
        sample_coords = coords[0][0][0] if len(coords[0][0][0]) >= 2 else None
    
    implicit_3857 = False
    if sample_coords:
        x, y = sample_coords[:2]
        implicit_3857 = abs(x) > 180 or abs(y) > 90
        
    needs_transform = explicit_3857 or implicit_3857
    
    if not needs_transform:
        logger.debug(f"Координаты уже в WGS84, преобразование не требуется")
        return geometry
    
    logger.debug(f"Обнаружены координаты EPSG:3857 {'(явно указано в CRS)' if explicit_3857 else '(определено по диапазону)'}")
    
    try:
        geo_type = geometry["type"]
        coords = geometry["coordinates"]
        
        if geo_type == "Point":
            # Для точки - просто преобразуем координаты
            if len(coords) >= 2:
                x, y = coords[:2]
                lng, lat = transform_web_mercator_to_wgs84(x, y)
                geometry["coordinates"] = [lng, lat] + coords[2:]
                logger.debug(f"Преобразована точка: [{x}, {y}] -> [{lng}, {lat}]")
        
        elif geo_type == "LineString" or geo_type == "MultiPoint":
            # Для линии или множества точек - преобразуем каждую точку
            new_coords = []
            for p in coords:
                if len(p) >= 2:
                    x, y = p[:2]
                    lng, lat = transform_web_mercator_to_wgs84(x, y)
                    new_coords.append([lng, lat] + p[2:])
                else:
                    new_coords.append(p)
            geometry["coordinates"] = new_coords
            logger.debug(f"Преобразован {geo_type} ({len(new_coords)} точек)")
        
        elif geo_type == "Polygon" or geo_type == "MultiLineString":
            # Для полигона или множества линий - преобразуем каждую вложенную линию
            new_coords = []
            for line in coords:
                new_line = []
                for p in line:
                    if len(p) >= 2:
                        x, y = p[:2]
                        lng, lat = transform_web_mercator_to_wgs84(x, y)
                        new_line.append([lng, lat] + p[2:])
                    else:
                        new_line.append(p)
                new_coords.append(new_line)
            geometry["coordinates"] = new_coords
            logger.debug(f"Преобразован {geo_type} ({len(new_coords)} линий)")
        
        elif geo_type == "MultiPolygon":
            # Для множества полигонов - еще один уровень вложенности
            new_coords = []
            for polygon in coords:
                new_polygon = []
                for line in polygon:
                    new_line = []
                    for p in line:
                        if len(p) >= 2:
                            x, y = p[:2]
                            lng, lat = transform_web_mercator_to_wgs84(x, y)
                            new_line.append([lng, lat] + p[2:])
                        else:
                            new_line.append(p)
                    new_polygon.append(new_line)
                new_coords.append(new_polygon)
            geometry["coordinates"] = new_coords
            logger.debug(f"Преобразован {geo_type} ({len(new_coords)} полигонов)")
            
        # Обновляем CRS на WGS84
        if "crs" in geometry:
            geometry["crs"]["properties"]["name"] = "EPSG:4326"
        else:
            # Добавляем CRS, если его не было
            geometry["crs"] = {
                "type": "name",
                "properties": {
                    "name": "EPSG:4326"
                }
            }
        
        return geometry
    except Exception as e:
        logger.exception(f"Ошибка при преобразовании координат: {str(e)}")
        return geometry  # В случае ошибки возвращаем исходную геометрию

def get_cache_key(base_url: str, params: Dict[str, Any]) -> str:
    """Создает ключ кэша на основе URL и параметров запроса"""
    param_str = json.dumps(params, sort_keys=True)
    return f"nspd_api:{hashlib.md5(f'{base_url}:{param_str}'.encode()).hexdigest()}"

def make_nspd_request(base_url: str, params: Dict[str, Any], max_retries: int = 3, delay: int = 2) -> Dict[str, Any]:
    """
    Выполняет запрос к НСПД API с поддержкой повторных попыток и кэширования
    """
    # Для запросов поиска не используем кэш на бэкенде
    # Это позволит фронтенду всегда получать свежие данные
    is_search_request = "thematicSearchId" in params
    
    # Проверяем кэш перед запросом (только для неполисковых запросов)
    cache_key = get_cache_key(base_url, params)
    if not is_search_request and cache_key in cache:
        logger.debug(f"Возвращаем кэшированный результат для запроса: {base_url}")
        return cache[cache_key]
    
    last_error = None
    for attempt in range(max_retries):
        try:
            logger.debug(f"Попытка {attempt + 1} из {max_retries}")
            response = requests.get(
                base_url,
                params=params,
                headers=NSPD_HEADERS,
                verify=False,
                timeout=20  # Таймаут 20 секунд
            )
            
            # Если получен ответ 400 Bad Request, вернуть пустую коллекцию вместо ошибки
            if response.status_code == 400:
                logger.warning(f"Получен статус 400 Bad Request от API НСПД. Возможно, неверные параметры запроса: {params}")
                return {
                    "type": "FeatureCollection",
                    "features": [],
                    "message": "Некорректный запрос к НСПД. Пожалуйста, уточните параметры поиска."
                }
            
            response.raise_for_status()
            
            # Парсим JSON-ответ
            json_response = response.json()
            
            # Извлекаем данные из вложенного поля "data", если оно есть
            if "data" in json_response and isinstance(json_response["data"], dict):
                logger.debug(f"Извлекаем данные из поля 'data' в ответе НСПД")
                result = json_response["data"]
            else:
                # Если структура ответа другая, используем его как есть
                result = json_response
            
            # Проверяем, что это FeatureCollection с полем features
            if not isinstance(result, dict) or "type" not in result or "features" not in result:
                logger.warning(f"Неожиданный формат ответа от НСПД API: {result}")
                result = {
                    "type": "FeatureCollection",
                    "features": [],
                    "message": "Неожиданный формат ответа от НСПД API"
                }
            
            # Преобразуем числовые id в строки для совместимости с Pydantic схемой
            # Также преобразуем все координаты из EPSG:3857 в EPSG:4326
            if "features" in result and isinstance(result["features"], list):
                for feature in result["features"]:
                    # Преобразуем ID в строки
                    if "id" in feature and not isinstance(feature["id"], str):
                        feature["id"] = str(feature["id"])
                    
                    # Преобразуем координаты геометрии
                    if "geometry" in feature and feature["geometry"]:
                        feature["geometry"] = transform_geometry_coordinates(feature["geometry"])
            
            # Кэшируем результат только для неполисковых запросов
            if not is_search_request:
                cache[cache_key] = result
            
            return result
        except requests.exceptions.HTTPError as e:
            last_error = e
            logger.warning(f"Ошибка HTTP при попытке {attempt + 1}: {str(e)}")
            
            # Проверка на 404 и 403 ошибки - не имеет смысла повторять
            if e.response.status_code in [403, 404]:
                break
                
            if attempt < max_retries - 1:
                time.sleep(delay)
        except (requests.exceptions.RequestException, requests.exceptions.ConnectionError) as e:
            last_error = e
            if attempt < max_retries - 1:
                logger.warning(f"Ошибка при попытке {attempt + 1}: {str(e)}")
                time.sleep(delay)
                continue
    
    logger.error(f"Все попытки запроса к NSPD API завершились неудачей: {str(last_error)}")
    
    # Если была ошибка 400, возвращаем пустой результат вместо ошибки
    if last_error and isinstance(last_error, requests.exceptions.HTTPError) and last_error.response.status_code == 400:
        return {
            "type": "FeatureCollection",
            "features": [],
            "message": "Некорректный запрос к НСПД. Пожалуйста, уточните параметры поиска."
        }
        
    raise HTTPException(status_code=503, detail=f"NSPD API недоступен: {str(last_error)}")

def thematic_search(query: str, thematic_search: str, north: Optional[float] = None,
                    east: Optional[float] = None, south: Optional[float] = None,
                    west: Optional[float] = None) -> Dict[str, Any]:
    """
    Выполняет тематический поиск в НСПД
    """
    try:
        logger.debug(f"Запрос тематического поиска: '{query}', тип: '{thematic_search}', границы: N={north}, E={east}, S={south}, W={west}")
        
        # Получаем ID тематического поиска
        thematic_search_id = THEMATIC_SEARCH_MAPPING.get(thematic_search)
        if thematic_search_id is None:
            logger.error(f"Неизвестный thematicSearch: {thematic_search}")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": f"Неизвестный тип тематического поиска: {thematic_search}"
            }
        
        # Проверка: query не должен быть пустым
        if not query or not query.strip():
            logger.warning(f"Пустой поисковый запрос для {thematic_search}")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": "Пустой поисковый запрос. Пожалуйста, введите текст для поиска."
            }
        
        logger.debug(f"Преобразован thematicSearch в ID: {thematic_search_id}")
        
        # Формируем URL для запроса к NSPD - используем только необходимые параметры
        base_url = "https://nspd.gov.ru/api/geoportal/v2/search/geoportal"
        params = {
            "query": query,
            "limit": 200,  # Увеличиваем лимит до 200
            "thematicSearchId": thematic_search_id,
        }
        
        # Игнорируем параметры границ
        logger.debug(f"Сформированный URL для запроса к NSPD: {base_url} с параметрами {params}")
        
        try:
            # Попытка получить данные из НСПД API
            result = make_nspd_request(base_url, params)
            logger.debug(f"Получен результат от НСПД API: {type(result)}")
            
            # Проверяем и логируем структуру результатов
            if not isinstance(result, dict):
                logger.error(f"НСПД API вернул результат неверного типа: {type(result)}")
                result = {"type": "FeatureCollection", "features": []}
            
            # Упрощенная обработка результатов для лучшей совместимости с фронтендом
            if "features" in result and isinstance(result["features"], list):
                # Проверяем количество объектов
                feature_count = len(result["features"])
                logger.debug(f"Успешно получены данные от NSPD API, количество объектов: {feature_count}")
                
                # Конвертируем все объекты в простые точки, если необходимо
                valid_features = []
                
                for feature in result["features"]:
                    try:
                        # Создаем новый объект для каждого элемента
                        new_feature = {
                            "type": "Feature",
                            "properties": {}
                        }
                        
                        # Копируем ID
                        if "id" in feature:
                            if not isinstance(feature["id"], str):
                                new_feature["id"] = str(feature["id"])
                            else:
                                new_feature["id"] = feature["id"]
                        
                        # Копируем свойства, если есть
                        if "properties" in feature and isinstance(feature["properties"], dict):
                            # Добавляем нужные свойства для отображения
                            if "options" in feature["properties"]:
                                # Копируем важные свойства из options
                                options = feature["properties"]["options"]
                                if isinstance(options, dict):
                                    # Добавим важные свойства для отображения на карте
                                    if "name" in options:
                                        new_feature["properties"]["name"] = options["name"]
                                    elif "cad_number" in options:
                                        new_feature["properties"]["name"] = options["cad_number"]
                                    elif "build_record_purpose" in options:
                                        new_feature["properties"]["name"] = options["build_record_purpose"]
                                    else:
                                        # Если нет имени, используем категорию или другие данные
                                        category = feature["properties"].get("categoryName", "Объект")
                                        new_feature["properties"]["name"] = f"{category} #{new_feature.get('id', '')}"
                                    
                                    # Копируем все остальные свойства
                                    for key, value in options.items():
                                        new_feature["properties"][key] = value
                        
                            # Добавляем остальные свойства из верхнего уровня properties
                            for key, value in feature["properties"].items():
                                if key != "options":
                                    new_feature["properties"][key] = value
                        
                        # Обрабатываем геометрию
                        if "geometry" in feature and feature["geometry"]:
                            geom = feature["geometry"]
                            
                            if "type" in geom and "coordinates" in geom:
                                geo_type = geom["type"]
                                coords = geom["coordinates"]
                                
                                # Создаем новую геометрию, гарантированно в EPSG:4326
                                new_geometry = {"type": geo_type, "coordinates": []}
                                
                                # Для точечных объектов
                                if geo_type == "Point":
                                    if len(coords) >= 2:
                                        x, y = coords[:2]
                                        # Проверяем на координаты EPSG:3857 по диапазону значений
                                        # и явному указанию CRS
                                        needs_transform = (abs(x) > 180 or abs(y) > 90) or (
                                            "crs" in geom and 
                                            geom["crs"].get("properties", {}).get("name") == "EPSG:3857"
                                        )
                                        
                                        if needs_transform:
                                            logger.debug(f"Преобразование точечных координат из EPSG:3857 в WGS84: [{x}, {y}]")
                                            lng, lat = transform_web_mercator_to_wgs84(x, y)
                                            logger.debug(f"Результат преобразования: [{lng}, {lat}]")
                                        else:
                                            lng, lat = x, y
                                            logger.debug(f"Координаты уже в WGS84: [{lng}, {lat}]")
                                        
                                        # Ограничиваем в допустимом диапазоне
                                        lng = max(-180, min(180, lng))
                                        lat = max(-90, min(90, lat))
                                        
                                        new_geometry["coordinates"] = [lng, lat]
                                else:
                                    # Для нетривиальных геометрий выполняем полное преобразование
                                    logger.debug(f"Преобразование сложной геометрии типа {geo_type}")
                                    new_geometry = transform_geometry_coordinates(geom)
                                    logger.debug(f"Геометрия преобразована: {new_geometry['type']}")
                                    
                                # Устанавливаем новую геометрию
                                new_feature["geometry"] = new_geometry
                            else:
                                # Если геометрия некорректна, создаем пустую точку в центре Москвы
                                logger.warning(f"Объект без корректной геометрии: {geom}")
                                new_feature["geometry"] = {
                                    "type": "Point",
                                    "coordinates": [37.6173, 55.7558]
                                }
                                new_feature["properties"]["invalid_geometry"] = True
                        else:
                            # Если нет геометрии, создаем пустую точку в центре Москвы
                            logger.warning("Объект без геометрии, создаем пустую точку")
                            new_feature["geometry"] = {
                                "type": "Point",
                                "coordinates": [37.6173, 55.7558]
                            }
                            new_feature["properties"]["no_geometry"] = True
                        
                        # Добавляем обработанный объект в результаты
                        valid_features.append(new_feature)
                    except Exception as feature_error:
                        logger.exception(f"Ошибка при обработке объекта: {str(feature_error)}")
                        # Пропускаем проблемный объект, но продолжаем обработку остальных
                        continue
                
                # Заменяем список объектов на обработанный
                result["features"] = valid_features
                feature_count = len(valid_features)
                logger.debug(f"После обработки: {feature_count} объектов")
                
                # Добавляем поле message если его нет
                if "message" not in result:
                    if feature_count > 0:
                        result["message"] = f"Найдено объектов: {feature_count}"
                    else:
                        result["message"] = "По вашему запросу ничего не найдено"
            else:
                # Если в ответе нет features или они не списком, логируем и создаем пустой список
                logger.warning(f"Некорректная структура ответа от НСПД API: {result}")
                result["features"] = []
                result["message"] = "Некорректный ответ от НСПД API"
            
            # Убедимся, что у нас корректный GeoJSON
            if "type" not in result:
                result["type"] = "FeatureCollection"
            if "features" not in result:
                result["features"] = []
            
            return result
        except HTTPException as e:
            # Если возникла ошибка, логируем и возвращаем пустой набор результатов
            logger.error(f"HTTPException при выполнении тематического поиска: {str(e)}")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": f"Ошибка API НСПД: {str(e)}"
            }
        except Exception as e:
            logger.exception(f"Непредвиденная ошибка при выполнении тематического поиска: {str(e)}")
            # Возвращаем пустую коллекцию вместо ошибки
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": f"Непредвиденная ошибка: {str(e)}"
            }
    except Exception as e:
        # Глобальная обработка ошибок
        logger.exception(f"Критическая ошибка в функции thematic_search: {str(e)}")
        return {
            "type": "FeatureCollection",
            "features": [],
            "message": "Произошла внутренняя ошибка сервера. Пожалуйста, попробуйте позже."
        }

def get_fallback_response() -> Dict[str, Any]:
    """
    Возвращает заглушку с пустыми данными в формате FeatureCollection,
    когда основной API НСПД недоступен
    """
    logger.info("Использую заглушку для НСПД API")
    return {
        "type": "FeatureCollection",
        "features": [],
        "fallback": True,
        "message": "Данные НСПД в настоящее время недоступны. Пожалуйста, попробуйте позже."
    } 