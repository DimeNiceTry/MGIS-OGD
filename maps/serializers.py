from rest_framework import serializers
from .models import MapLayer, MapView, SearchableObject

class MapLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MapLayer
        fields = '__all__'

class MapViewSerializer(serializers.ModelSerializer):
    layers = MapLayerSerializer(many=True, read_only=True)

    class Meta:
        model = MapView
        fields = '__all__'

class SearchableObjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchableObject
        fields = ['id', 'name', 'object_type', 'geometry', 'properties'] 