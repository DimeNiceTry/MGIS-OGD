from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.api.schemas.nspd_schemas import ThematicSearchRequest, FeatureCollection
from app.api.services.nspd_service import thematic_search as nspd_thematic_search, get_fallback_response
import logging

router = APIRouter(tags=["nspd"])

logger = logging.getLogger(__name__)

@router.post("/nspd/thematic-search/", response_model=FeatureCollection)
async def search_thematic(request: ThematicSearchRequest):
    """
    Выполняет тематический поиск в НСПД
    
    Типы тематического поиска:
    - objects: Объекты
    - cad_del: Кадастровые деления
    - admin_del: Административные деления
    - zouit: Зоны с особыми условиями использования территорий
    - ter_zone: Территориальные зоны
    """
    try:
        result = nspd_thematic_search(
            query=request.query,
            thematic_search=request.thematic_search,
            north=request.north,
            east=request.east,
            south=request.south,
            west=request.west
        )
        return result
    except Exception as e:
        logger.exception(f"Ошибка при выполнении тематического поиска (POST): {str(e)}")
        # Возвращаем пустую коллекцию вместо ошибки 500
        return {
            "type": "FeatureCollection",
            "features": [],
            "message": "Произошла ошибка при поиске. Пожалуйста, попробуйте позже."
        }

@router.get("/nspd/thematic-search/", response_model=FeatureCollection)
async def search_thematic_get(
    query: str,
    thematic_search: str,
    north: Optional[float] = Query(None),
    east: Optional[float] = Query(None),
    south: Optional[float] = Query(None),
    west: Optional[float] = Query(None)
):
    """
    Выполняет тематический поиск в НСПД через GET запрос
    
    Типы тематического поиска:
    - objects: Объекты
    - cad_del: Кадастровые деления
    - admin_del: Административные деления
    - zouit: Зоны с особыми условиями использования территорий
    - ter_zone: Территориальные зоны
    """
    try:
        # Логируем детали запроса для отладки
        logger.info(f"GET запрос тематического поиска НСПД: '{query}', тип: {thematic_search}")
        logger.debug(f"Параметры границ: N={north}, E={east}, S={south}, W={west}")
        
        # Проверяем, что запрос не пустой
        if not query or not query.strip():
            logger.warning("Получен пустой поисковый запрос")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": "Пустой поисковый запрос. Пожалуйста, введите текст для поиска."
            }
            
        # Проверяем, что тип тематического поиска валидный
        if thematic_search not in ["objects", "cad_del", "admin_del", "zouit", "ter_zone"]:
            logger.warning(f"Получен неверный тип тематического поиска: {thematic_search}")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": f"Неподдерживаемый тип тематического поиска: {thematic_search}"
            }
        
        # Выполняем поиск
        result = nspd_thematic_search(
            query=query,
            thematic_search=thematic_search,
            north=north,
            east=east,
            south=south,
            west=west
        )
        
        # Проверяем, что получен валидный результат
        if not isinstance(result, dict) or "type" not in result or "features" not in result:
            logger.error(f"Неверный формат результата от функции поиска: {type(result)}")
            return {
                "type": "FeatureCollection",
                "features": [],
                "message": "Ошибка в формате данных от НСПД. Пожалуйста, попробуйте позже."
            }
            
        # Проверяем количество найденных объектов
        feature_count = len(result.get("features", []))
        logger.info(f"Найдено объектов: {feature_count}")
        
        return result
    except Exception as e:
        logger.exception(f"Необработанная ошибка при выполнении тематического поиска через GET: {str(e)}")
        # Возвращаем пустую коллекцию вместо ошибки 500
        return {
            "type": "FeatureCollection",
            "features": [],
            "message": "Произошла ошибка при поиске. Пожалуйста, попробуйте позже."
        }

@router.get("/nspd/fallback/", response_model=FeatureCollection)
async def nspd_fallback():
    """
    Возвращает заглушку с пустыми данными в формате FeatureCollection,
    когда основной API НСПД недоступен
    """
    return get_fallback_response() 