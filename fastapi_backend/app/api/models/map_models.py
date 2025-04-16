from sqlalchemy import Column, Integer, String, Float, ForeignKey, Table, DateTime, JSON, text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

# Таблица связи для many-to-many отношения между слоями и представлениями
map_view_layers = Table(
    "map_view_layers",
    Base.metadata,
    Column("map_view_id", Integer, ForeignKey("map_views.id"), primary_key=True),
    Column("map_layer_id", Integer, ForeignKey("map_layers.id"), primary_key=True),
)

class MapLayer(Base):
    """Модель для слоев карты"""
    __tablename__ = "map_layers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    source_type = Column(String)  # vector, raster, etc.
    source_url = Column(String)  # URL или локальный путь
    style = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Отношение к представлениям
    views = relationship("MapView", secondary=map_view_layers, back_populates="layers")

class MapView(Base):
    """Модель для представлений карты"""
    __tablename__ = "map_views"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    center_lat = Column(Float)
    center_lng = Column(Float)
    zoom = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Отношение к слоям
    layers = relationship("MapLayer", secondary=map_view_layers, back_populates="views")

class SearchableObject(Base):
    """Модель для поисковых объектов"""
    __tablename__ = "searchable_objects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    object_type = Column(String, index=True)  # objects, cad_del, admin_del, zouit, ter_zone
    geometry = Column(JSON)
    properties = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 