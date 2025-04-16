# MGIS OGD PWA

PWA приложение для работы с картами, использующее React, FastAPI и MapLibre GL JS.

## Установка для разработки

### Бэкенд (FastAPI)

1. Перейдите в директорию fastapi_backend:
```bash
cd fastapi_backend
```

2. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # для Linux/Mac
venv\Scripts\activate     # для Windows
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Запустите сервер разработки:
```bash
uvicorn main:app --reload
```

Документация API будет доступна по адресу: http://localhost:8000/docs

### Фронтенд (React)

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите сервер разработки:
```bash
npm start
```

## Развертывание на сервере

Для простого развертывания на сервере используйте Docker и Docker Compose:

1. Убедитесь, что на сервере установлены:
   - Docker
   - Docker Compose

2. Скопируйте файлы проекта на сервер:
```bash
git clone <URL-РЕПОЗИТОРИЯ> /path/to/app
cd /path/to/app
```

3. Запустите контейнеры:
```bash
docker-compose up -d
```

4. Приложение будет доступно по адресу http://your-server-ip

### Настройка домена (опционально)

Если вы хотите использовать свой домен, отредактируйте файл nginx/simple_nginx.conf:
```nginx
server {
    listen 80;
    server_name ваш-домен.ru;
    # ... Остальные настройки ...
}
```

### Настройка HTTPS (опционально)

Для настройки HTTPS с Let's Encrypt:

1. Установите certbot на сервер:
```bash
apt-get update
apt-get install certbot
```

2. Получите сертификат:
```bash
certbot certonly --webroot -w /path/to/app/frontend/build -d ваш-домен.ru
```

3. Обновите nginx/simple_nginx.conf, добавив SSL:
```nginx
server {
    listen 443 ssl;
    server_name ваш-домен.ru;
    ssl_certificate /etc/letsencrypt/live/ваш-домен.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ваш-домен.ru/privkey.pem;
    # ... Остальные настройки ...
}
```

4. Перезапустите Nginx:
```bash
docker-compose restart nginx
```

## Технологии

- Backend: FastAPI 0.110.0
- Frontend: React 18
- Карты: MapLibre GL JS
- База данных: SQLAlchemy с поддержкой PostgreSQL/SQLite
- PWA функциональность
- Docker и Docker Compose для развертывания 

nginx:
  ports:
    - "0.0.0.0:35080:80"  # Убедитесь, что используется именно 0.0.0.0, а не 127.0.0.1 