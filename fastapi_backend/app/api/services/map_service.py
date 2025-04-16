from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.api.models.map_models import MapLayer, MapView, SearchableObject
from app.api.schemas.map_schemas import MapLayerCreate, MapLayerUpdate, MapViewCreate, MapViewUpdate

def get_map_layers(db: Session) -> List[MapLayer]:
    """Получает все слои карты из базы данных"""
    return db.query(MapLayer).all()

def get_map_layer(db: Session, layer_id: int) -> Optional[MapLayer]:
    """Получает слой карты по ID"""
    return db.query(MapLayer).filter(MapLayer.id == layer_id).first()

def create_map_layer(db: Session, layer: MapLayerCreate) -> MapLayer:
    """Создает новый слой карты"""
    db_layer = MapLayer(
        name=layer.name,
        description=layer.description,
        source_type=layer.source_type,
        source_url=layer.source_url,
        style=layer.style
    )
    db.add(db_layer)
    db.commit()
    db.refresh(db_layer)
    return db_layer

def update_map_layer(db: Session, layer_id: int, layer: MapLayerUpdate) -> Optional[MapLayer]:
    """Обновляет существующий слой карты"""
    db_layer = get_map_layer(db, layer_id)
    if not db_layer:
        return None
    
    # Обновляем только предоставленные поля
    update_data = layer.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_layer, key, value)
    
    db.commit()
    db.refresh(db_layer)
    return db_layer

def delete_map_layer(db: Session, layer_id: int) -> bool:
    """Удаляет слой карты"""
    db_layer = get_map_layer(db, layer_id)
    if not db_layer:
        return False
    
    db.delete(db_layer)
    db.commit()
    return True

def get_map_views(db: Session) -> List[MapView]:
    """Получает все представления карты из базы данных"""
    return db.query(MapView).all()

def get_map_view(db: Session, view_id: int) -> Optional[MapView]:
    """Получает представление карты по ID"""
    return db.query(MapView).filter(MapView.id == view_id).first()

def create_map_view(db: Session, view: MapViewCreate) -> MapView:
    """Создает новое представление карты"""
    db_view = MapView(
        name=view.name,
        description=view.description,
        center_lat=view.center_lat,
        center_lng=view.center_lng,
        zoom=view.zoom
    )
    db.add(db_view)
    db.commit()
    db.refresh(db_view)
    
    # Добавляем слои, если они указаны
    if view.layer_ids:
        layers = db.query(MapLayer).filter(MapLayer.id.in_(view.layer_ids)).all()
        db_view.layers = layers
        db.commit()
        db.refresh(db_view)
    
    return db_view

def update_map_view(db: Session, view_id: int, view: MapViewUpdate) -> Optional[MapView]:
    """Обновляет существующее представление карты"""
    db_view = get_map_view(db, view_id)
    if not db_view:
        return None
    
    # Обновляем основные поля
    update_data = view.dict(exclude={"layer_ids"}, exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_view, key, value)
    
    # Обновляем связи со слоями, если они указаны
    if view.layer_ids is not None:
        layers = db.query(MapLayer).filter(MapLayer.id.in_(view.layer_ids)).all()
        db_view.layers = layers
    
    db.commit()
    db.refresh(db_view)
    return db_view

def delete_map_view(db: Session, view_id: int) -> bool:
    """Удаляет представление карты"""
    db_view = get_map_view(db, view_id)
    if not db_view:
        return False
    
    db.delete(db_view)
    db.commit()
    return True

