from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

# Базовые модели для слоев
class MapLayerBase(BaseModel):
    name: str
    description: Optional[str] = None
    source_type: str  # vector, raster, etc.
    source_url: str
    style: Dict[str, Any] = Field(default_factory=dict)

class MapLayerCreate(MapLayerBase):
    pass

class MapLayerUpdate(MapLayerBase):
    name: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None

class MapLayer(MapLayerBase):
    id: Any  # Может быть строкой или числом
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Базовые модели для представлений
class MapViewBase(BaseModel):
    name: str
    description: Optional[str] = None
    center_lat: float
    center_lng: float
    zoom: float

class MapViewCreate(MapViewBase):
    layer_ids: List[int] = []

class MapViewUpdate(MapViewBase):
    name: Optional[str] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    zoom: Optional[float] = None
    layer_ids: Optional[List[int]] = None

class MapView(MapViewBase):
    id: int
    layers: List[MapLayer] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Модели для поисковых объектов
class SearchableObjectBase(BaseModel):
    name: str
    object_type: str  # objects, cad_del, admin_del, zouit, ter_zone
    geometry: Dict[str, Any]
    properties: Dict[str, Any] = Field(default_factory=dict)

class SearchableObjectCreate(SearchableObjectBase):
    pass

class SearchableObjectUpdate(SearchableObjectBase):
    name: Optional[str] = None
    object_type: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    properties: Optional[Dict[str, Any]] = None

class SearchableObject(SearchableObjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True 