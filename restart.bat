@echo off
echo "Перезапуск MGIS OGD с чистой средой..."

echo "Остановка и удаление существующих контейнеров..."
docker-compose down -v

echo "Удаление образов..."
docker-compose rm -f

echo "Сборка образов заново..."
docker-compose build --no-cache

echo "Запуск контейнеров..."
docker-compose up -d

echo ""
echo "Проект запущен! Доступен по адресу:"
echo "http://localhost"
echo ""
echo "Для проверки логов выполните:"
echo "docker-compose logs -f"
echo "" 