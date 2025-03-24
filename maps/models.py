from django.db import models

# Create your models here.

class MapLayer(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    source_type = models.CharField(max_length=50)  # vector, raster, etc.
    source_url = models.URLField()
    style = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class MapView(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    center_lat = models.FloatField()
    center_lng = models.FloatField()
    zoom = models.FloatField()
    layers = models.ManyToManyField(MapLayer)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
