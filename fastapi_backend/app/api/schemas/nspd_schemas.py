from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Union

class ThematicSearchRequest(BaseModel):
    """Схема для запроса тематического поиска в НСПД"""
    query: str
    thematic_search: str  # objects, cad_del, admin_del, zouit, ter_zone
    north: Optional[float] = None
    east: Optional[float] = None
    south: Optional[float] = None
    west: Optional[float] = None

class Feature(BaseModel):
    """Схема для представления GeoJSON Feature"""
    type: str = "Feature"
    geometry: Dict[str, Any]
    properties: Dict[str, Any] = Field(default_factory=dict)
    id: Optional[str] = None

class FeatureCollection(BaseModel):
    """Схема для представления GeoJSON FeatureCollection"""
    type: str = "FeatureCollection"
    features: List[Feature] = []
    fallback: Optional[bool] = False
    message: Optional[str] = None 