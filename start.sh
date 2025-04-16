#!/bin/bash

echo "Запуск MGIS OGD через Docker Compose..."

echo "Остановка и удаление существующих контейнеров..."
docker-compose down

echo "Сборка образов..."
docker-compose build

echo "Запуск контейнеров..."
docker-compose up -d

echo ""
echo "Проект запущен! Доступен по адресу:"
echo "http://localhost"
echo ""
echo "Для остановки проекта выполните:"
echo "docker-compose down" 