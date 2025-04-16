# Инструкция по развертыванию MGIS OGD PWA на сервере

Эта инструкция описывает процесс развертывания приложения MGIS OGD PWA на виртуальной машине с использованием Docker и Docker Compose.

## Предварительные требования

На сервере должно быть установлено:

- Docker: версия 20.10.x или выше
- Docker Compose: версия 2.x или выше
- Git (опционально, для клонирования репозитория)

## Шаги развертывания

### 1. Подготовка сервера

1. Обновите пакеты:
```bash
sudo apt update && sudo apt upgrade -y
```

2. Установите Docker и Docker Compose (если еще не установлены):
```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. Добавьте текущего пользователя в группу docker (чтобы избежать использования sudo при каждой команде docker):
```bash
sudo usermod -aG docker $USER
```

4. Перезайдите в систему или выполните:
```bash
newgrp docker
```

### 2. Копирование файлов проекта на сервер

Вариант 1: Клонирование репозитория (если проект размещен на GitHub/GitLab):
```bash
git clone <URL-РЕПОЗИТОРИЯ> /path/to/app
cd /path/to/app
```

Вариант 2: Копирование архива проекта:
```bash
# На локальной машине
tar -czvf mgis-ogd.tar.gz /path/to/local/project

# Копирование архива на сервер
scp mgis-ogd.tar.gz user@server:/path/to/

# На сервере
mkdir -p /path/to/app
tar -xzvf mgis-ogd.tar.gz -C /path/to/app
cd /path/to/app
```

### 3. Настройка проекта

1. Убедитесь, что файл .env существует и содержит правильные значения:
```bash
cat .env
```

Файл должен содержать:
```
DB_NAME=mgis_ogd
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=django-insecure-9e8u3894nv98u234bv9834nvb934bxv983 
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:80,http://localhost,http://127.0.0.1:3000,http://127.0.0.1:80,http://127.0.0.1,*
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,*
```

**Важно**: Лучше изменить SECRET_KEY на собственный секретный ключ, а также добавить в ALLOWED_HOSTS и CORS_ALLOWED_ORIGINS IP-адрес или домен вашего сервера.

### 4. Запуск приложения

1. Соберите и запустите контейнеры:
```bash
docker-compose up -d --build
```

2. Проверьте, что все контейнеры запустились:
```bash
docker-compose ps
```

Вы должны увидеть три работающих контейнера: backend, frontend и nginx.

3. Приложение должно быть доступно по адресу http://your-server-ip

### 5. Обслуживание

- **Просмотр логов**:
```bash
docker-compose logs -f  # Все логи
docker-compose logs -f backend  # Только логи бэкенда
docker-compose logs -f frontend  # Только логи фронтенда
docker-compose logs -f nginx  # Только логи Nginx
```

- **Перезапуск всех сервисов**:
```bash
docker-compose restart
```

- **Остановка всех сервисов**:
```bash
docker-compose down
```

- **Обновление приложения** (после изменений в коде):
```bash
git pull  # если репозиторий был клонирован
docker-compose down
docker-compose up -d --build
```

### 6. Резервное копирование

1. Для создания резервной копии базы данных:
```bash
docker-compose exec backend python manage.py dumpdata > backup.json
```

2. Для сохранения всех данных приложения (включая медиа-файлы):
```bash
tar -czvf mgis-ogd-backup.tar.gz .
```

### 7. Устранение неполадок

- **Проблема**: Один из контейнеров не запускается.
  **Решение**: Проверьте логи контейнера: `docker-compose logs <container_name>`

- **Проблема**: Ошибка 502 Bad Gateway при обращении к приложению.
  **Решение**: Убедитесь, что бэкенд-сервер запущен: `docker-compose ps` и проверьте его логи.

- **Проблема**: Изменения в коде не отображаются после обновления.
  **Решение**: Убедитесь, что контейнеры пересобираются: `docker-compose down && docker-compose up -d --build`

### 8. Настройка домена и HTTPS (опционально)

Для настройки домена:

1. Настройте DNS-записи вашего домена, чтобы они указывали на IP-адрес сервера.

2. Отредактируйте `nginx/simple_nginx.conf`:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    # ... остальные настройки остаются без изменений ...
}
```

3. Перезапустите контейнер Nginx:
```bash
docker-compose restart nginx
```

Для настройки HTTPS с Let's Encrypt:

1. Установите certbot:
```bash
sudo apt-get update
sudo apt-get install certbot -y
```

2. Получите сертификат:
```bash
sudo certbot certonly --standalone -d your-domain.com
```

3. Создайте директорию для сертификатов и скопируйте их:
```bash
mkdir -p ./nginx/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/key.pem
sudo chmod 644 ./nginx/ssl/*.pem
```

4. Обновите `nginx/simple_nginx.conf`:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # ... остальные настройки от прежней конфигурации ...
}
```

5. Обновите `docker-compose.yml`, добавив новый volume для SSL-сертификатов:
```yaml
services:
  nginx:
    # ... существующие настройки ...
    volumes:
      # ... существующие volumes ...
      - ./nginx/ssl:/etc/nginx/ssl
```

6. Перезапустите контейнеры:
```bash
docker-compose down
docker-compose up -d --build
```

## Заключение

После выполнения этих шагов ваше приложение MGIS OGD PWA должно быть успешно развернуто на сервере и доступно через браузер. Для дополнительной настройки и оптимизации работы сервера обратитесь к документации соответствующих компонентов.

Если у вас возникли проблемы при развертывании, обратитесь к документации Docker, Docker Compose или специфическим документам по развертыванию Django и React приложений. 