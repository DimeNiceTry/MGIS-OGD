from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MapLayerViewSet, MapViewViewSet

router = DefaultRouter()
router.register(r'layers', MapLayerViewSet)
router.register(r'views', MapViewViewSet)

urlpatterns = [
    path('', include(router.urls)),
] 