from django.contrib import admin
from .models import MapLayer, MapView

@admin.register(MapLayer)
class MapLayerAdmin(admin.ModelAdmin):
    list_display = ('name', 'source_type', 'created_at', 'updated_at')
    search_fields = ('name', 'description')
    list_filter = ('source_type', 'created_at')

@admin.register(MapView)
class MapViewAdmin(admin.ModelAdmin):
    list_display = ('name', 'center_lat', 'center_lng', 'zoom', 'created_at')
    search_fields = ('name', 'description')
    filter_horizontal = ('layers',)
