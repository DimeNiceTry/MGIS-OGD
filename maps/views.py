from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.response import Response
from .models import MapLayer, MapView
from .serializers import MapLayerSerializer, MapViewSerializer

# Create your views here.

class MapLayerViewSet(viewsets.ModelViewSet):
    queryset = MapLayer.objects.all()
    serializer_class = MapLayerSerializer

class MapViewViewSet(viewsets.ModelViewSet):
    queryset = MapView.objects.all()
    serializer_class = MapViewSerializer
