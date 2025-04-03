# Настройка Nginx для проекта MGIS OGD PWA

В этом документе описывается, как настроить и запустить проект MGIS OGD PWA с использованием Nginx в качестве веб-сервера.

## Структура проекта

Проект состоит из:
- Django бэкенд (API)
- React фронтенд (PWA)
- Nginx веб-сервер

## Предварительные требования

- Docker
- Docker Compose
- Git

## Быстрый старт

1. Клонируйте репозиторий:
```bash
git clone [URL репозитория]
cd MGIS-OGD
```

2. Создайте файл .env в корне проекта:
```bash
SECRET_KEY=ваш_секретный_ключ_django
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1
```

3. Запустите проект с помощью Docker Compose:
```bash
docker-compose up -d
```

4. Приложение будет доступно по адресу: http://localhost

## Пути и эндпоинты

- Фронтенд: `http://localhost/`
- API бэкенда: `http://localhost/api/`
- Админка Django: `http://localhost/admin/`
- Статические файлы: `http://localhost/static/`
- Медиа-файлы: `http://localhost/media/`

## Управление контейнерами

- Запуск всех сервисов: `docker-compose up -d`
- Остановка всех сервисов: `docker-compose down`
- Просмотр логов: `docker-compose logs -f`
- Перезапуск одного сервиса: `docker-compose restart <service_name>`

## Настройка для продакшена

### Смена домена

Для настройки под ваш домен отредактируйте файл `nginx/nginx.conf`:

```nginx
server {
    listen 80;
    server_name ваш-домен.ru;
    ...
}
```

### SSL (HTTPS)

Для настройки HTTPS добавьте в `nginx/nginx.conf`:

```nginx
server {
    listen 443 ssl;
    server_name ваш-домен.ru;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # ... остальные настройки ...
}
```

Обновите `docker-compose.yml`, добавив новый volume для SSL-сертификатов.

## Обслуживание

### Резервное копирование данных

```bash
# Создание резервной копии базы данных
docker-compose exec backend python manage.py dumpdata > backup.json
```

### Обновление проекта

```bash
git pull
docker-compose build
docker-compose up -d
```

## Устранение неполадок

### Проверка работоспособности сервисов

```bash
docker-compose ps
```

### Проверка логов

```bash
docker-compose logs -f nginx
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Распространенные проблемы

1. **Ошибка 502 Bad Gateway** - Убедитесь, что бэкенд-сервер работает и доступен.
2. **Статические файлы не загружаются** - Проверьте пути в `nginx/nginx.conf` и тома в `docker-compose.yml`. 