from django.urls import path
from .views import get_map_layers, get_map_views, thematic_search, nspd_fallback

urlpatterns = [
    path('maps/layers/', get_map_layers, name='map-layers'),
    path('maps/views/', get_map_views, name='map-views'),
    path('nspd/thematic-search/', thematic_search, name='thematic-search'),
    path('nspd/fallback/', nspd_fallback, name='nspd-fallback'),
] 