def get_all_available_layers(db: Session) -> List[MapLayer]:
    """
    Получает все доступные слои, включая статические слои и слои из НСПД
    
    Возвращает список объектов MapLayer
    """
    from pathlib import Path
    
    # 1. Получение слоев из БД (если используются)
    try:
        db_layers = get_map_layers(db)
    except Exception as e:
        print(f"Ошибка при получении слоев из БД: {str(e)}")
        db_layers = []
    
    # 2. Поиск статических слоев в директории static/layers
    static_layers = []
    static_dirs = [
        Path("/app/fastapi_backend/static/layers"), 
        Path("/app/static/layers"),
        Path("static/layers"),
        Path("fastapi_backend/static/layers")
    ]
    
    static_dir = None
    for dir_path in static_dirs:
        if dir_path.exists():
            static_dir = dir_path
            print(f"Найдена директория со статичными слоями: {static_dir}")
            break
    else:
        print("Не найдена директория со статичными слоями.")
    
    if static_dir and static_dir.exists():
        for file_path in static_dir.glob("*.geojson"):
            layer_id = f"static_{file_path.stem}"
            layer_name = file_path.stem.replace("_", " ").title()
            
            # Создаем слой без сохранения в БД
            static_layer = MapLayer(
                id=layer_id,
                name=layer_name,
                description=f"Статический слой из файла {file_path.name}",
                source_type="static",
                source_url=f"/static/layers/{file_path.name}",
                style={"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
            )
            static_layers.append(static_layer)
            print(f"Добавлен статический слой: {layer_id} из файла {file_path}")
    
    # 3. Добавление слоев НСПД (если нужны дополнительные слои НСПД)
    nspd_layers = [
        MapLayer(
            id="nspd_cad_del",
            name="Кадастровые деления",
            description="Кадастровые деления из НСПД",
            source_type="nspd",
            source_url="/api/nspd/thematic-search/?thematic_search=cad_del&query=",
            style={"fillColor": "#FF5733", "fillOpacity": 0.5, "outlineColor": "#000"}
        ),
        MapLayer(
            id="nspd_admin_del",
            name="Административные деления",
            description="Административные деления из НСПД",
            source_type="nspd",
            source_url="/api/nspd/thematic-search/?thematic_search=admin_del&query=",
            style={"fillColor": "#33FF57", "fillOpacity": 0.5, "outlineColor": "#000"}
        ),
        MapLayer(
            id="nspd_zouit",
            name="ЗОУИТ",
            description="Зоны с особыми условиями использования территорий из НСПД",
            source_type="nspd",
            source_url="/api/nspd/thematic-search/?thematic_search=zouit&query=",
            style={"fillColor": "#3357FF", "fillOpacity": 0.5, "outlineColor": "#000"}
        ),
        MapLayer(
            id="nspd_ter_zone",
            name="Территориальные зоны",
            description="Территориальные зоны из НСПД",
            source_type="nspd",
            source_url="/api/nspd/thematic-search/?thematic_search=ter_zone&query=",
            style={"fillColor": "#AA33FF", "fillOpacity": 0.5, "outlineColor": "#000"}
        )
    ]
    
    # Объединяем все слои
    all_layers = db_layers + static_layers + nspd_layers
    
    return all_layers

def get_layer_by_id(db: Session, layer_id: str) -> Optional[Dict[str, Any]]:
    """
    Получает данные слоя по его ID. Работает с разными типами слоев:
    - Слои из БД
    - Статические слои из файлов
    - Слои НСПД
    
    Возвращает данные слоя в формате GeoJSON или None, если слой не найден
    """
    import os
    import json
    from pathlib import Path
    
    # Проверяем, это слой из БД?
    try:
        if isinstance(layer_id, int) or layer_id.isdigit():
            db_layer = get_map_layer(db, int(layer_id))
            if db_layer:
                # Если это слой из БД, проверяем его тип
                if db_layer.source_type == "db_geojson":
                    # Если данные хранятся прямо в БД
                    return db_layer.properties
                else:
                    # Возвращаем метаданные слоя для фронтенда
                    return {
                        "id": db_layer.id,
                        "name": db_layer.name,
                        "description": db_layer.description,
                        "source_type": db_layer.source_type,
                        "source_url": db_layer.source_url,
                        "style": db_layer.style
                    }
    except (ValueError, TypeError):
        pass
    
    # Проверяем, это статический слой?
    if layer_id.startswith("static_"):
        filename = f"{layer_id[7:]}.geojson"  # Убираем префикс "static_"
        
        # Проверяем путь в контейнере и вне его
        paths_to_check = [
            Path(f"/app/fastapi_backend/static/layers/{filename}"),
            Path(f"/app/static/layers/{filename}"),
            Path(f"static/layers/{filename}"),
            Path(f"fastapi_backend/static/layers/{filename}")
        ]
        
        for file_path in paths_to_check:
            # Добавим логирование для отладки
            print(f"Проверяем путь к файлу: {file_path}, существует: {file_path.exists()}")
            if file_path.exists():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        geojson_data = json.load(f)
                    print(f"Успешно загружен файл: {file_path}")
                    return geojson_data
                except (json.JSONDecodeError, IOError) as e:
                    print(f"Ошибка чтения файла {file_path}: {str(e)}")
                    continue
        
        # Если не нашли файл напрямую, возвращаем информацию о слое
        # для прямой загрузки через URL фронтендом
        print(f"Файл не найден в локальных путях, возвращаем метаданные для {layer_id}")
        return {
            "id": layer_id,
            "name": layer_id[7:].replace("_", " ").title(),
            "description": f"Статический слой из файла {filename}",
            "source_type": "static",
            "source_url": f"/static/layers/{filename}",
            "style": {"fillColor": "#0080ff", "fillOpacity": 0.5, "outlineColor": "#000"}
        }
    
    # Проверяем, это слой НСПД?
    if layer_id.startswith("nspd_"):
        from app.api.services.nspd_service import thematic_search, get_fallback_response
        
        # Извлекаем тип тематического поиска из ID
        thematic_type = layer_id[5:]  # Убираем префикс "nspd_"
        
        # Проверяем, валидный ли тип
        valid_types = ["cad_del", "admin_del", "zouit", "ter_zone"]
        if thematic_type in valid_types:
            try:
                # Выполняем пустой запрос для получения данных
                result = thematic_search("", thematic_type)
                return result
            except Exception as e:
                print(f"Ошибка получения данных из НСПД: {str(e)}")
                # Возвращаем заглушку в случае ошибки
                return get_fallback_response()
    
    # Если слой не найден
    return None 