from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import json
import os
from pathlib import Path

from app.database import get_db
from app.api.schemas.map_schemas import (
    MapLayer, MapLayerCreate, MapLayerUpdate, 
    MapView, MapViewCreate, MapViewUpdate
)
from app.api.services.map_service import (
    get_map_layers, get_map_layer, create_map_layer, update_map_layer, delete_map_layer,
    get_map_views, get_map_view, create_map_view, update_map_view, delete_map_view,
    get_all_available_layers, get_layer_by_id
)

router = APIRouter(tags=["maps"])

# Добавляем эндпоинт для получения всех доступных слоев (НСПД и статические)
@router.get("/maps/available-layers/", response_model=List[MapLayer])
async def read_available_layers(db: Session = Depends(get_db)):
    """Получить все доступные слои, включая слои из НСПД и статические слои"""
    return get_all_available_layers(db)

# Новый эндпоинт для получения данных слоя по его ID
@router.get("/maps/layer-data/{layer_id}")
async def read_layer_data(layer_id: str, db: Session = Depends(get_db)):
    """Получить данные слоя (GeoJSON) по ID слоя, включая слои из НСПД и статические слои"""
    layer_data = get_layer_by_id(db, layer_id)
    if layer_data is None:
        raise HTTPException(status_code=404, detail=f"Слой с ID {layer_id} не найден")
    return layer_data

# Эндпоинты для работы со слоями карты
@router.get("/maps/layers/", response_model=List[MapLayer])
async def read_map_layers(db: Session = Depends(get_db)):
    """Получить все слои карты"""
    try:
        # Для обеспечения обратной совместимости с фронтендом
        # Возвращаем слои в формате, который ожидает фронтенд
        layers = get_all_available_layers(db)
        return layers
    except Exception as e:
        # Логирование ошибки
        print(f"Ошибка при получении слоев: {str(e)}")
        # Возвращаем пустой список в случае ошибки
        return []

@router.get("/maps/layers/{layer_id}", response_model=MapLayer)
async def read_map_layer(layer_id: int, db: Session = Depends(get_db)):
    """Получить слой карты по ID"""
    db_layer = get_map_layer(db, layer_id)
    if db_layer is None:
        raise HTTPException(status_code=404, detail="Слой не найден")
    return db_layer

@router.post("/maps/layers/", response_model=MapLayer, status_code=status.HTTP_201_CREATED)
async def create_layer(layer: MapLayerCreate, db: Session = Depends(get_db)):
    """Создать новый слой карты"""
    return create_map_layer(db, layer)

@router.put("/maps/layers/{layer_id}", response_model=MapLayer)
async def update_layer(layer_id: int, layer: MapLayerUpdate, db: Session = Depends(get_db)):
    """Обновить существующий слой карты"""
    db_layer = update_map_layer(db, layer_id, layer)
    if db_layer is None:
        raise HTTPException(status_code=404, detail="Слой не найден")
    return db_layer

@router.delete("/maps/layers/{layer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layer(layer_id: int, db: Session = Depends(get_db)):
    """Удалить слой карты"""
    result = delete_map_layer(db, layer_id)
    if not result:
        raise HTTPException(status_code=404, detail="Слой не найден")
    return None

# Эндпоинты для работы с представлениями карты
@router.get("/maps/views/", response_model=List[MapView])
async def read_map_views(db: Session = Depends(get_db)):
    """Получить все представления карты"""
    return get_map_views(db)

@router.get("/maps/views/{view_id}", response_model=MapView)
async def read_map_view(view_id: int, db: Session = Depends(get_db)):
    """Получить представление карты по ID"""
    db_view = get_map_view(db, view_id)
    if db_view is None:
        raise HTTPException(status_code=404, detail="Представление не найдено")
    return db_view

@router.post("/maps/views/", response_model=MapView, status_code=status.HTTP_201_CREATED)
async def create_view(view: MapViewCreate, db: Session = Depends(get_db)):
    """Создать новое представление карты"""
    return create_map_view(db, view)

@router.put("/maps/views/{view_id}", response_model=MapView)
async def update_view(view_id: int, view: MapViewUpdate, db: Session = Depends(get_db)):
    """Обновить существующее представление карты"""
    db_view = update_map_view(db, view_id, view)
    if db_view is None:
        raise HTTPException(status_code=404, detail="Представление не найдено")
    return db_view

@router.delete("/maps/views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_view(view_id: int, db: Session = Depends(get_db)):
    """Удалить представление карты"""
    result = delete_map_view(db, view_id)
    if not result:
        raise HTTPException(status_code=404, detail="Представление не найдено")
    return None

# Новый эндпоинт для загрузки статического GeoJSON слоя
@router.post("/maps/upload-layer/", status_code=status.HTTP_201_CREATED)
async def upload_static_layer(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Загрузить статический GeoJSON слой на сервер"""
    # Проверка типа файла
    if not file.filename.endswith('.geojson'):
        raise HTTPException(
            status_code=400,
            detail="Поддерживаются только файлы формата GeoJSON (.geojson)"
        )
    
    # Проверка содержимого GeoJSON
    try:
        # Читаем JSON из файла
        content = await file.read()
        geojson_data = json.loads(content.decode('utf-8'))
        
        # Проверяем, что это валидный GeoJSON
        if 'type' not in geojson_data or (
            geojson_data['type'] != 'FeatureCollection' and 
            geojson_data['type'] != 'Feature'
        ):
            raise ValueError("Файл не является валидным GeoJSON")
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Ошибка при обработке файла: {str(e)}"
        )
    
    # Генерируем безопасное имя файла
    original_filename = file.filename
    filename_base = os.path.splitext(original_filename)[0]
    # Заменяем пробелы на подчеркивания
    safe_filename = f"{filename_base.replace(' ', '_')}.geojson"
    
    # Определяем директорию для сохранения
    static_paths = ["/app/static/layers", "static/layers"]
    save_path = None
    
    for path in static_paths:
        if os.path.exists(os.path.dirname(path)):
            save_path = Path(path) / safe_filename
            # Создаем директорию, если она не существует
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            break
    
    if save_path is None:
        raise HTTPException(
            status_code=500,
            detail="Не удалось определить директорию для сохранения"
        )
    
    # Сохраняем файл
    try:
        with open(save_path, "wb") as f:
            # Перематываем файл в начало
            await file.seek(0)
            # Читаем и записываем содержимое
            f.write(await file.read())
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка при сохранении файла: {str(e)}"
        )
    
    # Создаем метаданные слоя
    layer_id = f"static_{filename_base.replace(' ', '_')}"
    layer_name = name if name else filename_base.replace('_', ' ').title()
    layer_description = description if description else f"Статический слой из файла {original_filename}"
    
    layer = MapLayer(
        id=layer_id,
        name=layer_name,
        description=layer_description,
        source_type="static",
        source_url=f"/static/layers/{safe_filename}",
        style={"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
    )
    
    return {
        "success": True,
        "message": "Слой успешно загружен",
        "layer": layer
    } 