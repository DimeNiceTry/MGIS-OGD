from rest_framework import serializers
from .models import MapLayer, MapView

class MapLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MapLayer
        fields = '__all__'

class MapViewSerializer(serializers.ModelSerializer):
    layers = MapLayerSerializer(many=True, read_only=True)

    class Meta:
        model = MapView
        fields = '__all__' 