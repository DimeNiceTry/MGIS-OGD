from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.core.exceptions import ValidationError
from django.db.models import Q
from .models import MapLayer, MapView, SearchableObject
import json
import requests
import logging
import urllib3

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

@require_http_methods(["GET"])
def get_map_layers(request):
    layers = list(MapLayer.objects.values())
    return JsonResponse({'layers': layers})

@require_http_methods(["GET"])
def get_map_views(request):
    views = list(MapView.objects.values())
    return JsonResponse({'views': views})

@require_http_methods(["GET"])
def thematic_search(request):
    logger.debug(f"Получен запрос тематического поиска: {request.GET}")
    
    query = request.GET.get('query', '')
    thematic_search = request.GET.get('thematicSearch', '')
    
    logger.debug(f"Параметры запроса - Query: {query}, ThematicSearch: {thematic_search}")
    
    # Словарь соответствий для тематического поиска
    THEMATIC_SEARCH_MAPPING = {
        "objects": 1,
        "cad_del": 2,
        "admin_del": 4,
        "zouit": 5,
        "ter_zone": 7
    }
    
    try:
        # Получаем ID тематического поиска
        thematic_search_id = THEMATIC_SEARCH_MAPPING.get(thematic_search)
        if thematic_search_id is None:
            logger.error(f"Неизвестный thematicSearch: {thematic_search}")
            return JsonResponse({'error': f'Unknown thematicSearch: {thematic_search}'}, status=400)
        
        logger.debug(f"Преобразован thematicSearch в ID: {thematic_search_id}")
        
        # Формируем URL для запроса к NSPD
        base_url = "https://nspd.gov.ru/api/geoportal/v2/search/geoportal"
        params = {
            "query": query,
            "limit": 200,
            "thematicSearchId": thematic_search_id,
        }
        
        logger.debug(f"Сформированный URL для запроса к NSPD: {base_url} с параметрами {params}")
        
        # Делаем запрос к NSPD с заголовками и увеличенным таймаутом
        logger.debug("Отправка запроса к NSPD API...")
        response = requests.get(
            base_url,
            params=params,
            headers=NSPD_HEADERS,
            verify=False,
            timeout=60
        )
        logger.debug(f"Получен ответ от NSPD API. Статус: {response.status_code}")
        
        response.raise_for_status()
        
        # Получаем данные
        data = response.json()
        logger.debug(f"Успешно получены данные от NSPD API")
        
        return JsonResponse(data)
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Ошибка при запросе к NSPD API: {str(e)}")
        logger.error(f"Тип ошибки: {type(e).__name__}")
        return JsonResponse({'error': f"Error requesting NSPD API: {str(e)}"}, status=500)
    except json.JSONDecodeError as e:
        logger.error(f"Ошибка декодирования ответа NSPD: {str(e)}")
        logger.error(f"Содержимое ответа: {response.text}")
        return JsonResponse({'error': f"Invalid JSON response: {str(e)}"}, status=500)
    except Exception as e:
        logger.error(f"Неожиданная ошибка: {str(e)}")
        logger.error(f"Тип ошибки: {type(e).__name__}")
        return JsonResponse({'error': f"Unexpected error: {str(e)}"}, status=500)
